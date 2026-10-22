// What AskMira reads for one person: their tickets, the queues they work, the
// company's assets. Read-only.
//
//   POST /api/integrations/askmira/query   use=query, `bh` = SHA-256 of the body
//   { tenant_id, actor: { id, email, role }, kind, params }
//
// The person must have an account here in the connected organization
// (core.actorIn), and sees what they see when they open the helpdesk, within
// that organization only:
//
//   tickets  scope "mine"      tickets they raised
//            scope "assigned"  tickets assigned to them         engineers and admins
//            scope "queue"     the company's unassigned tickets engineers and admins
//            scope "company"   all the company's tickets        admins
//   ticket   one ticket and its conversation, if they may open it
//   overview counts for the scopes above that are theirs
//   assets   scope "mine"      what is assigned to them now
//            scope "company"   the company's asset register     engineers and admins
//   options  what the New Ticket form offers them

import { CATEGORY_MAP, PRIORITIES } from "@/lib/ticket-categories"
import {
  BRAND,
  UUID_RE,
  chunks,
  companyPeopleIds,
  db,
  domainOf,
  httpError,
  isAdmin,
  isStaff,
  searchText,
  shortRef,
  type Organization,
  type Person,
} from "./core"

export const TICKET_STATUSES = ["new", "open", "in_progress", "hold", "closed"]
const TICKET_SCOPES = ["mine", "assigned", "queue", "company"]
const ASSET_STATUSES = ["in_use", "spare", "retired"]
const ASSET_SCOPES = ["mine", "company"]
const MAX_WINDOW_MS = 100 * 24 * 60 * 60 * 1000
/** Requester ids per request: keeps the address PostgREST reads short. */
const ID_CHUNK = 150

type Params = Record<string, unknown>
type Ctx = { org: Organization; me: Person; params: Params }

type TicketRow = {
  id: string
  subject: string
  category: string | null
  sub_category: string | null
  priority: string | null
  status: string | null
  requester_id: string
  requester_name: string
  assignee: string | null
  created_at: string
  updated_at: string | null
  sla_response_breached: boolean | null
  sla_resolution_breached: boolean | null
}

const TICKET_COLUMNS =
  "id, subject, category, sub_category, priority, status, requester_id, requester_name, assignee, created_at, updated_at, sla_response_breached, sla_resolution_breached"

function limitOf(params: Params) {
  const n = Number(params.limit)
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 25
}

function instantOf(value: unknown, name: string) {
  if (value === null || value === undefined || value === "") return null
  const at = new Date(String(value))
  if (Number.isNaN(at.getTime())) throw httpError(422, `"${name}" is not a date and time.`)
  return at.toISOString()
}

function between(params: Params) {
  const from = instantOf(params.from, "from")
  const to = instantOf(params.to, "to")
  if (from && to && (to < from || Date.parse(to) - Date.parse(from) > MAX_WINDOW_MS)) {
    throw httpError(422, "Ask about at most 100 days at a time.")
  }
  return { from, to }
}

async function names(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const out = new Map<string, string>()
  for (const chunk of chunks(wanted, ID_CHUNK)) {
    const { data } = await db().from("users").select("id, full_name, email").in("id", chunk)
    for (const u of data ?? []) out.set(u.id, u.full_name || u.email)
  }
  return out
}

/* ── Tickets ─────────────────────────────────────────────── */

function ticketScope(me: Person, value: unknown) {
  const scope = String(value || "mine")
  if (!TICKET_SCOPES.includes(scope)) throw httpError(422, "Unknown scope.")
  if ((scope === "assigned" || scope === "queue") && !isStaff(me)) {
    throw httpError(403, `Only ${BRAND} engineers and admins have a ticket queue.`)
  }
  if (scope === "company" && !isAdmin(me)) {
    throw httpError(403, `Only a ${BRAND} admin sees all of the company's tickets.`)
  }
  return scope
}

type TicketFilter = {
  scope: string
  status?: string | null
  search?: string
  from?: string | null
  to?: string | null
}

/**
 * Runs `build` over the tickets in `scope`, once per batch of the company's
 * people when the scope is company-wide. Tickets belong to the company their
 * requester's address is on, as everywhere in the helpdesk.
 */
