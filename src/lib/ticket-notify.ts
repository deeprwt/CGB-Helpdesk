// Server-only. The one place that decides who hears about a ticket event,
// in the app (web notification) and by email.
//
//   Event                  Requester        Assigned engineer   IT team of the org   Admins of the org
//   ─────────────────────  ───────────────  ──────────────────  ───────────────────  ─────────────────
//   created                email (details)  —                   web                  (part of IT team)
//   acquired               web + email      —                   —                    —
//   closed/hold/reopened   web + email      web + email         —                    —
//   transferred/escalated  web + email      new: web + email    —                    web + email
//                                           previous: web + email
//
// Nobody is told about their own action, except the requester's
// "we've received your ticket" email. Chat messages are handled by the
// ticket chat itself; SLA alerts by /api/sla/check.

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  sendTicketEmail,
  type EmailAction,
  type EmailAudience,
  type TicketEmailDetails,
} from "@/lib/email"
import { loadTicketAdminPicker, loadTicketStaffPicker } from "@/lib/org"

export type TicketEvent = "created" | "acquired" | "closed" | "hold" | "reopened" | "transferred"

export type NotifyTicket = {
  id: string
  subject: string
  requester_id: string
  requester_name?: string | null
  assignee?: string | null
  description?: string | null
  category?: string | null
  sub_category?: string | null
  priority?: string | null
  location?: string | null
  contact?: string | null
}

type NotificationType = "message" | "acquired" | "closed" | "hold" | "status_changed"

type Recipient = { id: string; email: string | null; name: string | null }

type Delivery = {
  to: Recipient
  web?: { type: NotificationType; message: string }
  email?: {
    action: EmailAction
    audience: EmailAudience
    comment?: string | null
    details?: TicketEmailDetails
  }
  /** Deliver even when the recipient did the action (requester's confirmation email) */
  evenToActor?: boolean
}

type PersonRow = { id: string; email: string | null; full_name: string | null }

