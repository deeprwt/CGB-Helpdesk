// The company's people, as AskMiraa sends them.
//
// AskMiraa is where the company keeps its people, so it decides who may use
// the helpdesk for a connected organization: it sends the whole roster when
// it connects, every night, and whenever its admin presses Sync. Here:
//
// The connected organization is a client company inside one tenant. Its
// roster here is the accounts with `users.organization_id` = that company.
//
// * Someone new gets an account in the company's tenant, linked to the company
//   (no password: they come in from AskMiraa).
// * Someone who already has an account in the same tenant but no company is
//   linked to this company. Someone with an account in another tenant (one
//   tenant per person) or with another company here is skipped, with a reason.
// * Their name, employee code, department and designation follow AskMiraa.
// * Roles here are this helpdesk's own: AskMiraa never makes anyone an engineer
//   or an admin, because those roles reach every organization the helpdesk
//   serves (every client's assets, for one). Someone new starts as a user;
//   HR's view of their own company in AskMiraa needs no role here (queries.ts).
//   Anyone an earlier version of this connection made an admin, for being HR
//   in AskMiraa, gets back the role they had before.
// * Someone AskMiraa manages who drops out of the roster (they left) can't
//   sign in any more. People added here directly are never touched, and
//   neither is a super admin.

import {
  BRAND,
  EMAIL_RE,
  allRows,
  clean,
  chunks,
  db,
  eachLimited,
  httpError,
  normEmail,
  type Organization,
  type Person,
} from "./core"

/** How long "switched off" lasts: in effect, until AskMiraa lets them back in. */
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

const EXISTING_COLUMNS =
  "id, email, full_name, role, phone, tenant_id, organization_id, employee_id, department, designation"

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
 * Undoes an earlier version of this connection, which made HR admins here.
 * Returns the role to give back (or null to leave the role alone) and what is
 * still to be remembered: nothing, once given back or changed here since.
 */
export function roleFor(current: string, before: string | null): { role: string | null; before: string | null } {
  if (before && current === "admin") return { role: before, before: null }
  return { role: null, before: null }
}

/**
 * A new account for someone AskMiraa sent: in the company's tenant, linked to
 * the company, as a user. No password: they arrive from AskMiraa.
 */
