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
    const { ticket_id } = body

    if (!ticket_id) {
      return NextResponse.json({ error: "Missing ticket_id" }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    /* 1. Get ticket */
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
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

      await supabaseAdmin
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
    } else {
      // Reopening from closed — reset resolution SLA (6 hours from now)
      slaResolutionAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

      await supabaseAdmin
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
    }

    /* 3. Log activity */
    const { data: engineerData } = await supabaseAdmin
      .from("users")
      .select("name")
      .eq("id", user.id)
      .single()

    await supabaseAdmin.from("ticket_activity").insert({
      ticket_id,
      actor_id: user.id,
      action: "reopened",
      details: {
        previous_status: ticket.status,
        engineer_name: engineerData?.name ?? "Engineer",
      },
    })

    /* 4. Notify requester */
    const ticketShortId = ticket_id.slice(0, 8).toUpperCase()
    const actorName = engineerData?.name ?? "Support Engineer"

    const { data: requester } = await supabaseAdmin
      .from("users")
      .select("name, email")
      .eq("id", ticket.requester_id)
      .single()

    // In-app notification to requester
    if (ticket.requester_id !== user.id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: ticket.requester_id,
        actor_id: user.id,
        ticket_id,
        type: "status_changed",
        message: `reopened your ticket #${ticketShortId}`,
        is_read: false,
      })
    }

    // Email to requester
    if (requester?.email) {
      sendTicketEmail({
        to: requester.email,
        recipientName: requester.name ?? "User",
        actorName,
        ticketId: ticket_id,
        ticketSubject: ticket.subject,
        action: "reopened",
      }).catch(() => {})
    }

    /* 5. Notify admins */
    const { data: admins } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .in("role", ["admin", "superadmin"])

    for (const admin of admins ?? []) {
      if (admin.id === user.id) continue

      await supabaseAdmin.from("notifications").insert({
        user_id: admin.id,
        actor_id: user.id,
        ticket_id,
        type: "status_changed",
        message: `reopened ticket #${ticketShortId}`,
        is_read: false,
      })

      if (admin.email) {
        sendTicketEmail({
          to: admin.email,
          recipientName: admin.name ?? "Admin",
          actorName,
          ticketId: ticket_id,
          ticketSubject: ticket.subject,
          action: "reopened",
        }).catch(() => {})
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Reopen failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
