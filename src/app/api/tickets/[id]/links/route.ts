import { NextResponse } from "next/server"
import { jsonError, requireActor, staffCoversTicket, text, UUID_RE } from "@/lib/ticket-server"
import { LINK_TYPES, ticketRef, type LinkType } from "@/lib/itsm"

export const runtime = "nodejs"

const LINK_SELECT = "id, number, subject, ticket_type, status, tenant_id"

/**
 * GET /api/tickets/:id/links  → { links: [{ id, link_type, direction, ticket }] }
 *   direction "out": this ticket → other (e.g. this incident is caused_by that problem)
 *   direction "in":  other → this ticket
 * POST /api/tickets/:id/links  { to: "<ticket id or number, e.g. PRB0001001>", link_type }
 * DELETE /api/tickets/:id/links?link_id=…
 * Both ends must be in the same tenant. Viewing follows ticket visibility;
 * adding and removing is for the IT team.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireActor(req)
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx
    const { id } = await params
    if (!UUID_RE.test(id)) return jsonError("Ticket not found", 404)

    const { data: ticket } = await db.from("tickets").select("id, tenant_id, requester_id").eq("id", id).maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)
    const staff = staffCoversTicket(me, ticket)
    if (!staff && ticket.requester_id !== me.id) return jsonError("Ticket not found", 404)

    const [out, inc] = await Promise.all([
      db.from("ticket_links").select(`id, link_type, created_at, other:to_ticket(${LINK_SELECT})`).eq("from_ticket", id),
      db.from("ticket_links").select(`id, link_type, created_at, other:from_ticket(${LINK_SELECT})`).eq("to_ticket", id),
    ])
    if (out.error) throw out.error
    if (inc.error) throw inc.error

    type Row = { id: string; link_type: LinkType; created_at: string; other: unknown }
    const shape = (rows: Row[], direction: "out" | "in") =>
      rows.map((r) => ({ id: r.id, link_type: r.link_type, created_at: r.created_at, direction, ticket: r.other }))

    let links = [...shape((out.data ?? []) as Row[], "out"), ...shape((inc.data ?? []) as Row[], "in")]
    // A requester only sees linked tickets they could open themselves
    if (!staff) {
      const ids = links.map((l) => (l.ticket as { id: string } | null)?.id).filter(Boolean) as string[]
      const { data: mine } = ids.length
        ? await db.from("tickets").select("id").in("id", ids).eq("requester_id", me.id)
        : { data: [] }
      const allowed = new Set((mine ?? []).map((t) => t.id))
      links = links.filter((l) => allowed.has((l.ticket as { id: string } | null)?.id ?? ""))
    }
    return NextResponse.json({ links })
  } catch (err) {
    console.error("Ticket links load failed:", err)
    return jsonError("Internal server error", 500)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx
    const { id } = await params
    if (!UUID_RE.test(id)) return jsonError("Ticket not found", 404)

    const { data: ticket } = await db.from("tickets").select("id, tenant_id, number").eq("id", id).maybeSingle()
    if (!ticket || !staffCoversTicket(me, ticket)) return jsonError("Ticket not found", 404)

    const body = await req.json().catch(() => ({}))
    const linkType = body.link_type as LinkType
    if (!(LINK_TYPES as readonly string[]).includes(linkType)) return jsonError("Unknown link type", 400)
    const to = text(body.to, 60)
    if (!to) return jsonError("Say which ticket to link to (its number, e.g. PRB0001001)", 400)

    let q = db.from("tickets").select(LINK_SELECT).eq("tenant_id", ticket.tenant_id)
    q = UUID_RE.test(to) ? q.eq("id", to) : q.eq("number", to.toUpperCase())
    const { data: other } = await q.maybeSingle()
    if (!other) return jsonError(`No ticket ${to} in this organisation`, 404)
    if (other.id === id) return jsonError("A ticket cannot be linked to itself", 400)

    const { data: link, error } = await db
      .from("ticket_links")
      .insert({ tenant_id: ticket.tenant_id, from_ticket: id, to_ticket: other.id, link_type: linkType, created_by: me.id })
      .select("id, link_type, created_at")
      .single()
    if (error) {
      if (error.code === "23505") return jsonError("These tickets are already linked that way", 409)
      throw error
    }

    // Logged on both tickets, each naming the other
    const who = me.full_name ?? me.email
    await db.from("ticket_activity").insert([
      {
        tenant_id: ticket.tenant_id,
        ticket_id: id,
        actor_id: me.id,
        action: "linked",
        details: { link_type: linkType, direction: "out", to: ticketRef(other), to_id: other.id, engineer_name: who },
      },
      {
        tenant_id: ticket.tenant_id,
        ticket_id: other.id,
        actor_id: me.id,
        action: "linked",
        details: { link_type: linkType, direction: "in", to: ticketRef(ticket), to_id: id, engineer_name: who },
      },
    ])

    return NextResponse.json({ link: { ...link, direction: "out", ticket: other } })
  } catch (err) {
    console.error("Ticket link failed:", err)
    return jsonError("Internal server error", 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx
    const { id } = await params
    const linkId = new URL(req.url).searchParams.get("link_id") ?? ""
    if (!UUID_RE.test(id) || !UUID_RE.test(linkId)) return jsonError("Link not found", 404)

    const { data: link } = await db
      .from("ticket_links")
      .select("id, tenant_id, from_ticket, to_ticket, link_type")
      .eq("id", linkId)
      .maybeSingle()
    if (!link || (link.from_ticket !== id && link.to_ticket !== id) || !staffCoversTicket(me, link)) {
      return jsonError("Link not found", 404)
    }

    const { error } = await db.from("ticket_links").delete().eq("id", linkId)
    if (error) throw error

    const otherId = link.from_ticket === id ? link.to_ticket : link.from_ticket
    const { data: pair } = await db.from("tickets").select("id, number").in("id", [id, otherId])
    const refOf = (tid: string) => {
      const t = pair?.find((p) => p.id === tid)
      return t ? ticketRef(t) : null
    }
    const who = me.full_name ?? me.email
    await db.from("ticket_activity").insert(
      [id, otherId].map((tid) => ({
        tenant_id: link.tenant_id,
        ticket_id: tid,
        actor_id: me.id,
        action: "unlinked",
        details: {
          link_type: link.link_type,
          direction: link.from_ticket === tid ? "out" : "in",
          to: refOf(tid === id ? otherId : id),
          other_id: tid === id ? otherId : id,
          engineer_name: who,
        },
      }))
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Ticket unlink failed:", err)
    return jsonError("Internal server error", 500)
  }
}