export async function createPerson(
  org: Organization,
  person: Pick<Incoming, "id" | "email" | "name" | "role"> & Partial<Incoming>
): Promise<Person> {
  const name = person.name || person.email
  // Everyone starts as a user: the IT team makes engineers and admins here.
  const role = "user"
  const { data, error } = await db().auth.admin.createUser({
    email: person.email,
    email_confirm: true,
    user_metadata: { ...nameParts(name), full_name: name },
    // The sign-up trigger makes a profile only for accounts that carry a tenant.
    app_metadata: { askmira: true, tenant_id: org.tenant_id, role },
  })
  if (error || !data?.user) {
    throw httpError(409, `Could not create a ${BRAND} account: ${error?.message ?? "no user"}`.slice(0, 200))
  }
  const id = data.user.id
  // The sign-up trigger usually makes this row already; fill in what AskMiraa knows.
  const profile: Record<string, unknown> = {
    id,
    email: person.email,
    full_name: name,
    role,
    tenant_id: org.tenant_id,
    organization_id: org.id,
  }
  if (person.employee_code) profile.employee_id = person.employee_code
  if (person.department) profile.department = person.department
  if (person.designation) profile.designation = person.designation
  const { error: profileError } = await db().from("users").upsert(profile, { onConflict: "id" })
  if (profileError) {
    // No half-made accounts: without a profile it could sign in to nothing anyway.
    await db().auth.admin.deleteUser(id).catch(() => {})
    throw profileError
  }
  const { error: managedError } = await db().from("askmira_people").upsert(
    {
      organization_id: org.id,
      user_id: id,
      askmira_user_id: person.id,
      role_before_grant: null,
      deactivated_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" }
  )
  if (managedError) throw managedError
  return {
    id,
    email: person.email,
    full_name: name,
    role,
    phone: null,
    tenant_id: org.tenant_id,
    organization_id: org.id,
  }
}

/** One person's managed row, if AskMiraa manages them in this organization. */
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
 * Why an existing account can't be one of this company's people, or null if it
 * can: it must be in the company's tenant (one tenant per person), and either
 * already with this company or with none yet (then it is linked to this one).
 */
export function refusalFor(org: Organization, person: Pick<Person, "role" | "tenant_id" | "organization_id">) {
  if (person.role === "superadmin") return `a ${BRAND} super admin`
  if (person.tenant_id !== org.tenant_id) return `already has a ${BRAND} account with another organisation`
  if (person.organization_id && person.organization_id !== org.id) {
    return `works for another company in ${BRAND}`
  }
  return null
}

/**
 * Brings an existing account in step with AskMiraa: linked to this company if
 * it had none, managed by AskMiraa from now on (and any admin role an earlier
 * version granted goes back). Used when someone signs in from AskMiraa; the
 * caller has checked `refusalFor`.
 */
export async function adopt(
  org: Organization,
  person: Person,
  askmiraUserId: string | null
): Promise<Person> {
  const row = await managedRow(org, person.id)
  const next = roleFor(person.role, row?.role_before_grant ?? null)
  const patch: Record<string, unknown> = {}
  if (next.role) patch.role = next.role
  if (!person.organization_id) patch.organization_id = org.id
  if (Object.keys(patch).length) {
    const { error } = await db()
      .from("users")
      .update(patch)
      .eq("id", person.id)
      .eq("tenant_id", org.tenant_id)
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
  return {
    ...person,
    role: next.role ?? person.role,
    organization_id: person.organization_id ?? org.id,
  }
}

/** The full roster from AskMiraa: add, update and switch off to match it. */
export async function syncPeople(org: Organization, body: Record<string, unknown>) {
  const people = Array.isArray(body.users) ? body.users : []
  const complete = body.complete !== false
  if (complete && people.length === 0) {
    // Never switch everybody off because a roster arrived empty.
    throw httpError(422, "The roster was empty, so nobody was changed.")
  }

  // The company's people here: whoever works for it, whatever their address.
  const existing = await allRows<Existing>((from, to) =>
    db()
      .from("users")
      .select(EXISTING_COLUMNS)
      .eq("organization_id", org.id)
      .eq("tenant_id", org.tenant_id)
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
  const valid: Incoming[] = []

  for (const raw of people) {
    const person = incoming(raw)
    if ("reason" in person) {
      skipped.push(person)
      continue
    }
    if (seen.has(person.email)) continue
    seen.add(person.email)
    valid.push(person)
  }

  // Addresses not on the company's roster here may still have an account: in
  // this tenant without a company (linked now), or elsewhere (skipped).
  const others = new Map<string, Existing>()
  const unknown = valid.map((p) => p.email).filter((email) => !byEmail.has(email))
  for (const batch of chunks(unknown, 100)) {
    const { data, error } = await db().from("users").select(EXISTING_COLUMNS).in("email", batch)
    if (error) throw error
    for (const p of (data ?? []) as Existing[]) others.set(normEmail(p.email), p)
  }

  for (const person of valid) {
    const current = byEmail.get(person.email) ?? others.get(person.email)
    if (!current) {
      toCreate.push(person)
      continue
    }
    const refusal = refusalFor(org, current)
    if (refusal) {
      skipped.push({ email: person.email, reason: refusal })
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
    const next = roleFor(current.role, row?.role_before_grant ?? null)
    if (next.role) patch.role = next.role
    // In this tenant without a company yet: they work for this one now.
    if (!current.organization_id) patch.organization_id = org.id
    if (Object.keys(patch).length) {
      const { error } = await db()
        .from("users")
        .update(patch)
        .eq("id", current.id)
        .eq("tenant_id", org.tenant_id)
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
    // Only people still with this company here: someone the IT team has since
    // moved to another company is no longer this connection's to switch off.
    const leavers = [...managed.values()].filter((row) => {
      const current = byId.get(row.user_id)
      return !row.deactivated_at && !kept.has(row.user_id) && !!current && current.role !== "superadmin"
    })
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
    `[AskMiraa] roster for ${org.name} (${org.id}): ${created} created, ${updated} updated, ${deactivated} switched off, ${skipped.length} skipped`
  )
  return { created, updated, deactivated, skipped: skipped.slice(0, 200) }
}
