// What a person does here from AskMiraa, as themselves.
//
//   POST /api/integrations/askmira/act   use=act, `bh` = SHA-256 of the body; each token once
//   { tenant_id, actor: { id, email, role }, kind, params }
//
//   create_ticket  raise a ticket, as the New Ticket form does
//   reply          write on a ticket's conversation, as its chat does
//
// Each does what the helpdesk's own screens do — the same rows, the same
// activity entry, the same in-app notifications and emails — so a ticket
// raised from AskMiraa is worked here like any other. Who is notified is
// decided in lib/ticket-notify.ts, as for the helpdesk. Every row written
// carries the connected company's tenant.

import { sendTicketEmail } from "@/lib/email"
import { REQUESTER_TICKET_TYPES, isPriority, isTicketType, type TicketType } from "@/lib/itsm"
import { checkCategory, loadItsmConfig, resolvePriority, slaDeadlines } from "@/lib/itsm-server"
import { notifyTicketEvent } from "@/lib/ticket-notify"
import {
  BRAND,
  UUID_RE,
  clean,
  db,
  defer,
  httpError,
  isStaff,
  shortRef,
} from "./core"
import { mayWrite, openTicket, type Ctx } from "./queries"

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
  const tenantId = org.tenant_id
  const config = await loadItsmConfig(db(), tenantId)

  // Category from the tenant's own list. The record type follows the category
  // (a category kept for service requests raises a service request), unless
  // AskMiraa says which of the two it is.
  const categoryRaw = clean(params.category)
  if (!categoryRaw) throw httpError(422, "Choose a category.")
  const parentCat = config.categories.find(
    (c) => !c.parent_id && c.is_active && c.name.toLowerCase() === categoryRaw.toLowerCase()
  )
  const askedType = clean(params.ticket_type)
  const ticketType: TicketType =
    askedType && isTicketType(askedType) && REQUESTER_TICKET_TYPES.includes(askedType)
      ? askedType
      : parentCat?.ticket_types && !parentCat.ticket_types.includes("incident")
        ? "service_request"
        : "incident"
  const cat = checkCategory(config, ticketType, categoryRaw, clean(params.sub_category))
  if ("error" in cat) throw httpError(422, cat.error === "That category is not available" ? "Choose a category." : `${cat.error}.`)
  const category = cat.category
  const subCategory = cat.subCategory

  // Priority: from impact × urgency when given, else the priority chosen in the form
  const asked = { impact: clean(params.impact), urgency: clean(params.urgency), priority: clean(params.priority) }
  if (!(asked.impact && asked.urgency) && !isPriority(asked.priority)) {
    throw httpError(422, "Choose a priority: low, medium or high.")
  }
  const { impact, urgency, priority } = resolvePriority(config, asked, false)
  const sla = slaDeadlines(config, ticketType, priority, new Date())
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
      tenant_id: tenantId,
      requester_id: me.id,
      requester_name: requesterName,
      contact,
      subject,
      description,
      ticket_type: ticketType,
      category,
      sub_category: subCategory,
      impact,
      urgency,
      priority,
      status: "new",
      location,
      link,
      sla_response_at: sla.sla_response_at,
      sla_resolution_at: sla.sla_resolution_at,
      sla_business_hours: sla.sla_business_hours,
    })
    .select("id, number, subject, status, created_at")
    .single()
  if (error || !ticket) throw error ?? new Error("The ticket was not created.")

  await db().from("ticket_activity").insert({
    tenant_id: tenantId,
    ticket_id: ticket.id,
    actor_id: me.id,
    action: "created",
    details: { source: "askmira" },
  })
  if (assetId) {
    await db().from("asset_tickets").insert({ tenant_id: tenantId, ticket_id: ticket.id, asset_id: assetId })
  }

  const ref = shortRef(ticket.id)
  // Same as the helpdesk's New Ticket form: confirmation email (with the
  // details) to the requester, web notification to the tenant's IT team.
  defer(() =>
    notifyTicketEvent(db(), {
      event: "created",
      ticket: {
        id: ticket.id,
        number: ticket.number,
        tenant_id: tenantId,
        subject,
        requester_id: me.id,
        requester_name: requesterName,
        description,
        category,
        sub_category: subCategory,
        priority,
        location,
        contact,
      },
      actorId: me.id,
    })
  )

  console.log(`[AskMiraa] ticket #${ref} raised for ${org.name} (${org.id}) by ${me.email}`)
  return {
    ticket: {
      id: ticket.id,
      ref,
      number: ticket.number,
      ticket_type: ticketType,
      priority,
      subject,
      status: ticket.status,
      created_at: ticket.created_at,
    },
  }
}

async function reply(ctx: Ctx) {
  const { me, params } = ctx
  const ticket = await openTicket(ctx, params.ticket_id)
  if (!mayWrite(me, ticket)) {
    throw httpError(
      403,
      ticket.assignee
        ? "Only the person who raised it and the engineer assigned to it write on a ticket."
        : `Acquire this ticket in ${BRAND} before writing on it.`
    )
  }
  const text = clean(params.message, 4000)
  if (!text) throw httpError(422, "Write a message first.")
  if (ticket.status === "closed") {
    throw httpError(409, `This ticket is closed. Reopen it in ${BRAND} to write on it again.`)
  }
  const support = isStaff(me) && ticket.requester_id !== me.id
  const { data: message, error } = await db()
    .from("ticket_messages")
    .insert({
      tenant_id: ticket.tenant_id,
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
        tenant_id: ticket.tenant_id,
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
          audience: support ? "requester" : "staff",
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
