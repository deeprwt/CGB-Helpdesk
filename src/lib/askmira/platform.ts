import "server-only"

// AskMiraa's platform sets a company up here (AskMiraa → Platform → Connected tools).
//
// AskMiraa's super admin holds the helpdesk's platform key, the same value as
// ASKMIRA_PLATFORM_SECRET here. With it — never with a company's own secret —
// AskMiraa may:
//
//   POST /api/integrations/askmira/platform/ping           check the key
//   POST /api/integrations/askmira/platform/organizations  find a tenant here
//   POST /api/integrations/askmira/platform/provision      create or attach one
//
// An AskMiraa organisation is a TENANT here, never a client company inside
// someone else's tenant. `provision` creates the tenant (with the helpdesk's
// standard categories, priorities and SLAs, as the super admin's "new tenant"
// does), one company inside it for the people AskMiraa sends, and invites
// AskMiraa's admin as the tenant's admin. Or it attaches the tenant the super
// admin picked. Either way it answers with the connection's own secret,
// exactly as Allow does (connect.ts).
//
// It never makes a second tenant with the same name unasked: it answers 409
// "existing" naming it, and AskMiraa's super admin links that one or asks for
// a new one anyway (`create_new`).

import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { InviteError, invitePerson } from "@/lib/invite"
import { seedTenantDefaults } from "@/lib/itsm-server"

import {
  BRAND,
  EMAIL_RE,
  HttpError,
  ORGANIZATION_COLUMNS,
  PRODUCT,
  SETUP_MESSAGE,
  UUID_RE,
  allRows,
  asOrganization,
  canConnect,
  clean,
  db,
  derive,
  isMissingTable,
  normEmail,
  safeEqual,
  sha256hex,
  spendOnce,
  verify,
  type Claims,
  type Organization,
} from "./core"

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/

/** A refusal AskMiraa acts on: its `code` and what it names travel beside the message. */
class Refusal extends HttpError {
  constructor(
    status: number,
    message: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(status, message)
  }
}

const refuse = (status: number, message: string, extra?: Record<string, unknown>) =>
  new Refusal(status, message, extra)

function platformKey() {
  return process.env.ASKMIRA_PLATFORM_SECRET ?? ""
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** The platform's call: signed with the platform key, use=platform, bound to this body. */
async function platformAssertion(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer())
  const key = platformKey()
  // Not set up for it: as if these endpoints did not exist.
  if (key.length < 32) throw refuse(404, "Not found")
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")
  if (!match) throw refuse(401, "Missing AskMiraa assertion.")
  const claims = verify(match[1].trim(), key)
  if (!claims || claims.use !== "platform" || claims.sub !== "platform") {
    throw refuse(401, "This AskMiraa platform key is not the one set here.")
  }
  if (!safeEqual(String(claims.bh ?? ""), sha256hex(raw))) {
    throw refuse(401, "The assertion does not match this request.")
  }
  let body: Record<string, unknown>
  try {
    body = obj(JSON.parse(raw.toString("utf8")))
  } catch {
    throw refuse(400, "The request is not JSON.")
  }
  return { claims, body }
}

type Tenant = { id: string; name: string; slug: string; status: string }
const TENANT_COLUMNS = "id, name, slug, status"

/** Letters and digits only: "Artbox Solutions" and "ArtboxSolutions" are the same name. */
const nameKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Each tenant with its admins and the AskMiraa workspace it is connected to. */
async function describe(tenants: Tenant[]) {
  if (tenants.length === 0) return []
  const ids = tenants.map((t) => t.id)
  const [{ data: admins }, { data: orgs }] = await Promise.all([
    db().from("users").select("email, tenant_id").eq("role", "admin").in("tenant_id", ids),
    db().from("organizations").select("id, tenant_id").in("tenant_id", ids),
  ])
  const orgIds = (orgs ?? []).map((o) => o.id as string)
  const { data: links, error } = orgIds.length
    ? await db().from("askmira_links").select("organization_id, askmira_tenant_id").in("organization_id", orgIds)
    : { data: [], error: null }
  if (error) throw error
  const tenantOfOrg = new Map((orgs ?? []).map((o) => [o.id as string, o.tenant_id as string]))
  return tenants.map((tenant) => ({
    ref: tenant.id,
    name: tenant.name,
    admins: (admins ?? [])
      .filter((a) => a.tenant_id === tenant.id)
      .slice(0, 5)
      .map((a) => normEmail(a.email)),
    connected_to:
      (links ?? []).find((l) => tenantOfOrg.get(l.organization_id) === tenant.id)?.askmira_tenant_id ?? null,
  }))
}

