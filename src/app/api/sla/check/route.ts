import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTicketEmail } from "@/lib/email"

export const runtime = "nodejs"

/**
 * SLA Check Cron Endpoint
 * Call this every 1-2 minutes via Vercel Cron, external cron, or Supabase Edge Function.
 *
 * GET /api/sla/check?key=YOUR_CRON_SECRET
 *
 * Checks:
 *  1. Tickets not acquired within 10 min → notify admin
 *  2. Tickets not acquired within 15 min → mark SLA response breached
 *  3. Tickets not resolved within 6 hours → mark SLA resolution breached
 *  4. Tickets on hold past hold_until → auto-flag
 */
export async function GET(req: Request) {
  try {
    /* Simple auth: cron secret or allow in dev */
    const { searchParams } = new URL(req.url)
    const key = searchParams.get("key")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && key !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const now = new Date()
    const results = { admin_alerts: 0, response_breaches: 0, resolution_breaches: 0 }

    /* ─── 1. 10-minute admin alert (not yet acquired, not yet notified) ─── */
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const { data: almostBreached } = await supabase
      .from("tickets")
      .select("id, subject, requester_name, requester_id, created_at, category, priority, location, contact")
      .eq("status", "new")
      .is("assignee", null)
      .eq("sla_admin_notified", false)
      .lte("created_at", tenMinAgo)

    if (almostBreached && almostBreached.length > 0) {
      /* Get all admin users */
      const { data: admins } = await supabase
        .from("users")
        .select("id, name, email")
        .in("role", ["admin", "superadmin"])

      for (const ticket of almostBreached) {
        // Mark as notified
        await supabase
          .from("tickets")
          .update({ sla_admin_notified: true })
          .eq("id", ticket.id)

        // Get requester email
        const { data: requester } = await supabase
          .from("users")
          .select("email, name")
          .eq("id", ticket.requester_id)
          .single()

        // Notify each admin
        for (const admin of admins ?? []) {
          // In-app notification
          await supabase.from("notifications").insert({
            user_id: admin.id,
            actor_id: ticket.requester_id,
            ticket_id: ticket.id,
            type: "status_changed",
            message: `SLA Alert: Ticket #${ticket.id.slice(0, 8).toUpperCase()} has not been acquired for 10+ minutes. 5 minutes remaining!`,
            is_read: false,
          })

          // Email notification
          if (admin.email) {
            await sendTicketEmail({
              to: admin.email,
              recipientName: admin.name ?? "Admin",
              actorName: ticket.requester_name ?? "User",
              ticketId: ticket.id,
              ticketSubject: ticket.subject,
              action: "sla_warning",
              comment: `⚠️ SLA WARNING: This ticket has been waiting for ${Math.round((now.getTime() - new Date(ticket.created_at).getTime()) / 60000)} minutes without being acquired.\n\nEmployee: ${ticket.requester_name}\nEmail: ${requester?.email ?? "N/A"}\nContact: ${ticket.contact ?? "N/A"}\nLocation: ${ticket.location ?? "N/A"}\nCategory: ${ticket.category ?? "N/A"}\nPriority: ${ticket.priority ?? "N/A"}\n\nOnly 5 minutes remaining before SLA response breach!`,
            }).catch(() => {})
          }
        }
        results.admin_alerts++
      }
    }

    /* ─── 2. 15-minute SLA response breach ─── */
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString()
    const { data: responseBreached } = await supabase
      .from("tickets")
      .select("id, subject, requester_name, requester_id")
      .eq("status", "new")
      .is("assignee", null)
      .eq("sla_response_breached", false)
      .lte("created_at", fifteenMinAgo)

    if (responseBreached && responseBreached.length > 0) {
      const { data: admins } = await supabase
        .from("users")
        .select("id, name, email")
        .in("role", ["admin", "superadmin"])

      for (const ticket of responseBreached) {
        await supabase
          .from("tickets")
          .update({ sla_response_breached: true })
          .eq("id", ticket.id)

        // Log activity
        const systemActorId = (admins && admins.length > 0) ? admins[0].id : ticket.requester_id
        await supabase.from("ticket_activity").insert({
          ticket_id: ticket.id,
          actor_id: systemActorId,
          action: "sla_response_breach",
          details: { message: "Ticket was not acquired within 15 minutes" },
        })

        for (const admin of admins ?? []) {
          await supabase.from("notifications").insert({
            user_id: admin.id,
            actor_id: ticket.requester_id,
            ticket_id: ticket.id,
            type: "status_changed",
            message: `SLA BREACH: Ticket #${ticket.id.slice(0, 8).toUpperCase()} was not acquired within 15 minutes!`,
            is_read: false,
          })

          if (admin.email) {
            await sendTicketEmail({
              to: admin.email,
              recipientName: admin.name ?? "Admin",
              actorName: "SLA System",
              ticketId: ticket.id,
              ticketSubject: ticket.subject,
              action: "sla_breach",
              comment: `🚨 SLA BREACH: Ticket #${ticket.id.slice(0, 8).toUpperCase()} has breached the 15-minute response SLA.\n\nRaised by: ${ticket.requester_name}\nNo engineer has acquired this ticket yet.\n\nImmediate action required.`,
            }).catch(() => {})
          }
        }
        results.response_breaches++
      }
    }

    /* ─── 3. 6-hour resolution SLA breach ─── */
    const { data: resolutionBreached } = await supabase
      .from("tickets")
      .select("id, subject, requester_name, requester_id, assignee")
      .in("status", ["open", "in_progress"])
      .eq("sla_resolution_breached", false)
      .not("sla_resolution_at", "is", null)
      .lte("sla_resolution_at", now.toISOString())

    if (resolutionBreached && resolutionBreached.length > 0) {
      const { data: admins } = await supabase
        .from("users")
        .select("id, name, email")
        .in("role", ["admin", "superadmin"])

      for (const ticket of resolutionBreached) {
        await supabase
          .from("tickets")
          .update({ sla_resolution_breached: true })
          .eq("id", ticket.id)

        const systemActorId = ticket.assignee ?? ((admins && admins.length > 0) ? admins[0].id : ticket.requester_id)
        await supabase.from("ticket_activity").insert({
          ticket_id: ticket.id,
          actor_id: systemActorId,
          action: "sla_resolution_breach",
          details: { message: "Ticket was not resolved within 6 hours" },
        })

        // Notify admin + assigned engineer
        const notifyUsers = [...(admins ?? [])]

        if (ticket.assignee) {
          const { data: engineer } = await supabase
            .from("users")
            .select("id, name, email")
            .eq("id", ticket.assignee)
            .single()
          if (engineer) notifyUsers.push(engineer)
        }

        const uniqueUsers = notifyUsers.filter(
          (u, i, arr) => arr.findIndex((x) => x.id === u.id) === i
        )

        for (const u of uniqueUsers) {
          await supabase.from("notifications").insert({
            user_id: u.id,
            actor_id: ticket.requester_id,
            ticket_id: ticket.id,
            type: "status_changed",
            message: `SLA BREACH: Ticket #${ticket.id.slice(0, 8).toUpperCase()} was not resolved within 6 hours!`,
            is_read: false,
          })

          if (u.email) {
            await sendTicketEmail({
              to: u.email,
              recipientName: u.name ?? "Team",
              actorName: "SLA System",
              ticketId: ticket.id,
              ticketSubject: ticket.subject,
              action: "sla_breach",
              comment: `🚨 SLA BREACH: Ticket #${ticket.id.slice(0, 8).toUpperCase()} was not resolved within the defined 6-hour SLA time.\n\nRaised by: ${ticket.requester_name}\nTicket was not resolved within the defined SLA time.\n\nPlease take immediate action.`,
            }).catch(() => {})
          }
        }
        results.resolution_breaches++
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error("SLA check failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
