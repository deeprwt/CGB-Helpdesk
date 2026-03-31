import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTicketEmail } from "@/lib/email"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = authHeader.replace("Bearer ", "")
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { ticket_id, new_engineer_id } = body

    if (!ticket_id || !new_engineer_id) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    /* 1. Get current ticket */
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    const previousAssignee = ticket.assignee

    /* 2. Close previous assignment */
    if (previousAssignee) {
      await supabaseAdmin
        .from("ticket_assignments")
        .update({ unassigned_at: new Date().toISOString() })
        .eq("ticket_id", ticket_id)
        .eq("engineer_id", previousAssignee)
        .is("unassigned_at", null)
    }

    /* 3. Update ticket assignee */
    const { error: updateError } = await supabaseAdmin
      .from("tickets")
      .update({
        assignee: new_engineer_id,
        assigned_at: new Date().toISOString(),
        status: "open",
      })
      .eq("id", ticket_id)

    if (updateError) throw updateError

    /* 4. Insert new assignment record */
    await supabaseAdmin.from("ticket_assignments").insert({
      ticket_id,
      engineer_id: new_engineer_id,
      action: "reassigned",
    })

    /* 5. Log activity */
    const [prevEngineerRes, newEngineerRes] = await Promise.all([
      previousAssignee
        ? supabaseAdmin.from("users").select("name").eq("id", previousAssignee).single()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from("users").select("name, email").eq("id", new_engineer_id).single(),
    ])

    await supabaseAdmin.from("ticket_activity").insert({
      ticket_id,
      actor_id: user.id,
      action: "reassigned",
      details: {
        previous_assignee: previousAssignee,
        previous_engineer_name: prevEngineerRes.data?.name ?? null,
        new_assignee: new_engineer_id,
        new_engineer_name: newEngineerRes.data?.name ?? "Engineer",
      },
    })

    /* 6. Get requester info */
    const ticketShortId = ticket_id.slice(0, 8).toUpperCase()
    const newEngineerName = newEngineerRes.data?.name ?? "Support Engineer"
    const prevEngineerName = prevEngineerRes.data?.name ?? "Previous Engineer"

    const { data: requester } = await supabaseAdmin
      .from("users")
      .select("name, email")
      .eq("id", ticket.requester_id)
      .single()

    /* 7. Email requester about reassignment */
    if (requester?.email) {
      sendTicketEmail({
        to: requester.email,
        recipientName: requester.name ?? "User",
        actorName: newEngineerName,
        ticketId: ticket_id,
        ticketSubject: ticket.subject,
        action: "reassigned",
        comment: `Your ticket has been reassigned from ${prevEngineerName} to ${newEngineerName}.`,
      }).catch(() => {})
    }

    /* 8. Email new engineer */
    if (newEngineerRes.data?.email) {
      sendTicketEmail({
        to: newEngineerRes.data.email,
        recipientName: newEngineerName,
        actorName: "Admin",
        ticketId: ticket_id,
        ticketSubject: ticket.subject,
        action: "acquired",
        comment: `Ticket #${ticketShortId} has been assigned to you.`,
      }).catch(() => {})
    }

    /* 9. Email previous engineer about unassignment */
    if (previousAssignee) {
      const { data: prevEngineerEmail } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", previousAssignee)
        .single()

      if (prevEngineerEmail?.email) {
        sendTicketEmail({
          to: prevEngineerEmail.email,
          recipientName: prevEngineerName,
          actorName: "Admin",
          ticketId: ticket_id,
          ticketSubject: ticket.subject,
          action: "reassigned",
          comment: `Ticket #${ticketShortId} has been reassigned from you to ${newEngineerName}.`,
        }).catch(() => {})
      }
    }

    /* 10. Insert in-app notifications */
    const notifBase = {
      ticket_id,
      actor_id: user.id,
      is_read: false,
    }

    const notifications = []

    // Notify requester
    if (ticket.requester_id !== user.id) {
      notifications.push({
        ...notifBase,
        user_id: ticket.requester_id,
        type: "status_changed",
        message: `reassigned your ticket #${ticketShortId} to ${newEngineerName}`,
      })
    }

    // Notify new engineer
    if (new_engineer_id !== user.id) {
      notifications.push({
        ...notifBase,
        user_id: new_engineer_id,
        type: "acquired",
        message: `assigned ticket #${ticketShortId} to you`,
      })
    }

    // Notify previous engineer
    if (previousAssignee && previousAssignee !== user.id) {
      notifications.push({
        ...notifBase,
        user_id: previousAssignee,
        type: "status_changed",
        message: `unassigned you from ticket #${ticketShortId} and reassigned to ${newEngineerName}`,
      })
    }

    if (notifications.length > 0) {
      await supabaseAdmin.from("notifications").insert(notifications)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Reassign failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
