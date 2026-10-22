// The company's people, as AskMira sends them.
//
// AskMira is where the company keeps its people, so it decides who may use
// the helpdesk for a connected organization: it sends the whole roster when
// it connects, every night, and whenever its admin presses Sync. Here:
//
// * Someone new gets an account (no password: they come in from AskMira).
// * Their name, employee code, department and designation follow AskMira.
// * AskMira's role is the least they get. HR in AskMira are admins here; an
//   engineer or admin set up here keeps that role, because IT staff are
//   decided here. If AskMira made someone an admin and they stop being HR,
//   they get back the role they had before.
// * Someone AskMira manages who drops out of the roster (they left) can't
//   sign in any more. People added here directly are never touched, and
//   neither is a super admin.

import {
  BRAND,
  EMAIL_RE,
  allRows,
  clean,
  db,
  domainOf,
  eachLimited,
  escapeLike,
  httpError,
  normEmail,
  type Organization,
  type Person,
} from "./core"

/** How long "switched off" lasts: in effect, until AskMira lets them back in. */
const BANNED = "876000h"

type Incoming = {
  id: string | null
  email: string
  name: string | null
  role: "admin" | "user"
  employee_code: string | null
  department: string | null
  designation: string | null
}

type Existing = Person & {
  employee_id: string | null
  department: string | null
  designation: string | null
}

type Managed = {
  organization_id: string
  user_id: string
  askmira_user_id: string | null
  role_before_grant: string | null
  deactivated_at: string | null
}

function incoming(person: unknown): Incoming | { email: string; reason: string } {
  const given = person && typeof person === "object" ? (person as Record<string, unknown>) : {}
  const email = normEmail(given.email)
  if (!EMAIL_RE.test(email)) return { email, reason: "not a valid email" }
  const role = String(given.role ?? "")
  if (role !== "admin" && role !== "user") {
    return { email, reason: `unknown role ${JSON.stringify(role)}` }
  }
  return {
    id: clean(given.id, 64),
    email,
    name: clean(given.name),
    role,
    employee_code: clean(given.employee_code, 64),
    department: clean(given.department),
    designation: clean(given.designation),
  }
}

function nameParts(name: string) {
  const [first, ...rest] = name.split(/\s+/)
  return { first_name: first ?? "", last_name: rest.join(" ") }
}

/**
 * The role someone should have here now, and the role to give back later.
 * Returns the new role (or null to leave it) and the remembered one.
 */
export function roleFor(
  current: string,
  wanted: "admin" | "user",
  before: string | null
): { role: string | null; before: string | null } {
  if (current === "superadmin") return { role: null, before: null }
  if (wanted === "admin") {
    if (current === "admin") return { role: null, before }
    return { role: "admin", before: current }
  }
  if (before && current === "admin") return { role: before, before: null }
  // Someone here changed their role since AskMira raised it: theirs stands.
  return { role: null, before: current === "admin" ? before : null }
}

