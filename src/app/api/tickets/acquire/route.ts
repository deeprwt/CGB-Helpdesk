import { NextResponse, after } from "next/server"
import {
  getRequestUser,
  jsonError,
  loadPerson,
  serviceClient,
  staffCoversRequester,
} from "@/lib/ticket-server"
import { isStaffRole } from "@/lib/ticket-access"
import { notifyTicketEvent } from "@/lib/ticket-notify"

export const runtime = "nodejs"

/**
 * POST /api/tickets/acquire  { ticket_id }
 * An engineer (or admin) picks up an unassigned ticket from the queue.
 * Only one person can win: the update only applies while the ticket is unassigned.
 */
export async function POST(req: Request) {
  try {
    const authUser = await getRequestUser(req)
    if (!authUser) return jsonError("Unauthorized", 401)

    const { ticket_id } = await req.json().catch(() => ({}))
    if (!ticket_id) return jsonError("Missing ticket_id", 400)

    const db = serviceClient()
    const me = await loadPerson(db, authUser.id)
    if (!me || !isStaffRole(me.role)) return jsonError("Only the IT team can acquire tickets", 403)

    const { data: ticket } = await db.from("tickets").select("*").eq("id", ticket_id).maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)

    const { data: requester } = await db
      .from("users")
      .select("email")
      .eq("id", ticket.requester_id)
      .maybeSingle()

    if (!(await staffCoversRequester(db, me, requester?.email))) {
      return jsonError("This ticket belongs to an organisation you don't look after", 403)
    }

    if (ticket.status === "closed") return jsonError("This ticket is closed", 409)
    if (ticket.assignee) return jsonError("Ticket already acquired", 409)

    const now = new Date()
    const { data: claimed, error } = await db
      .from("tickets")
      .update({
        assignee: me.id,
        status: "open",
        assigned_at: now.toISOString(),
        sla_resolution_at: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
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
        ticket_id,
        engineer_id: me.id,
        action: "acquired",
      }),
      db.from("ticket_activity").insert({
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
