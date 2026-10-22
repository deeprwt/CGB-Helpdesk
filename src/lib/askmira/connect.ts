// Connecting an organization to an AskMira workspace, like "Sign in with…".
//
// 1. An admin of the workspace in AskMira presses Connect there and lands on
//    /connect/askmira here with AskMira's workspace, where to come back to, a
//    state and a PKCE challenge.
// 2. An admin here (or a super admin) signs in, picks the organization and
//    presses Allow (`approve`): a one-time code, bound to that organization and
//    to the challenge, goes back to AskMira in the browser.
// 3. AskMira's server swaps the code and the verifier — which only it holds —
//    for the organization's own secret (`swap`).
//
// The secret reaches that one organization only. Either side can disconnect:
// AskMira from its Connectors (`revoke`), an admin here from the AskMira page
// (`disconnect`).

import crypto from "crypto"
import {
  BRAND,
  PERSON_COLUMNS,
  PRODUCT,
  UUID_RE,
  belongsTo,
  canConnect,
  clean,
  db,
  derive,
  httpError,
  sha256hex,
  type Organization,
  type Person,
} from "./core"

const CODE_LIFETIME_MS = 5 * 60 * 1000
const CALLBACK_PATH = "/settings/connectors/callback"
const PKCE_RE = /^[A-Za-z0-9_-]{43,128}$/

/** The signed-in helpdesk person making this request, from their session. */
export async function signedIn(req: Request): Promise<Person> {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")
  if (!match) throw httpError(401, `Sign in to ${BRAND} first.`)
  const { data, error } = await db().auth.getUser(match[1].trim())
  if (error || !data?.user) throw httpError(401, `Sign in to ${BRAND} first.`)
  const { data: me } = await db().from("users").select(PERSON_COLUMNS).eq("id", data.user.id).maybeSingle()
  if (!me) throw httpError(401, `Sign in to ${BRAND} first.`)
  return me as Person
}

function requireAdmin(me: Person) {
  if (me.role !== "admin" && me.role !== "superadmin") {
    throw httpError(403, `Only a ${BRAND} admin connects a company to AskMira.`)
  }
}

/** The organizations this admin looks after: every active one for a super admin. */
async function organizationsOf(me: Person): Promise<Organization[]> {
  const { data } = await db()
    .from("organizations")
    .select("id, name, domain, status")
    .eq("status", "active")
    .order("name")
  const all = (data ?? []).map((o) => ({ ...o, domain: String(o.domain).toLowerCase() }))
  if (me.role === "superadmin") return all
  const mine: Organization[] = []
  for (const org of all) if (await belongsTo(me, org)) mine.push(org)
  return mine
}

async function organizationFor(me: Person, organizationId: unknown) {
  const id = String(organizationId ?? "")
  const org = UUID_RE.test(id) ? (await organizationsOf(me)).find((o) => o.id === id) : undefined
  if (!org) throw httpError(403, "You don't look after that company here.")
  return org
}

/** The AskMira that is asking, from where it wants the answer sent; refuses anything odd. */
function askmiraOrigin(redirectUri: unknown) {
  let url: URL
  try {
    url = new URL(String(redirectUri ?? ""))
  } catch {
    throw httpError(422, "That is not an AskMira connect link.")
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname)
  if (
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" && !local) ||
    url.pathname.replace(/\/+$/, "") !== CALLBACK_PATH ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw httpError(422, "That is not an AskMira connect link.")
  }
  const allowed = String(process.env.ASKMIRA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean)
  if (allowed.length && !allowed.includes(url.origin)) {
    throw httpError(403, "This AskMira is not one this helpdesk connects to.")
  }
  return url
}

/** The admin's companies, and the AskMira workspace each is connected to. */
export async function connections(me: Person) {
  requireAdmin(me)
  const orgs = await organizationsOf(me)
  const { data: links } = orgs.length
    ? await db()
        .from("askmira_links")
        .select("organization_id, askmira_tenant_id, askmira_name, askmira_origin, connected_at")
        .in("organization_id", orgs.map((o) => o.id))
    : { data: [] }
  const byOrg = new Map((links ?? []).map((l) => [l.organization_id, l]))
  return {
    can_connect: canConnect(),
    organizations: orgs.map((o) => {
      const link = byOrg.get(o.id)
      return {
        id: o.id,
        name: o.name,
        domain: o.domain,
        connected: Boolean(link),
        askmira_workspace_id: link?.askmira_tenant_id ?? null,
        askmira_workspace: link?.askmira_name ?? null,
        askmira_origin: link?.askmira_origin ?? null,
        connected_at: link?.connected_at ?? null,
      }
    }),
  }
}

