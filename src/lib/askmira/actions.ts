// What a person does here from AskMira, as themselves.
//
//   POST /api/integrations/askmira/act   use=act, `bh` = SHA-256 of the body; each token once
//   { tenant_id, actor: { id, email, role }, kind, params }
//
//   create_ticket  raise a ticket, as the New Ticket form does
//   reply          write on a ticket's conversation, as its chat does
//
// Each does what the helpdesk's own screens do — the same rows, the same
// activity entry, the same in-app notifications and emails — so a ticket
// raised from AskMira is worked here like any other. Admins are notified only
// if they look after this company (and super admins, as always).

import { sendTicketEmail } from "@/lib/email"
import { CATEGORY_MAP, PRIORITIES } from "@/lib/ticket-categories"
import {
  BRAND,
  UUID_RE,
  clean,
  db,
  defer,
  domainOf,
  httpError,
  isStaff,
  shortRef,
  type Organization,
  type Person,
} from "./core"
import { openTicket } from "./queries"

type Params = Record<string, unknown>
type Ctx = { org: Organization; me: Person; params: Params }

/** Admins who look after this company, and the super admins. */
async function companyAdmins(org: Organization) {
  const { data: admins } = await db()
    .from("users")
    .select("id, email, full_name, role")
    .in("role", ["admin", "superadmin"])
  const { data: access } = await db()
    .from("user_organization_access")
    .select("user_id")
    .eq("organization_id", org.id)
  const granted = new Set((access ?? []).map((a) => a.user_id))
  return (admins ?? []).filter(
    (a) => a.role === "superadmin" || domainOf(String(a.email)) === org.domain || granted.has(a.id)
  )
}

function linkOf(value: unknown) {
  const text = clean(value, 500)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString()
  } catch {
    // not a web address
  }
  throw httpError(422, "The reference link must be a web address, like https://example.com/page.")
}

async function createTicket(ctx: Ctx) {
  const { org, me, params } = ctx
  const subject = clean(params.subject, 200)
  if (!subject || subject.length < 3) throw httpError(422, "Give the ticket a subject.")
  const description = clean(params.description, 5000)
  const category = clean(params.category)
  if (!category || !(category in CATEGORY_MAP)) throw httpError(422, "Choose a category.")
  const subCategory = clean(params.sub_category)
  if (subCategory && !CATEGORY_MAP[category].includes(subCategory)) {
    throw httpError(422, "That sub category is not in the category you chose.")
  }
  const priority = clean(params.priority)
  if (!priority || !(PRIORITIES as readonly string[]).includes(priority)) {
    throw httpError(422, "Choose a priority: low, medium or high.")
  }
  const contact =
    clean(params.contact, 30) ?? (me.phone === null || me.phone === undefined ? null : String(me.phone))
  const location = clean(params.location)
  const link = linkOf(params.link)

  const assetId = clean(params.asset_id, 64)
  if (assetId) {
    const { data: held } = await db()
      .from("asset_assignments")
      .select("id")
      .eq("asset_id", UUID_RE.test(assetId) ? assetId : "00000000-0000-0000-0000-000000000000")
      .eq("user_id", me.id)
      .is("returned_at", null)
      .limit(1)
    if (!held?.length) throw httpError(422, "That asset is not assigned to you.")
  }

  const requesterName = me.full_name || me.email
  const { data: ticket, error } = await db()
    .from("tickets")
    .insert({
      requester_id: me.id,
      requester_name: requesterName,
      contact,
      subject,
      description,
      category,
      sub_category: subCategory,
      priority,
      status: "new",
      location,
      link,
      sla_response_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select("id, subject, status, created_at")
    .single()
  if (error || !ticket) throw error ?? new Error("The ticket was not created.")

  await db().from("ticket_activity").insert({
    ticket_id: ticket.id,
    actor_id: me.id,
    action: "created",
    details: { source: "askmira" },
  })
  if (assetId) {
    await db().from("asset_tickets").insert({ ticket_id: ticket.id, asset_id: assetId })
  }

  const ref = shortRef(ticket.id)
  defer(async () => {
    await sendTicketEmail({
      to: me.email,
      recipientName: requesterName,
      actorName: requesterName,
      ticketId: ticket.id,
      ticketSubject: subject,
      action: "created",
    }).catch((err) => console.error("Ticket email failed:", err))
    for (const admin of await companyAdmins(org)) {
      if (admin.id === me.id) continue
      await db().from("notifications").insert({
        user_id: admin.id,
        actor_id: me.id,
        ticket_id: ticket.id,
        type: "status_changed",
        message: `New ticket #${ref} raised by ${requesterName}`,
        is_read: false,
      })
      if (admin.email) {
        await sendTicketEmail({
          to: admin.email,
          recipientName: admin.full_name || "Admin",
          actorName: requesterName,
          ticketId: ticket.id,
          ticketSubject: subject,
          action: "created",
        }).catch((err) => console.error("Ticket email failed:", err))
      }
    }
  })

  console.log(`[AskMira] ticket #${ref} raised for ${org.domain} by ${me.email}`)
  return { ticket: { id: ticket.id, ref, subject, status: ticket.status, created_at: ticket.created_at } }
}

async function reply(ctx: Ctx) {
  const { me, params } = ctx
  const ticket = await openTicket(ctx, params.ticket_id)
  const text = clean(params.message, 4000)
  if (!text) throw httpError(422, "Write a message first.")
  if (ticket.status === "closed") {
    throw httpError(409, `This ticket is closed. Reopen it in ${BRAND} to write on it again.`)
  }
  const support = isStaff(me) && ticket.requester_id !== me.id
  const { data: message, error } = await db()
    .from("ticket_messages")
    .insert({
      ticket_id: ticket.id,
      sender_id: me.id,
      sender_role: support ? "engineer" : "user",
      message: text,
    })
    .select("id, created_at")
    .single()
  if (error || !message) throw error ?? new Error("The message was not saved.")

  // The other side of the conversation hears about it, as with the helpdesk's chat.
  const recipient = support ? ticket.requester_id : ticket.assignee
  if (recipient && recipient !== me.id) {
    defer(async () => {
      await db().from("notifications").insert({
        user_id: recipient,
        actor_id: me.id,
        ticket_id: ticket.id,
        type: "message",
        message: "sent you a message",
        is_read: false,
      })
      const { data: other } = await db()
        .from("users")
        .select("email, full_name")
        .eq("id", recipient)
        .maybeSingle()
      if (other?.email) {
        await sendTicketEmail({
          to: other.email,
          recipientName: other.full_name || "there",
          actorName: me.full_name || me.email,
          ticketId: ticket.id,
          ticketSubject: ticket.subject,
          action: "message",
          comment: text,
        }).catch((err) => console.error("Ticket email failed:", err))
      }
    })
  }

  return {
    message: {
      id: message.id,
      from: me.full_name || me.email,
      side: support ? "support" : "requester",
      mine: true,
      text,
      at: message.created_at,
    },
  }
}

export const ACTIONS: Record<string, (ctx: Ctx) => Promise<Record<string, unknown>>> = {
  create_ticket: createTicket,
  reply,
}
