import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { timingSafeEqual } from "crypto"
import { sendTicketEmail } from "@/lib/email"
import { loadTicketAdminPicker } from "@/lib/org"
import { formatMinutes, ticketRef } from "@/lib/itsm"

export const runtime = "nodejs"

/**
 * SLA check. Call every 1–5 minutes (Vercel Cron, pg_cron + pg_net, or any scheduler).
 *
 * GET /api/sla/check   with header  Authorization: Bearer <CRON_SECRET>
 * Refuses to run when CRON_SECRET is not set.
 *
 * Every ticket carries its own deadlines (set from its tenant's SLA policy when
 * it is raised, re-classified, reopened or resumed), so this only compares times:
 *  1. Not acquired and two thirds of the response time gone → warn the tenant's admins
 *  2. Not acquired by the response deadline → response breach
 *  3. Not resolved by the resolution deadline (and not on hold) → resolution breach
 */

type Person = { id: string; name: string | null; email: string | null }
type Row = {
  id: string
  number: string | null
  tenant_id: string
  subject: string
  requester_id: string
  requester_name: string | null
  created_at: string
  category: string | null
  priority: string | null
  location: string | null
  contact: string | null
  assignee: string | null
  sla_response_at: string | null
  sla_resolution_at: string | null
}

const COLUMNS =
  "id, number, tenant_id, subject, requester_id, requester_name, created_at, category, priority, location, contact, assignee, sla_response_at, sla_resolution_at"

