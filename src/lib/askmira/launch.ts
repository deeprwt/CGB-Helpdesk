// Signing someone in who opened the helpdesk from AskMiraa.
//
// AskMiraa sends the browser to /sso/askmira#token=… (the fragment never
// reaches a server log). That page posts the token here; if it is good —
// signed with the company's connection secret, not used before, naming
// someone who may use the helpdesk for that company — we answer with a
// one-time sign-in code that the page turns into a session. The person never
// types a second password.
//
// Someone new (joined since the last sync) gets their account now, in the
// company's tenant and linked to the company. Someone with an account in the
// same tenant but no company yet is linked to it. A super admin of the
// helpdesk, someone whose account here is in another tenant (one tenant per
// person), or someone who works for another company here is never signed in
// this way.

import {
  BRAND,
  EMAIL_RE,
  claimsOf,
  clean,
  db,
  httpError,
  normEmail,
  personByEmail,
  spendOnce,
  tenantActive,
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
  await spendOnce(claims, "This sign-in link was already used. Open the helpdesk again from AskMiraa.")
  if (claims.ext && String(claims.ext) !== org.id) {
    throw httpError(403, `Your company is not connected to ${BRAND} any more. Ask your HR admin.`)
  }
  if (org.status !== "active" || !(await tenantActive(org.tenant_id))) {
    throw httpError(403, `${org.name} is switched off in ${BRAND}. Ask your IT team.`)
  }
  const email = normEmail(claims.email)
  const role = String(claims.role ?? "")
  if (!EMAIL_RE.test(email) || (role !== "admin" && role !== "user")) {
    throw httpError(403, `AskMiraa did not give you access to ${BRAND}.`)
  }
  const askmiraUserId = clean(claims.sub, 64)

  let person = await personByEmail(email)
  if (!person) {
    person = await createPerson(org, { id: askmiraUserId, email, name: clean(claims.name), role })
  } else {
    if (person.role === "superadmin") {
      throw httpError(409, `This is a ${BRAND} super admin account. Sign in to ${BRAND} directly.`)
    }
    if (person.tenant_id !== org.tenant_id) {
      throw httpError(409, `This email has a ${BRAND} account with another organisation. Ask your IT team.`)
    }
    if (person.organization_id && person.organization_id !== org.id) {
      throw httpError(409, `This email has a ${BRAND} account with another company. Ask your IT team.`)
    }
    if ((await managedRow(org, person.id))?.deactivated_at) {
      throw httpError(403, `Your ${BRAND} account has been switched off.`)
    }
    // Links the account to this company if it had none yet.
    person = await adopt(org, person, askmiraUserId)
  }

  // A one-time code for this person, turned into a session by the page. Nothing is emailed.
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email: person.email })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) {
    console.error("[AskMiraa] sign-in link failed:", error)
    throw httpError(502, `${BRAND} could not sign you in just now. Try again in a minute.`)
  }
  console.log(`[AskMiraa] ${person.email} signed in from AskMiraa (${org.name}, ${org.id})`)
  return { token_hash: hashed, type: data.properties.verification_type || "magiclink" }
}
