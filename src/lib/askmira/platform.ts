import "server-only"

// AskMiraa's platform sets a company up here (AskMiraa → Platform → Connected tools).
//
// AskMiraa's super admin holds the helpdesk's platform key, the same value as
// ASKMIRA_PLATFORM_SECRET here. With it — never with a company's own secret —
// AskMiraa may:
//
//   POST /api/integrations/askmira/platform/ping           check the key
//   POST /api/integrations/askmira/platform/organizations  find a client company here
//   POST /api/integrations/askmira/platform/provision      create or attach one
//
// A connected organization is a client company inside one helpdesk tenant (the
// IT team serving it). New companies go into the tenant named by
// ASKMIRA_PLATFORM_TENANT (its slug), or the only active tenant when there is
// just one. `provision` creates the company there, or attaches the company the
// super admin picked, and answers with that company's own secret, exactly as
// Allow does (connect.ts). It gives nobody a role: the people sync that follows
// adds the company's people as users, and the IT team here grants any other.
//
// It never makes a second company with the same name in a tenant: it answers
// 409 "existing" naming it, and AskMiraa's super admin links that one.

import crypto from "node:crypto"

import { NextResponse } from "next/server"

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
  tenantActive,
  verify,
  type Claims,
  type Organization,
} from "./core"

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/

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

type Tenant = { id: string; name: string; slug: string }

/** The helpdesk tenant new companies from AskMiraa go into. */
async function homeTenant(): Promise<Tenant> {
  const slug = (process.env.ASKMIRA_PLATFORM_TENANT ?? "").trim().toLowerCase()
  let q = db().from("tenants").select("id, name, slug").eq("status", "active")
  if (slug) q = q.eq("slug", slug)
  const { data, error } = await q.limit(2)
  if (error) throw error
  const rows = (data ?? []) as Tenant[]
  if (slug && rows.length === 0) {
    throw refuse(409, `The helpdesk has no active tenant "${slug}" (ASKMIRA_PLATFORM_TENANT).`)
  }
  if (rows.length !== 1) {
    throw refuse(
      409,
      "The helpdesk has more than one tenant: set ASKMIRA_PLATFORM_TENANT to the slug of the one AskMiraa's companies belong to."
    )
  }
  return rows[0]
}

/** Each company with its tenant, its admins here and the AskMiraa workspace it is connected to. */
async function describe(orgs: Organization[]) {
  if (orgs.length === 0) return []
  const ids = orgs.map((o) => o.id)
  const [{ data: links, error }, { data: admins }, { data: tenants }] = await Promise.all([
    db().from("askmira_links").select("organization_id, askmira_tenant_id").in("organization_id", ids),
    db().from("users").select("email, organization_id").eq("role", "admin").in("organization_id", ids),
    db().from("tenants").select("id, name").in("id", [...new Set(orgs.map((o) => o.tenant_id))]),
  ])
  if (error) throw error
  const tenantName = new Map((tenants ?? []).map((t) => [t.id as string, t.name as string]))
  return orgs.map((org) => ({
    ref: org.id,
    name: tenantName.get(org.tenant_id) ? `${org.name} (${tenantName.get(org.tenant_id)})` : org.name,
    admins: (admins ?? [])
      .filter((a) => a.organization_id === org.id)
      .slice(0, 5)
      .map((a) => normEmail(a.email)),
    connected_to: links?.find((l) => l.organization_id === org.id)?.askmira_tenant_id ?? null,
  }))
}

