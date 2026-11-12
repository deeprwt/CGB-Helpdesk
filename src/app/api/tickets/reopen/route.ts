import { NextResponse, after } from "next/server"
import { jsonError, requireActor, staffCoversTicket } from "@/lib/ticket-server"
import { ticketPermissions } from "@/lib/ticket-access"
import { notifyTicketEvent } from "@/lib/ticket-notify"
import { isPriority, isTicketType } from "@/lib/itsm"
import { deadlineAfterHold, loadItsmConfig, slaDeadlines } from "@/lib/itsm-server"

export const runtime = "nodejs"

/**
 * POST /api/tickets/reopen  { ticket_id }
 * Reopens a closed ticket, or resumes one on hold.
 * Allowed for the assigned engineer, or an admin of the ticket's organisation.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const { ticket_id } = await req.json().catch(() => ({}))
    if (!ticket_id) return jsonError("Missing ticket_id", 400)

    /* 1. Get ticket and check who may reopen it */
    const { data: ticket } = await db.from("tickets").select("*").eq("id", ticket_id).maybeSingle()
    if (!ticket || !staffCoversTicket(me, ticket)) return jsonError("Ticket not found", 404)

    const can = ticketPermissions(me, ticket)
    if (!can.canReopen) {
      return jsonError(
        ticket.status === "closed" || ticket.status === "hold"
          ? "Only the assigned engineer or an admin can reopen this ticket"
          : "This ticket is not closed or on hold",
        403
      )
    }

    // Updates below only apply if the status is unchanged since we read it
    const changedMeanwhile = () =>
      jsonError("The ticket was changed by someone else. Refresh and try again.", 409)

    /* 2. Calculate new SLA resolution deadline (from the tenant's SLA policy and calendar) */
    const config = await loadItsmConfig(db, ticket.tenant_id)
    let slaResolutionAt = ticket.sla_resolution_at
    if (ticket.status === "hold" && ticket.hold_started_at) {
      // Resume: the SLA time left when the hold started is given back from now.
      // A deadline already missed before the hold stays missed.
      const now = new Date()
      const pausedMs = now.getTime() - new Date(ticket.hold_started_at).getTime()
      const totalPausedMs = (ticket.sla_paused_ms ?? 0) + pausedMs
      const missedBeforeHold =
        !!ticket.sla_resolution_at && new Date(ticket.sla_resolution_at) <= new Date(ticket.hold_started_at)
      slaResolutionAt = deadlineAfterHold(config, ticket, now)

      const { data: updated, error } = await db
        .from("tickets")
        .update({
          status: "open",
          hold_comment: null,
          hold_duration_hours: null,
          hold_started_at: null,
          hold_until: null,
          sla_paused_ms: totalPausedMs,
          sla_resolution_at: slaResolutionAt,
          sla_resolution_breached: missedBeforeHold ? ticket.sla_resolution_breached : false,
        })
        .eq("id", ticket_id)
        .eq("status", ticket.status)
        .select("id")
      if (error) throw error
      if (!updated || updated.length === 0) return changedMeanwhile()
    } else {
      // Reopening from closed: a fresh resolution deadline from the policy, from now
      const type = isTicketType(ticket.ticket_type) ? ticket.ticket_type : "incident"
      const priority = isPriority(ticket.priority) ? ticket.priority : "medium"
      slaResolutionAt = slaDeadlines(config, type, priority, new Date()).sla_resolution_at

      const { data: updated, error } = await db
        .from("tickets")
        .update({
          status: "open",
          closed_comment: null,
          hold_comment: null,
          hold_duration_hours: null,
          hold_started_at: null,
          hold_until: null,
          sla_resolution_at: slaResolutionAt,
          sla_resolution_breached: false,
        })
        .eq("id", ticket_id)
        .eq("status", ticket.status)
        .select("id")
      if (error) throw error
      if (!updated || updated.length === 0) return changedMeanwhile()
    }

    /* 3. Log activity */
    await db.from("ticket_activity").insert({
      tenant_id: ticket.tenant_id,
      ticket_id,
      actor_id: me.id,
      action: "reopened",
      details: {
        previous_status: ticket.status,
        engineer_name: me.full_name?.trim() || "Engineer",
      },
    })

    /* 4. Requester and assigned engineer hear about it */
    after(() =>
      notifyTicketEvent(db, {
        event: "reopened",
        ticket,
        actorId: me.id,
      }).catch((err) => console.error("Reopen notifications failed:", err))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Reopen failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