async function overTickets<T>(
  ctx: Ctx,
  filter: TicketFilter,
  columns: string,
  head: boolean,
  shape: (q: any) => PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>
) {
  const { org, me } = ctx
  const base = () => {
    let q = db().from("tickets").select(columns, { count: "exact", head })
    if (filter.scope === "mine") q = q.eq("requester_id", me.id)
    if (filter.scope === "assigned") q = q.eq("assignee", me.id)
    if (filter.scope === "queue") q = q.is("assignee", null)
    if (filter.status) q = q.eq("status", filter.status)
    if (filter.search) {
      const s = filter.search
      q = q.or(`subject.ilike.*${s}*,requester_name.ilike.*${s}*,category.ilike.*${s}*`)
    }
    if (filter.from) q = q.gte("created_at", filter.from)
    if (filter.to) q = q.lt("created_at", filter.to)
    return q
  }
  const results: { data: T[]; count: number }[] = []
  if (filter.scope === "mine") {
    const { data, count, error } = await shape(base())
    if (error) throw error
    results.push({ data: data ?? [], count: count ?? 0 })
  } else {
    const people = await companyPeopleIds(org)
    for (const chunk of chunks(people, ID_CHUNK)) {
      const { data, count, error } = await shape(base().in("requester_id", chunk))
      if (error) throw error
      results.push({ data: data ?? [], count: count ?? 0 })
    }
  }
  return results
}

async function ticketsAnswer(ctx: Ctx) {
  const { params } = ctx
  const scope = ticketScope(ctx.me, params.scope)
  const status = TICKET_STATUSES.includes(String(params.status)) ? String(params.status) : null
  const limit = limitOf(params)
  const filter = { scope, status, search: searchText(params.query), ...between(params) }
  const parts = await overTickets<TicketRow>(ctx, filter, TICKET_COLUMNS, false, (q) =>
    q.order("created_at", { ascending: false }).limit(limit)
  )
  const rows = parts
    .flatMap((p) => p.data)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
  const total = parts.reduce((sum, p) => sum + p.count, 0)
  const who = await names(rows.map((t) => t.assignee))
  return {
    scope,
    total,
    tickets: rows.map((t) => ({
      id: t.id,
      ref: shortRef(t.id),
      subject: t.subject,
      category: t.category,
      sub_category: t.sub_category,
      priority: t.priority,
      status: t.status,
      requester: t.requester_name,
      assignee: t.assignee ? who.get(t.assignee) ?? "Engineer" : null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      sla_breached: Boolean(t.sla_response_breached || t.sla_resolution_breached),
    })),
  }
}

async function countIn(ctx: Ctx, filter: TicketFilter) {
  const parts = await overTickets<never>(ctx, filter, "id", true, (q) => q)
  return parts.reduce((sum, p) => sum + p.count, 0)
}

async function byStatus(ctx: Ctx, scope: string) {
  const out: Record<string, number> = {}
  for (const status of TICKET_STATUSES) out[status] = await countIn(ctx, { scope, status })
  return out
}

async function overviewAnswer(ctx: Ctx) {
  const { me } = ctx
  const answer: Record<string, unknown> = {
    role: me.role,
    mine: await byStatus(ctx, "mine"),
  }
  if (isStaff(me)) {
    answer.assigned = await byStatus(ctx, "assigned")
    answer.queue = await countIn(ctx, { scope: "queue" })
  }
  if (isAdmin(me)) answer.company = await byStatus(ctx, "company")
  const { count } = await db()
    .from("asset_assignments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", me.id)
    .is("returned_at", null)
  answer.my_assets = count ?? 0
  return answer
}

/** Whether `me` may open this ticket: theirs, or the company's and theirs to work. */
async function mayOpen(ctx: Ctx, ticket: { requester_id: string; assignee: string | null }) {
  const { me, org } = ctx
  if (ticket.requester_id === me.id) return true
  if (!isStaff(me)) return false
  const { data: requester } = await db()
    .from("users")
    .select("email")
    .eq("id", ticket.requester_id)
    .maybeSingle()
  if (!requester || domainOf(String(requester.email)) !== org.domain) return false
  return isAdmin(me) || ticket.assignee === me.id || ticket.assignee === null
}

