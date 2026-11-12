import { NextResponse, after } from "next/server"
import { jsonError, requireActor, staffCoversTicket } from "@/lib/ticket-server"
import { notifyTicketEvent } from "@/lib/ticket-notify"
import { isPriority, isTicketType } from "@/lib/itsm"
import { loadItsmConfig, slaDeadlines } from "@/lib/itsm-server"

export const runtime = "nodejs"

/**
 * POST /api/tickets/acquire  { ticket_id }
 * An engineer (or admin) picks up an unassigned ticket from the queue.
 * Only one person can win: the update only applies while the ticket is unassigned.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const { ticket_id } = await req.json().catch(() => ({}))
    if (!ticket_id) return jsonError("Missing ticket_id", 400)

    const { data: ticket } = await db.from("tickets").select("*").eq("id", ticket_id).maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)

    if (!staffCoversTicket(me, ticket)) return jsonError("Ticket not found", 404)

    if (ticket.status === "closed") return jsonError("This ticket is closed", 409)
    if (ticket.assignee) return jsonError("Ticket already acquired", 409)

    // The resolution clock starts when the ticket is raised. Tickets from before
    // SLA policies have no deadline yet: give them one from the policy, from now.
    const now = new Date()
    let slaResolutionAt: string | null = ticket.sla_resolution_at
    if (!slaResolutionAt) {
      const config = await loadItsmConfig(db, ticket.tenant_id)
      const type = isTicketType(ticket.ticket_type) ? ticket.ticket_type : "incident"
      const priority = isPriority(ticket.priority) ? ticket.priority : "medium"
      slaResolutionAt = slaDeadlines(config, type, priority, now).sla_resolution_at
    }
    const { data: claimed, error } = await db
      .from("tickets")
      .update({
        assignee: me.id,
        status: "open",
        assigned_at: now.toISOString(),
        sla_resolution_at: slaResolutionAt,
      })
      .eq("id", ticket_id)
      .is("assignee", null)
      .select("id")

    if (error) throw error
    // Someone else acquired it between our read and our update
    if (!claimed || claimed.length === 0) return jsonError("Ticket already acquired", 409)

    const engineerName = me.full_name?.trim() || me.email || "Engineer"

    await Promise.all([
      db.from("ticket_assignments").insert({
        tenant_id: ticket.tenant_id,
        ticket_id,
        engineer_id: me.id,
        action: "acquired",
      }),
      db.from("ticket_activity").insert({
        tenant_id: ticket.tenant_id,
        ticket_id,
        actor_id: me.id,
        action: "acquired",
        details: { engineer_name: engineerName },
      }),
    ])

    after(() =>
      notifyTicketEvent(db, {
        event: "acquired",
        ticket: { ...ticket, assignee: me.id },
        actorId: me.id,
      }).catch((err) => console.error("Acquire notifications failed:", err))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Acquire failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
