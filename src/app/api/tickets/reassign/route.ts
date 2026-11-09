import { NextResponse, after } from "next/server"
import {
  getRequestUser,
  jsonError,
  loadPerson,
  serviceClient,
  staffCoversRequester,
} from "@/lib/ticket-server"
import { isAdminRole, isStaffRole, ticketPermissions } from "@/lib/ticket-access"
import { notifyTicketEvent } from "@/lib/ticket-notify"
import { loadTicketStaffPicker } from "@/lib/org"

export const runtime = "nodejs"

/**
 * POST /api/tickets/reassign  { ticket_id, new_engineer_id, comment? }
 * Transfers (escalates) a ticket to another engineer.
 * Allowed for the engineer it is assigned to, or an admin of its organisation.
 */
export async function POST(req: Request) {
  try {
    const authUser = await getRequestUser(req)
    if (!authUser) return jsonError("Unauthorized", 401)

    const body = await req.json().catch(() => ({}))
    const { ticket_id, new_engineer_id } = body
    const comment: string | null =
      typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null

    if (!ticket_id || !new_engineer_id) return jsonError("Missing fields", 400)

    const db = serviceClient()
    const me = await loadPerson(db, authUser.id)
    if (!me) return jsonError("Unauthorized", 401)

    /* 1. Get current ticket and check who may transfer it */
    const { data: ticket } = await db.from("tickets").select("*").eq("id", ticket_id).maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)

    const can = ticketPermissions(me, ticket)
    if (!can.canTransfer) {
      return jsonError(
        ticket.status === "closed"
          ? "Reopen the ticket before transferring it"
          : "Only the assigned engineer or an admin can transfer this ticket",
        403
      )
    }

    const { data: requester } = await db
      .from("users")
      .select("email")
      .eq("id", ticket.requester_id)
      .maybeSingle()

    if (isAdminRole(me.role) && ticket.assignee !== me.id) {
      if (!(await staffCoversRequester(db, me, requester?.email))) {
        return jsonError("This ticket belongs to an organisation you don't look after", 403)
      }
    }

    if (new_engineer_id === ticket.assignee) {
      return jsonError("The ticket is already assigned to this engineer", 400)
    }

    const newEngineer = await loadPerson(db, new_engineer_id)
    if (!newEngineer || !isStaffRole(newEngineer.role)) {
      return jsonError("Tickets can only be transferred to an engineer or admin", 400)
    }
    // The new engineer must look after the requester's organisation (no cross-tenant hand-offs)
    if (!(await staffCoversRequester(db, newEngineer, requester?.email))) {
      return jsonError("That engineer doesn't look after this ticket's organisation", 400)
    }

    const previousAssignee: string = ticket.assignee

    /* 2. Update ticket assignee — only if nobody changed the assignee or status
          meanwhile. A ticket on hold stays on hold (the new engineer resumes it,
          which credits the paused SLA time); otherwise it becomes open. */
    const { data: updated, error: updateError } = await db
      .from("tickets")
      .update({
        assignee: new_engineer_id,
        assigned_at: new Date().toISOString(),
        ...(ticket.status === "hold" ? {} : { status: "open" }),
      })
      .eq("id", ticket_id)
      .eq("assignee", previousAssignee)
      .eq("status", ticket.status)
      .select("id")
    if (updateError) throw updateError
    if (!updated || updated.length === 0) {
      return jsonError("The ticket was changed by someone else. Refresh and try again.", 409)
    }

    /* 3. Close previous assignment */
    if (previousAssignee) {
      await db
        .from("ticket_assignments")
        .update({ unassigned_at: new Date().toISOString() })
        .eq("ticket_id", ticket_id)
        .eq("engineer_id", previousAssignee)
        .is("unassigned_at", null)
    }

    /* 4. Insert new assignment record */
    await db.from("ticket_assignments").insert({
      ticket_id,
      engineer_id: new_engineer_id,
      action: "reassigned",
    })

    /* 5. Log activity */
    const prevEngineer = previousAssignee ? await loadPerson(db, previousAssignee) : null
    await db.from("ticket_activity").insert({
      ticket_id,
      actor_id: me.id,
      action: "reassigned",
      details: {
        previous_assignee: previousAssignee,
        previous_engineer_name: prevEngineer?.full_name ?? null,
        new_assignee: new_engineer_id,
        new_engineer_name: newEngineer.full_name ?? "Engineer",
        ...(comment ? { comment } : {}),
      },
    })

    /* 6. Requester, both engineers and the organisation's admins hear about it */
    after(() =>
      notifyTicketEvent(db, {
        event: "transferred",
        ticket: { ...ticket, assignee: new_engineer_id },
        actorId: me.id,
        previousAssignee,
        newAssignee: new_engineer_id,
        comment,
      }).catch((err) => console.error("Transfer notifications failed:", err))
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Reassign failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * GET /api/tickets/reassign?ticket_id=…
 * Who this ticket can be transferred to: engineers and admins who look after
 * the requester's organisation (the same rule the POST enforces).
 */
export async function GET(req: Request) {
  try {
    const authUser = await getRequestUser(req)
    if (!authUser) return jsonError("Unauthorized", 401)

    const ticketId = new URL(req.url).searchParams.get("ticket_id")
    if (!ticketId) return jsonError("Missing ticket_id", 400)

    const db = serviceClient()
    const me = await loadPerson(db, authUser.id)
    if (!me) return jsonError("Unauthorized", 401)

    const { data: ticket } = await db
      .from("tickets")
      .select("id, requester_id, assignee, status")
      .eq("id", ticketId)
      .maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)

    const { data: requester } = await db
      .from("users")
      .select("email")
      .eq("id", ticket.requester_id)
      .maybeSingle()

    const can = ticketPermissions(me, ticket)
    if (!can.canTransfer || (!can.isAssignee && !(await staffCoversRequester(db, me, requester?.email)))) {
      return jsonError("Only the assigned engineer or an admin can transfer this ticket", 403)
    }

    const pick = await loadTicketStaffPicker(db, ["engineer", "admin"])
    const engineers = pick(requester?.email)
      .filter((s) => s.id !== ticket.assignee)
      .map((s) => ({ id: s.id, name: s.name?.trim() || s.email || "Engineer", email: s.email ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ engineers })
  } catch (err) {
    console.error("Transfer candidates failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