async function organizations(body: Record<string, unknown>) {
  const q = clean(body.q, 120)
  if (!q || q.length < 2) throw refuse(422, "Type at least two letters.")
  // "someone@acme.com" finds the company whose domain is acme.com.
  // Dots stay (domains); wildcards and the filter syntax PostgREST would read go.
  const term = (q.includes("@") ? q.split("@")[1] || q : q)
    .toLowerCase()
    .replace(/[%_*\\,():"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  if (term.length < 2) throw refuse(422, "Type at least two letters.")
  const { data, error } = await db()
    .from("organizations")
    .select(ORGANIZATION_COLUMNS)
    .eq("status", "active")
    .or(`name.ilike.%${term}%,domain.ilike.%${term}%`)
    .order("name")
    .limit(20)
  if (error) throw error
  const orgs = (data ?? []).filter((o) => o.tenant_id).map((o) => asOrganization(o))
  return { organizations: await describe(orgs) }
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

function answer(org: Organization, secret: string, created: boolean) {
  return {
    product: PRODUCT,
    brand: BRAND,
    secret,
    external_ref: org.id,
    organization: org.name,
    created,
    // Nobody is made an admin here; the people sync adds the company's people as users.
    admin_created: false,
  }
}

async function orgBy(column: "id", value: string): Promise<Organization | null> {
  const { data, error } = await db()
    .from("organizations")
    .select(ORGANIZATION_COLUMNS)
    .eq(column, value)
    .maybeSingle()
  if (error) throw error
  return data && data.tenant_id ? asOrganization(data) : null
}

/** A company of that tenant with the same name (case-insensitive) or, when given, the same domain. */
async function sameCompany(tenantId: string, name: string, domain: string | null) {
  const rows = await allRows((from, to) =>
    db().from("organizations").select(ORGANIZATION_COLUMNS).eq("tenant_id", tenantId).order("id").range(from, to)
  )
  const wanted = name.trim().toLowerCase()
  return rows
    .map((o) => asOrganization(o as Record<string, unknown>))
    .filter((o) => o.name.trim().toLowerCase() === wanted || (domain !== null && o.domain === domain))
    .slice(0, 5)
}

async function provision(body: Record<string, unknown>, claims: Claims) {
  if (!canConnect()) {
    throw refuse(409, "Set ASKMIRA_LINK_SECRET (at least 32 characters) on the helpdesk first.")
  }
  // A captured request can't be sent again to swap the key AskMiraa holds.
  await spendOnce(claims, "This request was already carried out.")
  const tenantId = String(body.tenant_id ?? "").toLowerCase()
  const company = obj(body.company)
  const admin = obj(body.admin)
  const name = clean(company.name, 200) ?? clean(body.tenant_name, 200)
  const email = normEmail(admin.email)
  const ref = clean(body.organization_ref, 120)
  if (!UUID_RE.test(tenantId) || !name || !EMAIL_RE.test(email)) {
    throw refuse(422, "AskMiraa sent an incomplete company.")
  }
  const askmira = { id: tenantId, name: clean(body.tenant_name, 200) ?? name, origin: originOf(body.askmira_origin) }

  // Attach the company the super admin picked.
  if (ref) {
    const org = UUID_RE.test(ref) ? await orgBy("id", ref) : null
    if (!org) throw refuse(404, "No such organization in the helpdesk.")
    if (org.status !== "active" || !(await tenantActive(org.tenant_id))) {
      throw refuse(409, `${org.name} is switched off in the helpdesk.`)
    }
    const { data: link } = await db()
      .from("askmira_links")
      .select("askmira_tenant_id")
      .eq("organization_id", org.id)
      .maybeSingle()
    if (link && link.askmira_tenant_id !== tenantId) {
      throw refuse(409, `${org.name} is connected to another AskMiraa workspace.`, { code: "taken" })
    }
    const secret = await connect(org, askmira)
    console.log(`[AskMiraa] platform attached ${org.name} (${org.id}) to workspace ${tenantId}`)
    return answer(org, secret, false)
  }

  // Already connected here (AskMiraa lost its key, or asked twice): the same company, a new key.
  const { data: linked } = await db()
    .from("askmira_links")
    .select("organization_id")
    .eq("askmira_tenant_id", tenantId)
    .maybeSingle()
  if (linked) {
    const org = await orgBy("id", linked.organization_id)
    if (org) return answer(org, await connect(org, askmira), false)
  }

  const tenant = await homeTenant()
  // The domain is informational here; it helps find the company again.
  const given = String(company.domain ?? "").trim().toLowerCase()
  const fromEmail = email.split("@")[1] ?? ""
  const domain = DOMAIN_RE.test(given) ? given : DOMAIN_RE.test(fromEmail) ? fromEmail : null
  const existing = await sameCompany(tenant.id, name, domain)
  if (existing.length > 0) {
    throw refuse(409, `${tenant.name} already has ${existing[0].name} in the helpdesk.`, {
      code: "existing",
      organizations: await describe(existing),
    })
  }
  const { data: made, error } = await db()
    .from("organizations")
    .insert({ tenant_id: tenant.id, name, domain, status: "active" })
    .select(ORGANIZATION_COLUMNS)
    .single()
  if (error?.code === "23505") {
    const raced = await sameCompany(tenant.id, name, domain)
    throw refuse(409, `${tenant.name} already has ${name} in the helpdesk.`, {
      code: "existing",
      organizations: await describe(raced),
    })
  }
  if (error) throw error
  const org = asOrganization(made)
  const secret = await connect(org, askmira)
  console.log(`[AskMiraa] platform created ${org.name} (${org.id}) in ${tenant.slug} for workspace ${tenantId}`)
  return answer(org, secret, true)
}

/** POST platform/{ping,organizations,provision} — AskMiraa's platform (use=platform). */
export async function platformRoute(req: Request, action: string) {
  try {
    const { body, claims } = await platformAssertion(req)
    if (action === "ping") {
      let message = `${BRAND} is ready.`
      let ready = canConnect()
      if (!ready) message = "Set ASKMIRA_LINK_SECRET (at least 32 characters) on the helpdesk first."
      else {
        try {
          const tenant = await homeTenant()
          message = `${BRAND} is ready. New companies go into ${tenant.name}.`
        } catch (err) {
          if (!(err instanceof HttpError)) throw err
          ready = false
          message = err.message
        }
      }
      return NextResponse.json({ product: PRODUCT, brand: BRAND, ready, message })
    }
    if (action === "organizations") return NextResponse.json(await organizations(body))
    if (action === "provision") return NextResponse.json(await provision(body, claims))
    throw refuse(404, "Not found")
  } catch (err) {
    if (err instanceof HttpError) {
      const extra = err instanceof Refusal ? err.extra : {}
      return NextResponse.json({ ...extra, error: err.message }, { status: err.status })
    }
    if (isMissingTable(err)) {
      console.error("[AskMiraa] the AskMiraa tables are missing:", err)
      return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 })
    }
    console.error("[AskMiraa] platform request failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
