// Signing someone in who opened the helpdesk from AskMira.
//
// AskMira sends the browser to /sso/askmira#token=… (the fragment never
// reaches a server log). That page posts the token here; if it is good —
// signed with the company's connection secret, not used before, naming
// someone who may use the helpdesk for that company — we answer with a
// one-time sign-in code that the page turns into a session. The person never
// types a second password.
//
// Someone new (joined since the last sync) gets their account now. A super
// admin of the helpdesk, or someone whose account here belongs to another
// company, is never signed in this way.

import {
  BRAND,
  EMAIL_RE,
  belongsTo,
  claimsOf,
  clean,
  db,
  domainOf,
  httpError,
  normEmail,
  personByEmail,
  spendOnce,
} from "./core"
import { adopt, createPerson, managedRow } from "./people"

export async function launch(token: string) {
  let found
  try {
    found = await claimsOf(token, "launch")
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      throw httpError(403, `Your company is not connected to ${BRAND} any more. Ask your HR admin.`)
    }
    throw err
  }
  const { claims, org } = found
  await spendOnce(claims, "This sign-in link was already used. Open the helpdesk again from AskMira.")
  if (claims.ext && String(claims.ext) !== org.id) {
    throw httpError(403, `Your company is not connected to ${BRAND} any more. Ask your HR admin.`)
  }
  if (org.status !== "active") {
    throw httpError(403, `${org.name} is switched off in ${BRAND}. Ask your IT team.`)
  }
  const email = normEmail(claims.email)
  const role = String(claims.role ?? "")
  if (!EMAIL_RE.test(email) || (role !== "admin" && role !== "user")) {
    throw httpError(403, `AskMira did not give you access to ${BRAND}.`)
  }
  const askmiraUserId = clean(claims.sub, 64)

  let person = await personByEmail(email)
  if (!person) {
    if (domainOf(email) !== org.domain) {
      throw httpError(
        403,
        `${BRAND} admits ${org.name}'s people with an address on ${org.domain}. Ask your IT team.`
      )
    }
    person = await createPerson(org, { id: askmiraUserId, email, name: clean(claims.name), role })
  } else {
    if (person.role === "superadmin") {
      throw httpError(409, `This is a ${BRAND} super admin account. Sign in to ${BRAND} directly.`)
    }
    if (!(await belongsTo(person, org))) {
      throw httpError(409, `This email has a ${BRAND} account with another company.`)
    }
    if ((await managedRow(org, person.id))?.deactivated_at) {
      throw httpError(403, `Your ${BRAND} account has been switched off.`)
    }
    person = await adopt(org, person, askmiraUserId, role)
  }

  // A one-time code for this person, turned into a session by the page. Nothing is emailed.
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email: person.email })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) {
    console.error("[AskMira] sign-in link failed:", error)
    throw httpError(502, `${BRAND} could not sign you in just now. Try again in a minute.`)
  }
  console.log(`[AskMira] ${person.email} signed in from AskMira (${org.domain})`)
  return { token_hash: hashed, type: data.properties.verification_type || "magiclink" }
}