export async function openTicket(ctx: Ctx, id: unknown) {
  const ticketId = String(id ?? "")
  // 403, not 404: AskMira reads a 404 as "this company is not connected any more".
  const missing = httpError(403, `There is no such ticket in ${BRAND} for you.`)
  if (!UUID_RE.test(ticketId)) throw missing
  const { data: ticket } = await db().from("tickets").select("*").eq("id", ticketId).maybeSingle()
  if (!ticket || !(await mayOpen(ctx, ticket))) throw missing
  return ticket as TicketRow & Record<string, unknown>
}

async function ticketAnswer(ctx: Ctx) {
  const ticket = await openTicket(ctx, ctx.params.id)
  const [{ data: messages }, { data: files }, { data: links }, { data: activity }] =
    await Promise.all([
      db()
        .from("ticket_messages")
        .select("id, sender_id, sender_role, message, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at")
        .limit(200),
      db().from("ticket_attachments").select("file_name, file_size").eq("ticket_id", ticket.id),
      db().from("asset_tickets").select("asset_id").eq("ticket_id", ticket.id).limit(1),
      db()
        .from("ticket_activity")
        .select("actor_id, action, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at")
        .limit(50),
    ])
  const who = await names([
    ticket.assignee,
    ...(messages ?? []).map((m) => m.sender_id),
    ...(activity ?? []).map((a) => a.actor_id),
  ])
  let asset: Record<string, unknown> | null = null
  if (links?.[0]?.asset_id) {
    const { data } = await db()
      .from("assets")
      .select("asset_code, asset_type, model")
      .eq("id", links[0].asset_id)
      .maybeSingle()
    asset = data ?? null
  }
  return {
    ticket: {
      id: ticket.id,
      ref: shortRef(ticket.id),
      subject: ticket.subject,
      description: ticket.description ?? null,
      category: ticket.category,
      sub_category: ticket.sub_category,
      priority: ticket.priority,
      status: ticket.status,
      location: ticket.location ?? null,
      link: ticket.link ?? null,
      requester: ticket.requester_name,
      mine: ticket.requester_id === ctx.me.id,
      assignee: ticket.assignee ? who.get(ticket.assignee) ?? "Engineer" : null,
      created_at: ticket.created_at,
      assigned_at: ticket.assigned_at ?? null,
      closed_comment: ticket.closed_comment ?? null,
      hold_comment: ticket.hold_comment ?? null,
      hold_until: ticket.hold_until ?? null,
      sla_response_at: ticket.sla_response_at ?? null,
      sla_resolution_at: ticket.sla_resolution_at ?? null,
      sla_breached: Boolean(ticket.sla_response_breached || ticket.sla_resolution_breached),
      can_reply: ticket.status !== "closed",
      asset,
      attachments: (files ?? []).map((f) => ({ name: f.file_name, size: f.file_size })),
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      from: who.get(m.sender_id) ?? (m.sender_role === "engineer" ? "Support" : "Requester"),
      side: m.sender_role === "engineer" ? "support" : "requester",
      mine: m.sender_id === ctx.me.id,
      text: m.message,
      at: m.created_at,
    })),
    activity: (activity ?? []).map((a) => ({
      action: a.action,
      by: who.get(a.actor_id) ?? null,
      at: a.created_at,
    })),
  }
}

/* ── Assets ──────────────────────────────────────────────── */

type AssetRow = {
  id: string
  asset_code: string
  asset_type: string
  model: string | null
  status: string
  location: string | null
  department: string | null
  room: string | null
  purchase_date: string | null
  warranty_expiry: string | null
}

const ASSET_COLUMNS =
  "id, asset_code, asset_type, model, status, location, department, room, purchase_date, warranty_expiry"

async function serials(assetIds: string[]) {
  const out = new Map<string, string>()
  for (const chunk of chunks(assetIds, ID_CHUNK)) {
    const { data } = await db()
      .from("asset_details")
      .select("asset_id, value")
      .eq("key", "serial_no")
      .in("asset_id", chunk)
    for (const d of data ?? []) if (d.value) out.set(d.asset_id, d.value)
  }
  return out
}