/** Allow: a one-time code for AskMira, bound to the organization the admin chose. */
export async function approve(me: Person, body: Record<string, unknown>) {
  requireAdmin(me)
  if (!canConnect()) {
    throw httpError(409, "Set ASKMIRA_LINK_SECRET (at least 32 characters) on this server first.")
  }
  const tenantId = String(body.tenant_id ?? "").toLowerCase()
  const challenge = String(body.challenge ?? "")
  const state = String(body.state ?? "")
  const name = clean(body.tenant_name)
  if (!UUID_RE.test(tenantId) || !PKCE_RE.test(challenge) || !state || state.length > 4000 || !name) {
    throw httpError(422, "That is not an AskMira connect link.")
  }
  const callback = askmiraOrigin(body.redirect_uri)
  const org = await organizationFor(me, body.organization_id)

  const { data: links } = await db()
    .from("askmira_links")
    .select("organization_id, askmira_tenant_id")
    .or(`organization_id.eq.${org.id},askmira_tenant_id.eq.${tenantId}`)
  if ((links ?? []).some((l) => l.organization_id === org.id && l.askmira_tenant_id !== tenantId)) {
    throw httpError(409, `${org.name} is already connected to another AskMira workspace. Disconnect it first.`)
  }
  if ((links ?? []).some((l) => l.askmira_tenant_id === tenantId && l.organization_id !== org.id)) {
    throw httpError(409, "That AskMira workspace is already connected to another company here.")
  }

  const code = crypto.randomBytes(32).toString("base64url")
  await db().from("askmira_connect_codes").delete().lt("expires_at", new Date().toISOString())
  const { error } = await db().from("askmira_connect_codes").insert({
    code_hash: sha256hex(code),
    organization_id: org.id,
    askmira_tenant_id: tenantId,
    askmira_name: name,
    askmira_origin: callback.origin,
    challenge,
    approved_by: me.id,
    expires_at: new Date(Date.now() + CODE_LIFETIME_MS).toISOString(),
  })
  if (error) throw error
  console.log(`[AskMira] ${org.domain} approved a connection to workspace ${tenantId} at ${callback.origin}`)
  const query = new URLSearchParams({ code, state, product: PRODUCT })
  return { redirect_to: `${callback.origin}${CALLBACK_PATH}?${query}` }
}

/** AskMira's server swaps the code, and the verifier only it holds, for the secret. */
export async function swap(body: Record<string, unknown>) {
  const code = String(body.code ?? "")
  const verifier = String(body.verifier ?? "")
  const tenantId = String(body.tenant_id ?? "").toLowerCase()
  const refused = httpError(400, "This connect code is not valid or has expired.")
  if (!code || code.length > 200 || !PKCE_RE.test(verifier)) throw refused
  // One use, whatever happens next.
  const { data: used } = await db()
    .from("askmira_connect_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", sha256hex(code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select()
  const row = used?.[0]
  if (!row) throw refused
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url")
  const expected = String(row.challenge)
  if (
    row.askmira_tenant_id !== tenantId ||
    challenge.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(challenge), Buffer.from(expected))
  ) {
    throw refused
  }

  const { data: org } = await db()
    .from("organizations")
    .select("id, name")
    .eq("id", row.organization_id)
    .maybeSingle()
  if (!org) throw refused
  const { data: clash } = await db()
    .from("askmira_links")
    .select("organization_id, askmira_tenant_id")
    .or(`organization_id.eq.${org.id},askmira_tenant_id.eq.${tenantId}`)
  if ((clash ?? []).some((l) => (l.organization_id === org.id) !== (l.askmira_tenant_id === tenantId))) {
    throw httpError(409, "That AskMira workspace or this company is already connected elsewhere.")
  }
  const nonce = crypto.randomBytes(32).toString("base64url")
  const { error } = await db().from("askmira_links").upsert(
    {
      organization_id: org.id,
      askmira_tenant_id: tenantId,
      askmira_name: row.askmira_name,
      askmira_origin: row.askmira_origin,
      secret_nonce: nonce,
      connected_by: row.approved_by,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  )
  if (error) throw error
  console.log(`[AskMira] organization ${org.id} connected to workspace ${tenantId}`)
  return {
    product: PRODUCT,
    brand: BRAND,
    secret: derive(org.id, nonce),
    external_ref: org.id,
    organization: org.name,
  }
}

/** AskMira disconnected: forget this workspace's secret here too. */
export async function revoke(tenantId: string) {
  await db().from("askmira_links").delete().eq("askmira_tenant_id", tenantId.toLowerCase())
  console.log(`[AskMira] workspace ${tenantId} disconnected from AskMira`)
  return { disconnected: true }
}

/** Disconnect from this side: AskMira's secret for this company stops working at once. */
export async function disconnect(me: Person, organizationId: unknown) {
  requireAdmin(me)
  const org = await organizationFor(me, organizationId)
  await db().from("askmira_links").delete().eq("organization_id", org.id)
  console.log(`[AskMira] ${org.domain} disconnected by ${me.email}`)
  return connections(me)
}