export async function notifyTicketEvent(
  db: SupabaseClient,
  params: {
    event: TicketEvent
    ticket: NotifyTicket
    actorId: string
    /** Close / hold reason, or a note to include in the emails */
    comment?: string | null
    /** "transferred" only */
    previousAssignee?: string | null
    newAssignee?: string | null
  }
): Promise<void> {
  const { event, ticket, actorId, comment } = params
  const ref = ticket.id.slice(0, 8).toUpperCase()

  const ids = [
    ticket.requester_id,
    actorId,
    ticket.assignee,
    params.previousAssignee,
    params.newAssignee,
  ].filter((v): v is string => !!v)

  const { data: people } = await db
    .from("users")
    .select("id, email, full_name")
    .in("id", [...new Set(ids)])

  const byId = new Map(((people ?? []) as PersonRow[]).map((p) => [p.id, p]))
  const recipient = (id: string | null | undefined): Recipient | null => {
    if (!id) return null
    const p = byId.get(id)
    return { id, email: p?.email ?? null, name: p?.full_name?.trim() || null }
  }
  const nameOf = (id: string | null | undefined, fallback: string) =>
    (id && byId.get(id)?.full_name?.trim()) || fallback

  const requester = recipient(ticket.requester_id)!
  const requesterEmail = byId.get(ticket.requester_id)?.email ?? null
  const requesterName = nameOf(ticket.requester_id, ticket.requester_name?.trim() || "User")
  const actorName = nameOf(actorId, byId.get(actorId)?.email ?? "Support Team")

  const deliveries: Delivery[] = []

  switch (event) {
    case "created": {
      const onBehalf = actorId !== ticket.requester_id
      deliveries.push({
        to: requester,
        evenToActor: true,
        web: onBehalf ? { type: "status_changed", message: `raised ticket #${ref} for you` } : undefined,
        email: {
          action: "created",
          audience: "requester",
          details: {
            requesterName,
            description: ticket.description,
            category: ticket.category,
            subCategory: ticket.sub_category,
            priority: ticket.priority,
            location: ticket.location,
            contact: ticket.contact,
          },
        },
      })

      // The IT team that looks after this organisation sees it in the app
      const staffFor = await loadTicketStaffPicker(db)
      const message = onBehalf
        ? `raised a new ticket #${ref} for ${requesterName}`
        : `raised a new ticket #${ref}`
      for (const s of staffFor(requesterEmail)) {
        deliveries.push({
          to: { id: s.id, email: s.email, name: s.name },
          web: { type: "status_changed", message },
        })
      }
      break
    }

    case "acquired": {
      deliveries.push({
        to: requester,
        web: { type: "acquired", message: `acquired your ticket #${ref}` },
        email: { action: "acquired", audience: "requester" },
      })
      break
    }

    case "closed":
    case "hold":
    case "reopened": {
      const type: NotificationType =
        event === "closed" ? "closed" : event === "hold" ? "hold" : "status_changed"
      const forRequester =
        event === "closed"
          ? `closed your ticket #${ref}`
          : event === "hold"
            ? `put your ticket #${ref} on hold`
            : `reopened your ticket #${ref}`
      const forEngineer =
        event === "closed"
          ? `closed ticket #${ref}`
          : event === "hold"
            ? `put ticket #${ref} on hold`
            : `reopened ticket #${ref}`

      deliveries.push({
        to: requester,
        web: { type, message: forRequester },
        email: { action: event, audience: "requester", comment },
      })

      const engineer = recipient(ticket.assignee)
      if (engineer) {
        deliveries.push({
          to: engineer,
          web: { type, message: forEngineer },
          email: { action: event, audience: "staff", comment },
        })
      }
      break
    }

    case "transferred": {
      const newEngineer = recipient(params.newAssignee)
      if (!newEngineer) break
      const prevEngineer = recipient(params.previousAssignee)
      const newName = nameOf(params.newAssignee, "another engineer")
      const prevName = nameOf(params.previousAssignee, "the previous engineer")
      const note = comment?.trim() ? `\n\nNote: ${comment.trim()}` : ""

      deliveries.push({
        to: requester,
        web: { type: "status_changed", message: `transferred your ticket #${ref} to ${newName}` },
        email: {
          action: "reassigned",
          audience: "requester",
          comment: prevEngineer
            ? `Your ticket has been transferred from ${prevName} to ${newName}.`
            : `Your ticket has been assigned to ${newName}.`,
        },
      })

      deliveries.push({
        to: newEngineer,
        web: { type: "acquired", message: `transferred ticket #${ref} to you` },
        email: {
          action: "assigned",
          audience: "staff",
          comment: `Ticket #${ref} has been transferred to you by ${actorName}.${note}`,
        },
      })

      if (prevEngineer) {
        deliveries.push({
          to: prevEngineer,
          web: { type: "status_changed", message: `transferred ticket #${ref} from you to ${newName}` },
          email: {
            action: "reassigned",
            audience: "staff",
            comment: `Ticket #${ref} has been transferred from you to ${newName}.${note}`,
          },
        })
      }

      // Escalation: the admins looking after this organisation are told too
      const adminsFor = await loadTicketAdminPicker(db)
      const adminMessage = prevEngineer
        ? `transferred ticket #${ref} from ${prevName} to ${newName}`
        : `assigned ticket #${ref} to ${newName}`
      for (const a of adminsFor(requesterEmail)) {
        deliveries.push({
          to: { id: a.id, email: a.email, name: a.name },
          web: { type: "status_changed", message: adminMessage },
          email: {
            action: "reassigned",
            audience: "staff",
            comment: `${actorName} ${adminMessage}.${note}`,
          },
        })
      }
      break
    }
  }

  /* One delivery per person (the first, most specific, wins); never to the actor */
  const seen = new Set<string>()
  const final = deliveries.filter((d) => {
    if (seen.has(d.to.id)) return false
    seen.add(d.to.id)
    return d.to.id !== actorId || d.evenToActor
  })

  const webRows = final
    .filter((d) => d.web && d.to.id !== actorId)
    .map((d) => ({
      user_id: d.to.id,
      actor_id: actorId,
      ticket_id: ticket.id,
      type: d.web!.type,
      message: d.web!.message,
      is_read: false,
    }))

  if (webRows.length > 0) {
    const { error } = await db.from("notifications").insert(webRows)
    if (error) console.error(`[notify] ticket #${ref} ${event}: in-app notifications failed`, error)
  }

  const sends = final
    .filter((d) => d.email && d.to.email)
    .map((d) =>
      sendTicketEmail({
        to: d.to.email!,
        recipientName: d.to.name ?? "",
        actorName,
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
        action: d.email!.action,
        audience: d.email!.audience,
        comment: d.email!.comment ?? null,
        details: d.email!.details,
      })
    )

  for (const result of await Promise.allSettled(sends)) {
    if (result.status === "rejected") {
      console.error(`[notify] ticket #${ref} ${event}: email failed`, result.reason)
    }
  }
}