function asset(a: AssetRow, serial: string | undefined, holder: string | null, since: string | null) {
  return {
    id: a.id,
    code: a.asset_code,
    type: a.asset_type,
    model: a.model,
    serial_no: serial ?? null,
    status: a.status,
    location: [a.location, a.room].filter(Boolean).join(", ") || null,
    department: a.department,
    purchase_date: a.purchase_date,
    warranty_expiry: a.warranty_expiry,
    holder,
    assigned_at: since,
  }
}

async function assetsAnswer(ctx: Ctx) {
  const { me, org, params } = ctx
  const scope = String(params.scope || "mine")
  if (!ASSET_SCOPES.includes(scope)) throw httpError(422, "Unknown scope.")
  const status = ASSET_STATUSES.includes(String(params.status)) ? String(params.status) : null
  const search = searchText(params.query)
  const limit = limitOf(params)

  if (scope === "mine") {
    const { data: held } = await db()
      .from("asset_assignments")
      .select("asset_id, assigned_at")
      .eq("user_id", me.id)
      .is("returned_at", null)
    const since = new Map((held ?? []).map((h) => [h.asset_id, h.assigned_at]))
    const ids = [...since.keys()]
    const rows: AssetRow[] = []
    for (const chunk of chunks(ids, ID_CHUNK)) {
      const { data } = await db().from("assets").select(ASSET_COLUMNS).in("id", chunk)
      rows.push(...((data ?? []) as AssetRow[]))
    }
    const serial = await serials(ids)
    rows.sort((a, b) => a.asset_code.localeCompare(b.asset_code))
    return {
      scope,
      total: rows.length,
      assets: rows.map((a) => asset(a, serial.get(a.id), me.full_name || me.email, since.get(a.id) ?? null)),
    }
  }

  if (!isStaff(me)) throw httpError(403, `Only ${BRAND} engineers and admins see the asset register.`)
  let q = db()
    .from("assets")
    .select(ASSET_COLUMNS, { count: "exact" })
    .eq("organization_id", org.id)
    .order("asset_code")
    .limit(limit)
  if (status) q = q.eq("status", status)
  if (search) {
    q = q.or(`asset_code.ilike.*${search}*,asset_type.ilike.*${search}*,model.ilike.*${search}*`)
  }
  const { data, count, error } = await q
  if (error) throw error
  const rows = (data ?? []) as AssetRow[]
  const ids = rows.map((a) => a.id)
  const holders = new Map<string, { user_id: string; assigned_at: string }>()
  for (const chunk of chunks(ids, ID_CHUNK)) {
    const { data: held } = await db()
      .from("asset_assignments")
      .select("asset_id, user_id, assigned_at")
      .in("asset_id", chunk)
      .is("returned_at", null)
    for (const h of held ?? []) holders.set(h.asset_id, h)
  }
  const who = await names([...holders.values()].map((h) => h.user_id))
  const serial = await serials(ids)
  return {
    scope,
    total: count ?? rows.length,
    assets: rows.map((a) => {
      const h = holders.get(a.id)
      return asset(a, serial.get(a.id), h ? who.get(h.user_id) ?? null : null, h?.assigned_at ?? null)
    }),
  }
}

/* ── The New Ticket form ─────────────────────────────────── */

async function optionsAnswer(ctx: Ctx) {
  const mine = await assetsAnswer({ ...ctx, params: { scope: "mine" } })
  return {
    categories: Object.entries(CATEGORY_MAP).map(([name, subs]) => ({ name, sub_categories: subs })),
    priorities: [...PRIORITIES],
    contact: ctx.me.phone === null || ctx.me.phone === undefined ? null : String(ctx.me.phone),
    assets: mine.assets.map((a) => ({ id: a.id, code: a.code, type: a.type, model: a.model })),
  }
}

export const QUERIES: Record<string, (ctx: Ctx) => Promise<Record<string, unknown>>> = {
  tickets: ticketsAnswer,
  ticket: ticketAnswer,
  overview: overviewAnswer,
  assets: assetsAnswer,
  options: optionsAnswer,
}
