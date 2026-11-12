import { NextResponse } from "next/server"
import { jsonError, requireActor, staffCoversTicket, text, UUID_RE } from "@/lib/ticket-server"
import { CHANGE_TYPES, isLevel, isPriority, isTicketType, ticketRef, type TicketType } from "@/lib/itsm"
import { checkCategory, loadItsmConfig, resolvePriority, slaDeadlines } from "@/lib/itsm-server"
import { plannedWindow } from "@/lib/ticket-fields"

export const runtime = "nodejs"

/** Fields the IT team may edit, and their size limits. */
const TEXT_FIELDS = {
  subject: 200,
  description: 10000,
  root_cause: 10000,
  workaround: 10000,
  implementation_plan: 10000,
  backout_plan: 10000,
} as const

/**
 * PATCH /api/tickets/:id   (IT team of the ticket's tenant)
 * Re-classify or fill in details:
 *   { ticket_type?, category?, sub_category?, impact?, urgency?, priority?,
 *     subject?, description?, root_cause?, workaround?, known_error?,
 *     change_type?, risk?, planned_start?, planned_end?, implementation_plan?, backout_plan? }
 * When the type or priority changes on an open ticket, its SLA deadlines are
 * worked out again from when it was raised.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const { id } = await params
    if (!UUID_RE.test(id)) return jsonError("Ticket not found", 404)
    const { data: ticket } = await db.from("tickets").select("*").eq("id", id).maybeSingle()
    if (!ticket || !staffCoversTicket(me, ticket)) return jsonError("Ticket not found", 404)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return jsonError("Send the fields to change", 400)

    const config = await loadItsmConfig(db, ticket.tenant_id)
    const patch: Record<string, unknown> = {}

    /* Type */
    let type: TicketType = isTicketType(ticket.ticket_type) ? ticket.ticket_type : "incident"
    if ("ticket_type" in body) {
      if (!isTicketType(body.ticket_type)) return jsonError("Unknown record type", 400)
      type = body.ticket_type
      patch.ticket_type = type
    }

    /* Category */
    if ("category" in body || "sub_category" in body || "ticket_type" in body) {
      const cat = checkCategory(
        config,
        type,
        "category" in body ? text(body.category, 100) : ticket.category,
        "sub_category" in body ? text(body.sub_category, 100) : "category" in body ? null : ticket.sub_category
      )
      if ("error" in cat) return jsonError(cat.error, 400)
      patch.category = cat.category
      patch.sub_category = cat.subCategory
    }

    /* Impact, urgency, priority */
    if ("impact" in body || "urgency" in body || "priority" in body) {
      if ("impact" in body && body.impact !== null && !isLevel(body.impact)) return jsonError("Unknown impact", 400)
      if ("urgency" in body && body.urgency !== null && !isLevel(body.urgency)) return jsonError("Unknown urgency", 400)
      if ("priority" in body && !isPriority(body.priority)) return jsonError("Unknown priority", 400)
      const p = resolvePriority(
        config,
        {
          impact: "impact" in body ? body.impact : ticket.impact,
          urgency: "urgency" in body ? body.urgency : ticket.urgency,
          // An explicit priority overrides the matrix; otherwise re-derive it
          priority: "priority" in body ? body.priority : null,
        },
        true
      )
      patch.impact = p.impact
      patch.urgency = p.urgency
      patch.priority = "priority" in body || (p.impact && p.urgency) ? p.priority : ticket.priority
    }

    /* Text fields */
    for (const [field, max] of Object.entries(TEXT_FIELDS)) {
      if (field in body) patch[field] = text(body[field], max)
    }
    if ("subject" in patch && !patch.subject) return jsonError("A subject is required", 400)
    if ("known_error" in body) patch.known_error = body.known_error === true

    /* Change fields */
    if ("change_type" in body) {
      if (body.change_type !== null && !(CHANGE_TYPES as readonly string[]).includes(body.change_type)) {
        return jsonError("Unknown change type", 400)
      }
      patch.change_type = body.change_type
    }
    if ("risk" in body) {
      if (body.risk !== null && !isLevel(body.risk)) return jsonError("Risk must be low, medium or high", 400)
      patch.risk = body.risk
    }
    if ("planned_start" in body || "planned_end" in body) {
      const w = plannedWindow(
        "planned_start" in body ? body.planned_start : ticket.planned_start,
        "planned_end" in body ? body.planned_end : ticket.planned_end
      )
      if ("error" in w) return jsonError(w.error, 400)
      patch.planned_start = w.start
      patch.planned_end = w.end
    }

    /* Changes that only exist on one type are cleared when the type changes */
    if (type !== "change" && patch.ticket_type) {
      Object.assign(patch, {
        change_type: null, risk: null, planned_start: null, planned_end: null,
        implementation_plan: null, backout_plan: null,
      })
    }
    if (type === "change" && patch.ticket_type && !ticket.change_type && !("change_type" in body)) {
      patch.change_type = "normal"
    }

    /* Keep only real changes */
    const changed = Object.fromEntries(
      Object.entries(patch).filter(([k, v]) => (ticket[k] ?? null) !== (v ?? null))
    )
    if (Object.keys(changed).length === 0) return NextResponse.json({ success: true, ticket })

    /* New SLA deadlines when type or priority changed on a ticket still being worked */
    const priority = (changed.priority ?? ticket.priority) as string
    if (
      ("ticket_type" in changed || "priority" in changed) &&
      ["new", "open", "in_progress"].includes(ticket.status) &&
      isPriority(priority)
    ) {
      const sla = slaDeadlines(config, type, priority, new Date(ticket.created_at))
      const now = new Date()
      changed.sla_response_at = sla.sla_response_at
      changed.sla_resolution_at = sla.sla_resolution_at
      changed.sla_business_hours = sla.sla_business_hours
      // A breach is re-judged against the new deadlines by the next SLA check
      if (ticket.status === "new" && new Date(sla.sla_response_at) > now) changed.sla_response_breached = false
      if (new Date(sla.sla_resolution_at) > now) changed.sla_resolution_breached = false
    }
    changed.updated_at = new Date().toISOString()

    // Optimistic concurrency: only if nobody changed the ticket since we read it
    let q = db.from("tickets").update(changed).eq("id", id)
    q = ticket.updated_at ? q.eq("updated_at", ticket.updated_at) : q.is("updated_at", null)
    const { data: updated, error } = await q.select("*")
    if (error) throw error
    if (!updated?.length) return jsonError("The ticket was changed by someone else. Refresh and try again.", 409)

    // A type change also gives the ticket a new number (done by the database)
    if (updated[0].number !== ticket.number) changed.number = updated[0].number
    const fields = Object.keys(changed).filter((k) => k !== "updated_at" && !k.startsWith("sla_"))
    await db.from("ticket_activity").insert({
      tenant_id: ticket.tenant_id,
      ticket_id: id,
      actor_id: me.id,
      action: "updated",
      details: {
        fields,
        from: Object.fromEntries(fields.map((f) => [f, ticket[f] ?? null])),
        to: Object.fromEntries(fields.map((f) => [f, changed[f] ?? null])),
        engineer_name: me.full_name?.trim() || me.email || "Engineer",
        ref: ticketRef(updated[0]),
      },
    })

    return NextResponse.json({ success: true, ticket: updated[0] })
  } catch (err) {
    console.error("Ticket update failed:", err)
    return jsonError("Internal server error", 500)
  }
}