async function organizations(body: Record<string, unknown>) {
  const q = clean(body.q, 120)
  if (!q || q.length < 2) throw refuse(422, "Type at least two letters.")
  const found = new Map<string, Tenant>()
  // An admin's email finds the tenant that person is in.
  if (EMAIL_RE.test(normEmail(q))) {
    const { data: person } = await db().from("users").select("tenant_id").eq("email", normEmail(q)).maybeSingle()
    if (person?.tenant_id) {
      const { data } = await db().from("tenants").select(TENANT_COLUMNS).eq("id", person.tenant_id).maybeSingle()
      if (data) found.set(data.id, data as Tenant)
    }
  }
  // Wildcards and the filter syntax PostgREST would read go.
  const term = q
    .toLowerCase()
    .replace(/[%_*\\,():"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  if (term.length >= 2) {
    const { data, error } = await db()
      .from("tenants")
      .select(TENANT_COLUMNS)
      .or(`name.ilike.%${term}%,slug.ilike.%${term.replace(/\s+/g, "-")}%`)
      .order("name")
      .limit(20)
    if (error) throw error
    for (const tenant of (data ?? []) as Tenant[]) found.set(tenant.id, tenant)
  }
  return { organizations: await describe([...found.values()].filter((t) => t.status === "active")) }
}

/** Connect the company to that AskMiraa workspace: a fresh nonce, so a fresh secret. */
async function connect(org: Organization, askmira: { id: string; name: string | null; origin: string | null }) {
  // One AskMiraa workspace per company here, and the other way round.
  const { error: gone } = await db()
    .from("askmira_links")
    .delete()
    .eq("askmira_tenant_id", askmira.id)
    .neq("organization_id", org.id)
  if (gone) throw gone
  const nonce = crypto.randomBytes(32).toString("base64url")
  const { error } = await db().from("askmira_links").upsert(
    {
      organization_id: org.id,
      askmira_tenant_id: askmira.id,
      askmira_name: askmira.name,
      askmira_origin: askmira.origin,
      secret_nonce: nonce,
      connected_by: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  )
  if (error) throw error
  return derive(org.id, nonce)
}

function originOf(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""))
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null
  } catch {
    return null
  }
}

function answer(
  tenant: Pick<Tenant, "name">,
  org: Organization,
  secret: string,
  created: boolean,
  admin: { created: boolean; note?: string } = { created: false }
) {
  return {
    product: PRODUCT,
    brand: BRAND,
    secret,
    external_ref: org.id,
    organization: tenant.name,
    created,
    admin_created: admin.created,
    ...(admin.note ? { admin_note: admin.note } : {}),
  }
}