function authorised(req: Request, secret: string) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const a = Buffer.from(bearer)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function tell(
  db: SupabaseClient,
  ticket: Row,
  people: Person[],
  message: string,
  email: { action: "sla_warning" | "sla_breach"; actorName: string; comment: string }
) {
  const unique = people.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
  for (const p of unique) {
    await db.from("notifications").insert({
      tenant_id: ticket.tenant_id,
      user_id: p.id,
      actor_id: ticket.requester_id,
      ticket_id: ticket.id,
      type: "status_changed",
      message,
      is_read: false,
    })
    if (p.email) {
      await sendTicketEmail({
        to: p.email,
        recipientName: p.name ?? "Team",
        actorName: email.actorName,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
        action: email.action,
        comment: email.comment,
      }).catch((err) => console.error("SLA email failed:", err))
    }
  }
}

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error("SLA check refused: CRON_SECRET is not set")
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
    }
    if (!authorised(req, cronSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    const now = new Date()
    const nowIso = now.toISOString()
    const results = { admin_alerts: 0, response_breaches: 0, resolution_breaches: 0 }
    const adminsFor = await loadTicketAdminPicker(db)
    const waited = (t: Row) => formatMinutes((now.getTime() - new Date(t.created_at).getTime()) / 60000)

    /* ─── 1. Early warning: unacquired, two thirds of the response time gone ─── */
    const { data: waiting, error: e1 } = await db
      .from("tickets")
      .select(COLUMNS)
      .eq("status", "new")
      .is("assignee", null)
      .eq("sla_admin_notified", false)
      .eq("sla_response_breached", false)
      .not("sla_response_at", "is", null)
      .gt("sla_response_at", nowIso)
    if (e1) throw e1

    for (const t of (waiting ?? []) as Row[]) {
      const start = new Date(t.created_at).getTime()
      const due = new Date(t.sla_response_at!).getTime()
      if (now.getTime() < start + ((due - start) * 2) / 3) continue

      // Claim the warning first so two overlapping runs don't both send it
      const { data: claimed } = await db
        .from("tickets")
        .update({ sla_admin_notified: true })
        .eq("id", t.id)
        .eq("sla_admin_notified", false)
        .select("id")
      if (!claimed?.length) continue

      const { data: requester } = await db.from("users").select("email").eq("id", t.requester_id).maybeSingle()
      const left = formatMinutes((due - now.getTime()) / 60000)
      await tell(
        db,
        t,
        adminsFor(t.tenant_id),
        `SLA warning: ${ticketRef(t)} has not been acquired for ${waited(t)}. ${left} left to respond.`,
        {
          action: "sla_warning",
          actorName: t.requester_name ?? "User",
          comment: `⚠️ SLA WARNING: This ticket has been waiting for ${waited(t)} without being acquired.\n\nEmployee: ${t.requester_name ?? "N/A"}\nEmail: ${requester?.email ?? "N/A"}\nContact: ${t.contact ?? "N/A"}\nLocation: ${t.location ?? "N/A"}\nCategory: ${t.category ?? "N/A"}\nPriority: ${t.priority ?? "N/A"}\n\nOnly ${left} left before the response SLA is breached.`,
        }
      )
      results.admin_alerts++
    }

    /* ─── 2. Response breach: still not acquired at the response deadline ─── */
    const { data: lateResponse, error: e2 } = await db
      .from("tickets")
      .select(COLUMNS)
      .eq("status", "new")
      .is("assignee", null)
      .eq("sla_response_breached", false)
      .not("sla_response_at", "is", null)
      .lte("sla_response_at", nowIso)
    if (e2) throw e2

    for (const t of (lateResponse ?? []) as Row[]) {
      const { data: claimed } = await db
        .from("tickets")
        .update({ sla_response_breached: true })
        .eq("id", t.id)
        .eq("sla_response_breached", false)
        .select("id")
      if (!claimed?.length) continue

      const admins = adminsFor(t.tenant_id)
      await db.from("ticket_activity").insert({
        tenant_id: t.tenant_id,
        ticket_id: t.id,
        actor_id: admins[0]?.id ?? t.requester_id,
        action: "sla_response_breach",
        details: { message: `Ticket was not acquired within the response SLA (waited ${waited(t)})` },
      })
      await tell(db, t, admins, `SLA BREACH: ${ticketRef(t)} was not acquired in time (waited ${waited(t)}).`, {
        action: "sla_breach",
        actorName: "SLA System",
        comment: `🚨 SLA BREACH: ${ticketRef(t)} has breached its response SLA.\n\nRaised by: ${t.requester_name ?? "N/A"}\nNo engineer has acquired this ticket yet (waiting ${waited(t)}).\n\nImmediate action required.`,
      })
      results.response_breaches++
    }

    /* ─── 3. Resolution breach: not resolved by the deadline (holds pause the clock) ─── */
    const { data: lateResolution, error: e3 } = await db
      .from("tickets")
      .select(COLUMNS)
      .in("status", ["new", "open", "in_progress"])
      .eq("sla_resolution_breached", false)
      .not("sla_resolution_at", "is", null)
      .lte("sla_resolution_at", nowIso)
    if (e3) throw e3

    for (const t of (lateResolution ?? []) as Row[]) {
      const { data: claimed } = await db
        .from("tickets")
        .update({ sla_resolution_breached: true })
        .eq("id", t.id)
        .eq("sla_resolution_breached", false)
        .select("id")
      if (!claimed?.length) continue

      const admins = adminsFor(t.tenant_id)
      await db.from("ticket_activity").insert({
        tenant_id: t.tenant_id,
        ticket_id: t.id,
        actor_id: t.assignee ?? admins[0]?.id ?? t.requester_id,
        action: "sla_resolution_breach",
        details: { message: "Ticket was not resolved within the resolution SLA" },
      })

      const people: Person[] = [...admins]
      if (t.assignee) {
        const { data: engineer } = await db
          .from("users")
          .select("id, name:full_name, email")
          .eq("id", t.assignee)
          .maybeSingle()
        if (engineer) people.push(engineer)
      }
      await tell(db, t, people, `SLA BREACH: ${ticketRef(t)} was not resolved within its SLA.`, {
        action: "sla_breach",
        actorName: "SLA System",
        comment: `🚨 SLA BREACH: ${ticketRef(t)} was not resolved within its resolution SLA.\n\nRaised by: ${t.requester_name ?? "N/A"}\nPriority: ${t.priority ?? "N/A"}\n\nPlease take immediate action.`,
      })
      results.resolution_breaches++
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error("SLA check failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
