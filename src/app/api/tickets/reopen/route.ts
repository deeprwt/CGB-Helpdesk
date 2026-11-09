import { NextResponse, after } from "next/server"
import {
  getRequestUser,
  jsonError,
  loadPerson,
  serviceClient,
  staffCoversRequester,
} from "@/lib/ticket-server"
import { isAdminRole, ticketPermissions } from "@/lib/ticket-access"
import { notifyTicketEvent } from "@/lib/ticket-notify"

export const runtime = "nodejs"

/**
 * POST /api/tickets/reopen  { ticket_id }
 * Reopens a closed ticket, or resumes one on hold.
 * Allowed for the assigned engineer, or an admin of the ticket's organisation.
 */
export async function POST(req: Request) {
  try {
    const authUser = await getRequestUser(req)
    if (!authUser) return jsonError("Unauthorized", 401)

    const { ticket_id } = await req.json().catch(() => ({}))
    if (!ticket_id) return jsonError("Missing ticket_id", 400)

    const db = serviceClient()
    const me = await loadPerson(db, authUser.id)
    if (!me) return jsonError("Unauthorized", 401)

    /* 1. Get ticket and check who may reopen it */
    const { data: ticket } = await db.from("tickets").select("*").eq("id", ticket_id).maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)

    const can = ticketPermissions(me, ticket)
    if (!can.canReopen) {
      return jsonError(
        ticket.status === "closed" || ticket.status === "hold"
          ? "Only the assigned engineer or an admin can reopen this ticket"
          : "This ticket is not closed or on hold",
        403
      )
    }

    if (isAdminRole(me.role) && ticket.assignee !== me.id) {
      const { data: requester } = await db
        .from("users")
        .select("email")
        .eq("id", ticket.requester_id)
        .maybeSingle()
      if (!(await staffCoversRequester(db, me, requester?.email))) {
        return jsonError("This ticket belongs to an organisation you don't look after", 403)
      }
    }

    /* 2. Calculate new SLA resolution deadline */
    // If coming from hold, account for paused time
    let slaResolutionAt = ticket.sla_resolution_at
    if (ticket.status === "hold" && ticket.hold_started_at) {
      const pausedMs = Date.now() - new Date(ticket.hold_started_at).getTime()
      const totalPausedMs = (ticket.sla_paused_ms ?? 0) + pausedMs

      // Extend SLA deadline by the paused duration
      if (ticket.sla_resolution_at) {
        const originalDeadline = new Date(ticket.sla_resolution_at).getTime()
        slaResolutionAt = new Date(originalDeadline + pausedMs).toISOString()
      }

      const { error } = await db
        .from("tickets")
        .update({
          status: "open",
          hold_comment: null,
          hold_duration_hours: null,
          hold_started_at: null,
          hold_until: null,
          sla_paused_ms: totalPausedMs,
          sla_resolution_at: slaResolutionAt,
          sla_resolution_breached: false,
        })
        .eq("id", ticket_id)
      if (error) throw error
    } else {
      // Reopening from closed — reset resolution SLA (6 hours from now)
      slaResolutionAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

      const { error } = await db
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
      if (error) throw error
    }

    /* 3. Log activity */
    await db.from("ticket_activity").insert({
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