async function orgById(id: string): Promise<Organization | null> {
  const { data, error } = await db().from("organizations").select(ORGANIZATION_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw error
  return data && data.tenant_id ? asOrganization(data) : null
}

async function tenantById(id: string): Promise<Tenant | null> {
  const { data, error } = await db().from("tenants").select(TENANT_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw error
  return (data as Tenant | null) ?? null
}

/**
 * The company inside the tenant that AskMiraa's people belong to: the one named
 * like the tenant, else the tenant's only company, else a new one.
 */
async function homeCompany(tenant: Tenant, domain: string | null): Promise<Organization> {
  const rows = await allRows((from, to) =>
    db().from("organizations").select(ORGANIZATION_COLUMNS).eq("tenant_id", tenant.id).order("id").range(from, to)
  )
  const orgs = rows.map((o) => asOrganization(o as Record<string, unknown>))
  const same = orgs.find((o) => nameKey(o.name) === nameKey(tenant.name))
  if (same) return same
  if (orgs.length === 1) return orgs[0]
  const { data, error } = await db()
    .from("organizations")
    .insert({ tenant_id: tenant.id, name: tenant.name, domain, status: "active" })
    .select(ORGANIZATION_COLUMNS)
    .single()
  if (error?.code === "23505") {
    const again = await homeCompany(tenant, domain)
    return again
  }
  if (error) throw error
  return asOrganization(data)
}

/** Tenants that look like this company: the same name (ignoring spaces and case) or the same short name. */
async function sameTenants(name: string, slug: string | null): Promise<Tenant[]> {
  const rows = await allRows((from, to) =>
    db().from("tenants").select(TENANT_COLUMNS).order("id").range(from, to)
  )
  return (rows as Tenant[])
    .filter((t) => nameKey(t.name) === nameKey(name) || (slug !== null && t.slug === slug))
    .slice(0, 5)
}

/** A free short name for the new tenant: AskMiraa's, else one made from the name, numbered if taken. */
async function freeSlug(wanted: string | null, name: string) {
  const base =
    (wanted && SLUG_RE.test(wanted) ? wanted : null) ??
    (name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "company")
  const start = SLUG_RE.test(base) ? base : `${base}-co`
  const { data, error } = await db().from("tenants").select("slug").ilike("slug", `${start}%`)
  if (error) throw error
  const taken = new Set((data ?? []).map((t) => t.slug as string))
  if (!taken.has(start)) return start
  for (let n = 2; n < 1000; n++) {
    if (!taken.has(`${start}-${n}`)) return `${start}-${n}`
  }
  return `${start}-${crypto.randomBytes(3).toString("hex")}`
}

/** A new tenant for the company, with the helpdesk's defaults, its company and its admin. */
async function createTenant(params: {
  name: string
  slug: string | null
  domain: string | null
  admin: { email: string; name: string }
}) {
  const slug = await freeSlug(params.slug, params.name)
  const { data, error } = await db()
    .from("tenants")
    .insert({ name: params.name, slug, status: "active" })
    .select(TENANT_COLUMNS)
    .single()
  if (error) throw error
  const tenant = data as Tenant
  let org: Organization | null = null
  try {
    // Starter categories, priority matrix, SLA policies and business hours.
    await seedTenantDefaults(db(), tenant.id)
    org = await homeCompany(tenant, params.domain)
    let admin: { created: boolean; note?: string }
    try {
      const invited = await invitePerson(db(), {
        email: params.admin.email,
        fullName: params.admin.name,
        role: "admin",
        tenant,
        organizationId: org.id,
        inviter: { id: "", full_name: "AskMiraa", email: "" },
      })
      admin = { created: true, note: invited.emailed ? undefined : "The invitation email could not be sent." }
    } catch (err) {
      // One tenant per person: someone already in another tenant can't be its admin too.
      if (!(err instanceof InviteError) || err.status !== 409) throw err
      admin = {
        created: false,
        note: `${params.admin.email} already has a ${BRAND} login in another tenant, so they were not made this tenant's admin.`,
      }
    }
    return { tenant, org, admin }
  } catch (err) {
    // Nothing half made: the super admin can simply try again.
    if (org) await db().from("organizations").delete().eq("id", org.id)
    await db().from("tenants").delete().eq("id", tenant.id)
    throw err
  }
}

async function provision(body: Record<string, unknown>, claims: Claims) {
  if (!canConnect()) {
    throw refuse(409, "Set ASKMIRA_LINK_SECRET (at least 32 characters) on the helpdesk first.")
  }
  // A captured request can't be sent again to swap the key AskMiraa holds.
  await spendOnce(claims, "This request was already carried out.")
  const tenantId = String(body.tenant_id ?? "").toLowerCase()
  const company = obj(body.company)
  const adminIn = obj(body.admin)
  const name = clean(company.name, 120) ?? clean(body.tenant_name, 120)
  const email = normEmail(adminIn.email)
  const ref = clean(body.organization_ref, 120)
  if (!UUID_RE.test(tenantId) || !name || !EMAIL_RE.test(email)) {
    throw refuse(422, "AskMiraa sent an incomplete company.")
  }
  const askmira = { id: tenantId, name: clean(body.tenant_name, 200) ?? name, origin: originOf(body.askmira_origin) }
  const given = String(company.domain ?? "").trim().toLowerCase()
  const fromEmail = email.split("@")[1] ?? ""
  const domain = DOMAIN_RE.test(given) ? given : DOMAIN_RE.test(fromEmail) ? fromEmail : null

  // Attach the tenant the super admin picked.
  if (ref) {
    const tenant = UUID_RE.test(ref) ? await tenantById(ref) : null
    if (!tenant) throw refuse(404, "No such tenant in the helpdesk.")
    if (tenant.status !== "active") throw refuse(409, `${tenant.name} is suspended in the helpdesk.`)
    const [mine] = await describe([tenant])
    if (mine.connected_to && mine.connected_to !== tenantId) {
      throw refuse(409, `${tenant.name} is connected to another AskMiraa workspace.`, { code: "taken" })
    }
    const org = await homeCompany(tenant, domain)
    const secret = await connect(org, askmira)
    console.log(`[AskMiraa] platform attached tenant ${tenant.slug} to workspace ${tenantId}`)
    return answer(tenant, org, secret, false)
  }

  // Already connected here (AskMiraa lost its key, or asked twice): the same place, a new key.
  const { data: linked } = await db()
    .from("askmira_links")
    .select("organization_id")
    .eq("askmira_tenant_id", tenantId)
    .maybeSingle()
  if (linked) {
    const org = await orgById(linked.organization_id)
    const tenant = org ? await tenantById(org.tenant_id) : null
    if (org && tenant) return answer(tenant, org, await connect(org, askmira), false)
  }

  const slug = clean(company.slug, 63)?.toLowerCase() ?? null
  if (body.create_new !== true) {
    const existing = await sameTenants(name, slug)
    if (existing.length > 0) {
      throw refuse(409, `The helpdesk already has a tenant called ${existing[0].name}.`, {
        code: "existing",
        organizations: await describe(existing),
      })
    }
  }
  const made = await createTenant({ name, slug, domain, admin: { email, name: clean(adminIn.name, 120) ?? email } })
  const secret = await connect(made.org, askmira)
  console.log(`[AskMiraa] platform created tenant ${made.tenant.slug} for workspace ${tenantId}`)
  return answer(made.tenant, made.org, secret, true, made.admin)
}

/** POST platform/{ping,organizations,provision} — AskMiraa's platform (use=platform). */
export async function platformRoute(req: Request, action: string) {
  try {
    const { body, claims } = await platformAssertion(req)
    if (action === "ping") {
      const ready = canConnect()
      return NextResponse.json({
        product: PRODUCT,
        brand: BRAND,
        ready,
        message: ready
          ? `${BRAND} is ready. Each AskMiraa organisation becomes its own tenant.`
          : "Set ASKMIRA_LINK_SECRET (at least 32 characters) on the helpdesk first.",
      })
    }
    if (action === "organizations") return NextResponse.json(await organizations(body))
    if (action === "provision") return NextResponse.json(await provision(body, claims))
    throw refuse(404, "Not found")
  } catch (err) {
    if (err instanceof HttpError) {
      const extra = err instanceof Refusal ? err.extra : {}
      return NextResponse.json({ ...extra, error: err.message }, { status: err.status })
    }
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 500 ? 502 : err.status })
    }
    if (isMissingTable(err)) {
      console.error("[AskMiraa] the AskMiraa tables are missing:", err)
      return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 })
    }
    console.error("[AskMiraa] platform request failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