/** A new account for someone AskMira sent: no password, they arrive from AskMira. */
export async function createPerson(
  org: Organization,
  person: Pick<Incoming, "id" | "email" | "name" | "role"> & Partial<Incoming>
): Promise<Person> {
  const name = person.name || person.email
  const { data, error } = await db().auth.admin.createUser({
    email: person.email,
    email_confirm: true,
    user_metadata: { ...nameParts(name), full_name: name },
    app_metadata: { askmira: true },
  })
  if (error || !data?.user) {
    throw httpError(409, `Could not create a ${BRAND} account: ${error?.message ?? "no user"}`.slice(0, 200))
  }
  const id = data.user.id
  const role = person.role === "admin" ? "admin" : "user"
  // The sign-up trigger usually makes this row already; fill in what AskMira knows.
  const profile: Record<string, unknown> = { id, email: person.email, full_name: name, role }
  if (person.employee_code) profile.employee_id = person.employee_code
  if (person.department) profile.department = person.department
  if (person.designation) profile.designation = person.designation
  const { error: profileError } = await db().from("users").upsert(profile, { onConflict: "id" })
  if (profileError) throw profileError
  await db()
    .from("user_organization_access")
    .upsert(
      { user_id: id, organization_id: org.id },
      { onConflict: "user_id,organization_id", ignoreDuplicates: true }
    )
  const { error: managedError } = await db().from("askmira_people").upsert(
    {
      organization_id: org.id,
      user_id: id,
      askmira_user_id: person.id,
      role_before_grant: role === "admin" ? "user" : null,
      deactivated_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" }
  )
  if (managedError) throw managedError
  return { id, email: person.email, full_name: name, role, phone: null }
}

/** One person's managed row, if AskMira manages them in this organization. */
export async function managedRow(org: Organization, userId: string): Promise<Managed | null> {
  const { data } = await db()
    .from("askmira_people")
    .select("*")
    .eq("organization_id", org.id)
    .eq("user_id", userId)
    .maybeSingle()
  return (data as Managed | null) ?? null
}

/**
 * Brings an existing account in step with AskMira: its role, and AskMira
 * managing it from now on. Used when someone signs in from AskMira.
 */
export async function adopt(
  org: Organization,
  person: Person,
  askmiraUserId: string | null,
  wanted: "admin" | "user"
): Promise<Person> {
  const row = await managedRow(org, person.id)
  const next = roleFor(person.role, wanted, row?.role_before_grant ?? null)
  if (next.role) {
    const { error } = await db().from("users").update({ role: next.role }).eq("id", person.id)
    if (error) throw error
  }
  const { error } = await db().from("askmira_people").upsert(
    {
      organization_id: org.id,
      user_id: person.id,
      askmira_user_id: askmiraUserId,
      role_before_grant: next.before,
      deactivated_at: row?.deactivated_at ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" }
  )
  if (error) throw error
  return next.role ? { ...person, role: next.role } : person
}

/** The full roster from AskMira: add, update and switch off to match it. */
export async function syncPeople(org: Organization, body: Record<string, unknown>) {
  const people = Array.isArray(body.users) ? body.users : []
  const complete = body.complete !== false
  if (complete && people.length === 0) {
    // Never switch everybody off because a roster arrived empty.
    throw httpError(422, "The roster was empty, so nobody was changed.")
  }

  const existing = await allRows<Existing>((from, to) =>
    db()
      .from("users")
      .select("id, email, full_name, role, phone, employee_id, department, designation")
      .ilike("email", `%@${escapeLike(org.domain)}`)
      .order("id")
      .range(from, to)
  )
  const byEmail = new Map(existing.map((p) => [normEmail(p.email), p]))
  const byId = new Map(existing.map((p) => [p.id, p]))
  const managed = new Map(
    (
      await allRows<Managed>((from, to) =>
        db()
          .from("askmira_people")
          .select("*")
          .eq("organization_id", org.id)
          .order("user_id")
          .range(from, to)
      )
    ).map((row) => [row.user_id, row])
  )

  let created = 0
  let updated = 0
  let deactivated = 0
  const skipped: { email: string; reason: string }[] = []
  const kept = new Set<string>()
  const seen = new Set<string>()
  const toCreate: Incoming[] = []
  const toUpdate: { person: Incoming; current: Existing }[] = []

  for (const raw of people) {
    const person = incoming(raw)
    if ("reason" in person) {
      skipped.push(person)
      continue
    }
    if (seen.has(person.email)) continue
    seen.add(person.email)
    if (domainOf(person.email) !== org.domain) {
      skipped.push({
        email: person.email,
        reason: `not an address on ${org.domain}, the company's domain in ${BRAND}`,
      })
      continue
    }
    const current = byEmail.get(person.email)
    if (!current) toCreate.push(person)
    else if (current.role === "superadmin") {
      skipped.push({ email: person.email, reason: `a ${BRAND} super admin` })
    } else {
      kept.add(current.id)
      toUpdate.push({ person, current })
    }
  }

  const rows: Record<string, unknown>[] = []
  const now = new Date().toISOString()

  await eachLimited(toUpdate, 6, async ({ person, current }) => {
    const row = managed.get(current.id)
    const patch: Record<string, unknown> = {}
    if (person.name && person.name !== current.full_name) patch.full_name = person.name
    if (person.employee_code && person.employee_code !== current.employee_id) {
      patch.employee_id = person.employee_code
    }
    if (person.department && person.department !== current.department) {
      patch.department = person.department
    }
    if (person.designation && person.designation !== current.designation) {
      patch.designation = person.designation
    }
    const next = roleFor(current.role, person.role, row?.role_before_grant ?? null)
    if (next.role) patch.role = next.role
    if (Object.keys(patch).length) {
      const { error } = await db().from("users").update(patch).eq("id", current.id)
      if (error) {
        skipped.push({ email: person.email, reason: "could not be updated just now" })
        return
      }
    }
    const reactivate = Boolean(row?.deactivated_at)
    if (reactivate) {
      const { error } = await db().auth.admin.updateUserById(current.id, { ban_duration: "none" })
      if (error) {
        skipped.push({ email: person.email, reason: "could not be switched back on just now" })
        return
      }
    }
    const changed =
      Object.keys(patch).length > 0 ||
      reactivate ||
      !row ||
      row.askmira_user_id !== person.id ||
      row.role_before_grant !== next.before
    if (changed) {
      updated++
      rows.push({
        organization_id: org.id,
        user_id: current.id,
        askmira_user_id: person.id,
        role_before_grant: next.before,
        deactivated_at: null,
        updated_at: now,
      })
    }
  })

  await eachLimited(toCreate, 6, async (person) => {
    try {
      await createPerson(org, person)
      created++
    } catch (err) {
      skipped.push({
        email: person.email,
        reason: err instanceof Error ? err.message.slice(0, 200) : "could not be created",
      })
    }
  })

  if (complete) {
    const leavers = [...managed.values()].filter(
      (row) => !row.deactivated_at && !kept.has(row.user_id) && byId.get(row.user_id)?.role !== "superadmin"
    )
    await eachLimited(leavers, 6, async (row) => {
      const { error } = await db().auth.admin.updateUserById(row.user_id, { ban_duration: BANNED })
      if (error) return // tried again at the next sync
      deactivated++
      rows.push({ ...row, deactivated_at: now, updated_at: now })
    })
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from("askmira_people")
      .upsert(rows.slice(i, i + 500), { onConflict: "organization_id,user_id" })
    if (error) throw error
  }

  console.log(
    `[AskMira] roster for ${org.domain}: ${created} created, ${updated} updated, ${deactivated} switched off, ${skipped.length} skipped`
  )
  return { created, updated, deactivated, skipped: skipped.slice(0, 200) }
}
