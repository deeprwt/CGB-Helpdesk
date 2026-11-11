import { NextResponse, after } from "next/server"
import { jsonError, requireActor } from "@/lib/ticket-server"
import { ticketPermissions } from "@/lib/ticket-access"
import { sendTicketEmail } from "@/lib/email"

export const runtime = "nodejs"

/**
 * POST /api/tickets/message  { ticket_id, message, online_user_ids? }
 *
 * Writes in a ticket's conversation. Only the requester and the engineer the
 * ticket is assigned to RIGHT NOW may write. The other side of the
 * conversation (requester <-> current assignee, never the sender) gets a web
 * notification and an email, unless they are viewing the ticket at that
 * moment (`online_user_ids`, from the chat's presence channel).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req)
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const ticketId: string | undefined = body.ticket_id
    const text = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : ""
    const online = new Set<string>(
      Array.isArray(body.online_user_ids) ? body.online_user_ids.filter((v: unknown) => typeof v === "string") : []
    )

    if (!ticketId) return jsonError("Missing ticket_id", 400)
    if (!text) return jsonError("Write a message first", 400)

    // Fresh read: the assignee may have changed since the sender opened the page
    const { data: ticket } = await db
      .from("tickets")
      .select("id, tenant_id, subject, requester_id, assignee, status")
      .eq("id", ticketId)
      .maybeSingle()
    if (!ticket) return jsonError("Ticket not found", 404)

    const can = ticketPermissions(me, ticket)
    if (!can.canChat) {
      return jsonError(
        ticket.assignee
          ? "Only the requester and the engineer assigned to this ticket can reply."
          : "Acquire this ticket before replying.",
        403
      )
    }

    const { data: message, error } = await db
      .from("ticket_messages")
      .insert({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        sender_id: me.id,
        sender_role: can.isRequester ? "user" : "engineer",
        message: text,
      })
      .select("*")
      .single()
    if (error || !message) throw error ?? new Error("Message not saved")

    /* The other side hears about it — worked out now, from the current ticket */
    const recipientId: string | null = can.isRequester ? ticket.assignee : ticket.requester_id
    if (recipientId && recipientId !== me.id && !online.has(recipientId)) {
      const senderName = me.full_name?.trim() || me.email || "Support Team"
      after(async () => {
        try {
          await db.from("notifications").insert({
            tenant_id: ticket.tenant_id,
            user_id: recipientId,
            actor_id: me.id,
            ticket_id: ticket.id,
            type: "message",
            message: `sent you a message on ticket #${ticket.id.slice(0, 8).toUpperCase()}`,
            is_read: false,
          })

          const { data: recipient } = await db
            .from("users")
            .select("email, full_name")
            .eq("id", recipientId)
            .maybeSingle()

          if (recipient?.email) {
            await sendTicketEmail({
              to: recipient.email,
              recipientName: recipient.full_name?.trim() || "",
              actorName: senderName,
              ticketId: ticket.id,
              ticketSubject: ticket.subject,
              action: "message",
              comment: text,
              // Requester reads "your ticket"; the engineer reads "ticket #…"
              audience: recipientId === ticket.requester_id ? "requester" : "staff",
            })
          }
        } catch (err) {
          console.error("Message notifications failed:", err)
        }
      })
    }

    return NextResponse.json({ message })
  } catch (err) {
    console.error("Message send failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
