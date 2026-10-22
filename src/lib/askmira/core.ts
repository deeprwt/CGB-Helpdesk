// The link with AskMira, the HRMS a company may run its people in.
//
// An admin of a workspace in AskMira presses Connect there, lands on
// /connect/askmira here, signs in and presses Allow for one organization
// (connect.ts). From then on AskMira's server calls here for that one
// organization only, each call carrying a short-lived HS256 token signed with
// the secret this connection was given (aud "askmira:helpdesk", iss "askmira"):
//
//   POST /api/integrations/askmira/users/sync      use=provision  the company's people (people.ts)
//   POST /api/integrations/askmira/query           use=query      read for one person (queries.ts)
//   POST /api/integrations/askmira/act             use=act        raise a ticket, reply (actions.ts)
//   POST /api/integrations/askmira/connect/token   AskMira swaps the one-time code (PKCE)
//   POST /api/integrations/askmira/connect/revoke  use=revoke     AskMira disconnected
//   POST /api/integrations/askmira/launch          use=launch     sign a person in (launch.ts)
//
// Server-to-server tokens carry `bh`, the SHA-256 of the exact body, so a
// captured token can't be replayed with another body; `act` and `launch`
// tokens also work only once (their `jti`).
//
// Everything here runs on the server with the service role. The tables it
// keeps (supabase/migration_askmira.sql) have row level security on and no
// policies, so no browser can read them.

import crypto from "crypto"
import { after, NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const PRODUCT = "helpdesk"
export const BRAND = "CGB Helpdesk"
export const AUDIENCE = "askmira:helpdesk"
export const ISSUER = "askmira"

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Seconds a token's clock may differ from ours. */
const LEEWAY_S = 10

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const httpError = (status: number, message: string) => new HttpError(status, message)

/* ── The database, as the server ─────────────────────────── */

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return client
}

/** Work that may finish after the answer is sent: notifications and emails. */
let deferTask: (task: () => Promise<unknown>) => void = (task) => after(task)

export function defer(task: () => Promise<unknown>) {
  deferTask(async () => {
    try {
      await task()
    } catch (err) {
      console.error("[AskMira] follow-up failed:", err)
    }
  })
}

/** Tests run these modules outside Next.js, against a database of their own. */
export function replaceForTests(fake: { db?: SupabaseClient; defer?: typeof deferTask }) {
  if (fake.db) client = fake.db
  if (fake.defer) deferTask = fake.defer
}

/** A route's answer: the result as JSON, or `{ error }` with the status we chose. */
export async function respond(work: () => Promise<unknown>) {
  try {
    return NextResponse.json(await work())
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error("[AskMira] request failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/* ── Small helpers ───────────────────────────────────────── */

export const sha256hex = (value: string | Buffer) =>
  crypto.createHash("sha256").update(value).digest("hex")

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function normEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

export function domainOf(email: string) {
  return email.split("@")[1]?.trim().toLowerCase() ?? ""
}

export function clean(value: unknown, max = 200): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim().slice(0, max)
  return text || null
}

/** Text for a PostgREST ilike pattern: its own wildcards and filter syntax removed. */
export function searchText(value: unknown) {
  return String(value ?? "")
    .replace(/[%_*\\,().:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function* chunks<T>(items: T[], size: number) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

/** Runs `work` over `items`, at most `limit` at a time. */
export async function eachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await work(item)
    }
  })
  await Promise.all(lanes)
}

/** Every row a query returns, past PostgREST's page size. `page(from, to)` runs one page. */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < size) return rows
  }
}

/* ── The connection's secret ─────────────────────────────── */

function serverKey() {
  return process.env.ASKMIRA_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
}

export function canConnect() {
  return serverKey().length >= 32
}

/** An organization's AskMira secret: derived here, so the database keeps only the nonce. */
export function derive(organizationId: string, nonce: string) {
  return crypto
    .createHmac("sha256", serverKey())
    .update(`askmira-org:v1:${organizationId}:${nonce}`)
    .digest("hex")
}

/* ── Tokens ──────────────────────────────────────────────── */

export type Use = "provision" | "query" | "act" | "revoke" | "launch"
export type Claims = Record<string, unknown> & { sub?: string; jti?: string; exp?: number }

function part(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(text, "base64url").toString("utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** What a token says, before anyone has checked it. Only used to pick the secret. */
export function peek(token: string): Claims | null {
  const parts = token.split(".")
  return parts.length === 3 ? (part(parts[1]) as Claims | null) : null
}

/** The claims of an HS256 token signed with `secret`, or null. */
export function verify(token: string, secret: string): Claims | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const header = part(parts[0])
  if (!header || header.alg !== "HS256") return null
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest()
  const given = Buffer.from(parts[2], "base64url")
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  const claims = part(parts[1]) as Claims | null
  if (!claims) return null
  const now = Math.floor(Date.now() / 1000)
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    claims.iss !== ISSUER ||
    !audience.includes(AUDIENCE) ||
    typeof claims.exp !== "number" ||
    claims.exp + LEEWAY_S < now ||
    (typeof claims.iat === "number" && claims.iat - LEEWAY_S > now)
  ) {
    return null
  }
  return claims
}

/* ── The connection ──────────────────────────────────────── */

export type Organization = { id: string; name: string; domain: string; status: string }

export type Link = {
  organization_id: string
  askmira_tenant_id: string
  askmira_name: string | null
  askmira_origin: string | null
  secret_nonce: string
  connected_at: string
}

export type Linked = { link: Link; org: Organization }

