import { NextResponse, after } from "next/server"
import { jsonError, requireActor, staffCoversTicket } from "@/lib/ticket-server"
import { ticketPermissions } from "@/lib/ticket-access"
import { notifyTicketEvent } from "@/lib/ticket-notify"

export const runtime = "nodejs"

const HOLD_HOURS = [24, 48, 72]

/**
 * POST /api/tickets/status
 *   { ticket_id, status: "closed", comment? }
 *   { ticket_id, status: "hold", comment, hold_duration_hours }
 *
 * Only the engineer the ticket is assigned to can close it or put it on hold.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const ticketId: string | undefined = body.ticket_id
    const status: string | undefined = body.status
    const comment: string = typeof body.comment === "string" ? body.comment.trim() : ""

    if (!ticketId || (status !== "closed" && status !== "hold")) {
      return jsonError("Send ticket_id and a status of closed or hold", 400)
    }

    const { data: ticket } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle()
    if (!ticket || !staffCoversTicket(me, ticket)) return jsonError("Ticket not found", 404)

    const can = ticketPermissions(me, ticket)
    if (!can.canCloseOrHold) {
      return jsonError(
        ticket.assignee === me.id
          ? `This ticket is already ${ticket.status === "hold" ? "on hold" : "closed"}`
          : "Only the engineer assigned to this ticket can change its status",
        403
      )
    }

    const engineerName = me.full_name?.trim() || me.email || "Engineer"
    let emailComment: string | null = comment || null

    // Only applies while this person is still the assignee and the status is
    // unchanged — a transfer or another update in between makes it a 409.
    const guardedUpdate = (fields: Record<string, unknown>) =>
      db
        .from("tickets")
        .update(fields)
        .eq("id", ticketId)
        .eq("assignee", me.id)
        .eq("status", ticket.status)
        .select("id")
    const changedMeanwhile = () =>
      jsonError("The ticket was changed by someone else. Refresh and try again.", 409)

    if (status === "closed") {
      const { data: updated, error } = await guardedUpdate({
        status: "closed",
        closed_comment: comment || null,
      })
      if (error) throw error
      if (!updated || updated.length === 0) return changedMeanwhile()

      await db.from("ticket_activity").insert({
        tenant_id: ticket.tenant_id,
        ticket_id: ticketId,
        actor_id: me.id,
        action: "closed",
        details: { comment, engineer_name: engineerName },
      })
    } else {
      if (!comment) return jsonError("A reason is required to put a ticket on hold", 400)
      const hours = HOLD_HOURS.includes(Number(body.hold_duration_hours))
        ? Number(body.hold_duration_hours)
        : 24
      const startedAt = new Date()

      const { data: updated, error } = await guardedUpdate({
        status: "hold",
        hold_comment: comment,
        hold_duration_hours: hours,
        hold_started_at: startedAt.toISOString(),
        hold_until: new Date(startedAt.getTime() + hours * 60 * 60 * 1000).toISOString(),
      })
      if (error) throw error
      if (!updated || updated.length === 0) return changedMeanwhile()

      await db.from("ticket_activity").insert({
        tenant_id: ticket.tenant_id,
        ticket_id: ticketId,
        actor_id: me.id,
        action: "hold",
        details: { hold_duration_hours: hours, reason: comment, engineer_name: engineerName },
      })

      emailComment = `Hold Duration: ${hours} hours\nReason: ${comment}`
    }

    const event: "closed" | "hold" = status === "closed" ? "closed" : "hold"
    after(() =>
      notifyTicketEvent(db, {
        event,
        ticket,
        actorId: me.id,
        comment: emailComment,
      }).catch((err) => console.error("Status notifications failed:", err))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Status update failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