/** The organization connected to an AskMira workspace, or null. */
export async function linkedTo(tenantId: string): Promise<Linked | null> {
  if (!UUID_RE.test(tenantId)) return null
  const { data: link, error } = await db()
    .from("askmira_links")
    .select("*")
    .eq("askmira_tenant_id", tenantId.toLowerCase())
    .maybeSingle()
  // Before the tables exist there are no connections: as if absent.
  if (error || !link) return null
  const { data: org } = await db()
    .from("organizations")
    .select("id, name, domain, status")
    .eq("id", link.organization_id)
    .maybeSingle()
  if (!org) return null
  return { link: link as Link, org: { ...org, domain: String(org.domain).toLowerCase() } }
}

/**
 * A token's claims, checked with the secret of the workspace it names (`sub`
 * on server-to-server calls, `tid` on a sign-in link), so one workspace's
 * secret can never act for another. A workspace that is not connected gets a
 * 404, as if these endpoints did not exist.
 */
export async function claimsOf(token: string, use: Use): Promise<Linked & { claims: Claims }> {
  const unverified = peek(token)
  const tenantId = String((use === "launch" ? unverified?.tid : unverified?.sub) ?? "")
  const found = canConnect() ? await linkedTo(tenantId) : null
  if (!found) throw httpError(404, "Not found")
  const claims = verify(token, derive(found.link.organization_id, found.link.secret_nonce))
  if (!claims) throw httpError(401, "This AskMira link is not valid or has expired.")
  if (claims.use !== use) throw httpError(401, "This AskMira link is not valid here.")
  return { ...found, claims }
}

/** AskMira's server-to-server call: the token, bound to this exact body and workspace. */
export async function assertion(req: Request, use: Exclude<Use, "launch">) {
  const raw = Buffer.from(await req.arrayBuffer())
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw.toString("utf8"))
  } catch {
    throw httpError(400, "The request is not JSON.")
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "The request is not a JSON object.")
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")
  if (!match) throw httpError(401, "Missing AskMira assertion.")
  const found = await claimsOf(match[1].trim(), use)
  if (!safeEqual(String(found.claims.bh ?? ""), sha256hex(raw))) {
    throw httpError(401, "The assertion does not match this request.")
  }
  if (String(body.tenant_id ?? "").toLowerCase() !== String(found.claims.sub).toLowerCase()) {
    throw httpError(401, "The assertion is for another workspace.")
  }
  return { ...found, body }
}

/** A sign-in link or an action works once: a second use of its `jti` is refused. */
export async function spendOnce(claims: Claims, refusal: string) {
  if (typeof claims.jti !== "string" || !claims.jti || typeof claims.exp !== "number") {
    throw httpError(401, refusal)
  }
  const store = db().from("askmira_used_tokens")
  await store.delete().lt("expires_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
  const { error } = await db()
    .from("askmira_used_tokens")
    .insert({ jti: claims.jti.slice(0, 64), expires_at: new Date(claims.exp * 1000).toISOString() })
  if (error) throw httpError(401, refusal)
}

/* ── People ──────────────────────────────────────────────── */

export type Person = {
  id: string
  email: string
  full_name: string | null
  role: string
  phone: number | string | null
}

export const PERSON_COLUMNS = "id, email, full_name, role, phone"

export const isStaff = (p: Person) => ["engineer", "admin", "superadmin"].includes(p.role)
export const isAdmin = (p: Person) => p.role === "admin" || p.role === "superadmin"

export async function personByEmail(email: string): Promise<Person | null> {
  const { data } = await db()
    .from("users")
    .select(PERSON_COLUMNS)
    .eq("email", normEmail(email))
    .limit(1)
  return (data?.[0] as Person | undefined) ?? null
}

/** Whether a person belongs to the organization: its email domain, or access given here. */
export async function belongsTo(person: Person, org: Organization) {
  if (domainOf(person.email) === org.domain) return true
  const { data } = await db()
    .from("user_organization_access")
    .select("id")
    .eq("user_id", person.id)
    .eq("organization_id", org.id)
    .limit(1)
  return Boolean(data?.length)
}

/** Everyone whose address is on the organization's domain: whose tickets are the company's. */
export async function companyPeopleIds(org: Organization): Promise<string[]> {
  const rows = await allRows<{ id: string }>((from, to) =>
    db()
      .from("users")
      .select("id")
      .ilike("email", `%@${escapeLike(org.domain)}`)
      .order("id")
      .range(from, to)
  )
  return rows.map((r) => r.id)
}

/** The person AskMira is asking for, if they may use the helpdesk for this company. */
export async function actorIn(org: Organization, actor: unknown): Promise<Person> {
  const given = actor && typeof actor === "object" ? (actor as Record<string, unknown>) : {}
  const email = normEmail(given.email)
  const refusal = httpError(
    403,
    `You don't have a ${BRAND} account for ${org.name} yet. Open ${BRAND} once from AskMira, then try again.`
  )
  if (!EMAIL_RE.test(email) || !["admin", "user"].includes(String(given.role ?? ""))) throw refusal
  if (org.status !== "active") {
    throw httpError(403, `${org.name} is switched off in ${BRAND}. Ask your IT team.`)
  }
  const me = await personByEmail(email)
  if (!me || !(await belongsTo(me, org))) throw refusal
  const { data: managed } = await db()
    .from("askmira_people")
    .select("deactivated_at")
    .eq("organization_id", org.id)
    .eq("user_id", me.id)
    .maybeSingle()
  if (managed?.deactivated_at) throw httpError(403, `Your ${BRAND} account has been switched off.`)
  return me
}

/** The short reference the helpdesk shows for a ticket: "#1A2B3C4D". */
export const shortRef = (id: string) => id.slice(0, 8).toUpperCase()
