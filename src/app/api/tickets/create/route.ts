import { NextResponse, after } from "next/server"
import { randomUUID } from "crypto"
import { notifyTicketEvent } from "@/lib/ticket-notify"
import { inTenant, jsonError, loadPerson, requireActor, text, UUID_RE } from "@/lib/ticket-server"
import { isStaffRole } from "@/lib/ticket-access"
import { CHANGE_TYPES, REQUESTER_TICKET_TYPES, isLevel, isTicketType, type TicketType } from "@/lib/itsm"
import { checkCategory, loadItsmConfig, resolvePriority, slaDeadlines } from "@/lib/itsm-server"
import { plannedWindow } from "@/lib/ticket-fields"

export const runtime = "nodejs"

const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/zip", "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-outlook", "message/rfc822",
])

/** File name safe to put in a storage key. */
function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "")
  return (cleaned || "file").slice(-120)
}

/**
 * POST /api/tickets/create  (multipart form)
 * A ticket always belongs to its requester's tenant. Staff may raise one for
 * someone else in their own tenant (a super admin: in any tenant).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req)
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const formData = await req.formData()

    /* Requester: yourself, or (staff only) someone in a tenant you work */
    const askedFor = formData.get("requester_id")?.toString() || me.id
    let requester = me
    if (askedFor !== me.id) {
      if (!isStaffRole(me.role)) return jsonError("Only the IT team can raise tickets for someone else", 403)
      if (!UUID_RE.test(askedFor)) return jsonError("Requester not found", 400)
      const other = await loadPerson(db, askedFor)
      if (!other || !inTenant(me, other.tenant_id)) return jsonError("Requester not found", 400)
      requester = other
    }
    const tenantId = requester.tenant_id

    const subject = text(formData.get("subject")?.toString(), 200)
    if (!subject) return jsonError("A subject is required", 400)

    /* Record type: requesters raise incidents and service requests; the IT team anything */
    const staff = isStaffRole(me.role)
    const typeRaw = formData.get("ticket_type")?.toString() || "incident"
    if (!isTicketType(typeRaw)) return jsonError("Unknown record type", 400)
    const ticketType: TicketType = typeRaw
    if (!staff && !REQUESTER_TICKET_TYPES.includes(ticketType)) {
      return jsonError("Problems and changes are raised by the IT team", 403)
    }

    /* Category (from the tenant's list), priority (impact × urgency) and SLA deadlines */
    const config = await loadItsmConfig(db, tenantId)
    const cat = checkCategory(
      config,
      ticketType,
      text(formData.get("category")?.toString(), 100),
      text(formData.get("sub_category")?.toString(), 100)
    )
    if ("error" in cat) return jsonError(cat.error, 400)
    const { impact, urgency, priority } = resolvePriority(
      config,
      {
        impact: formData.get("impact")?.toString(),
        urgency: formData.get("urgency")?.toString(),
        priority: formData.get("priority")?.toString(),
      },
      staff
    )

    /* Problem and change details (IT team only) */
    const extra: Record<string, unknown> = {}
    if (staff && ticketType === "problem") {
      extra.root_cause = text(formData.get("root_cause")?.toString(), 10000)
      extra.workaround = text(formData.get("workaround")?.toString(), 10000)
      extra.known_error = formData.get("known_error")?.toString() === "true"
    }
    if (staff && ticketType === "change") {
      const changeType = formData.get("change_type")?.toString() || "normal"
      if (!(CHANGE_TYPES as readonly string[]).includes(changeType)) return jsonError("Unknown change type", 400)
      const risk = formData.get("risk")?.toString() || null
      if (risk && !isLevel(risk)) return jsonError("Risk must be low, medium or high", 400)
      const window = plannedWindow(formData.get("planned_start")?.toString(), formData.get("planned_end")?.toString())
      if ("error" in window) return jsonError(window.error, 400)
      Object.assign(extra, {
        change_type: changeType,
        risk,
        planned_start: window.start,
        planned_end: window.end,
        implementation_plan: text(formData.get("implementation_plan")?.toString(), 10000),
        backout_plan: text(formData.get("backout_plan")?.toString(), 10000),
      })
    }

    /* Asset: must be in the ticket's tenant, and a user may only pick one assigned to them */
    const assetId = formData.get("asset_id")?.toString() || null
    if (assetId) {
      if (!UUID_RE.test(assetId)) return jsonError("Asset not found", 400)
      const { data: asset } = await db.from("assets").select("id, tenant_id").eq("id", assetId).maybeSingle()
      if (!asset || asset.tenant_id !== tenantId) return jsonError("Asset not found", 400)
      if (!isStaffRole(me.role)) {
        const { data: held } = await db
          .from("asset_assignments")
          .select("id")
          .eq("asset_id", assetId)
          .eq("user_id", requester.id)
          .is("returned_at", null)
          .limit(1)
        if (!held?.length) return jsonError("You can only link an asset assigned to you", 403)
      }
    }

    /* Attachments: checked before anything is written */
    const files = (formData.getAll("attachments") as File[]).filter((f) => f && f.size > 0)
    if (files.length > MAX_FILES) return jsonError(`Attach at most ${MAX_FILES} files`, 400)
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return jsonError(`${f.name} is larger than 10 MB`, 400)
      if (!ALLOWED_TYPES.has(f.type)) return jsonError(`${f.name}: this file type is not allowed`, 400)
    }

    /* Insert ticket (the database gives it its number, e.g. INC0001012) */
    const now = new Date()
    const sla = slaDeadlines(config, ticketType, priority, now)
    const { data: ticket, error: ticketError } = await db
      .from("tickets")
      .insert({
        tenant_id: tenantId,
        requester_id: requester.id,
        requester_name:
          text(formData.get("requester_name")?.toString(), 200) ?? requester.full_name ?? requester.email ?? "",
        contact: text(formData.get("contact")?.toString(), 100),
        subject,
        description: text(formData.get("description")?.toString(), 10000),
        ticket_type: ticketType,
        category: cat.category,
        sub_category: cat.subCategory,
        impact,
        urgency,
        priority,
        status: "new",
        location: text(formData.get("location")?.toString(), 200),
        link: text(formData.get("link")?.toString(), 1000),
        sla_response_at: sla.sla_response_at,
        sla_resolution_at: sla.sla_resolution_at,
        sla_business_hours: sla.sla_business_hours,
        ...extra,
      })
      .select()
      .single()

    if (ticketError || !ticket) throw ticketError ?? new Error("Ticket not saved")

    await db.from("ticket_activity").insert({
      tenant_id: tenantId,
      ticket_id: ticket.id,
      actor_id: me.id,
      action: "created",
      details: requester.id !== me.id ? { on_behalf_of: requester.id } : {},
    })

    if (assetId) {
      const { error } = await db
        .from("asset_tickets")
        .insert({ tenant_id: tenantId, ticket_id: ticket.id, asset_id: assetId })
      if (error) throw error
    }

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const filePath = `tenants/${tenantId}/tickets/${ticket.id}/${randomUUID()}-${safeName(file.name)}`

      const { error: uploadError } = await db.storage
        .from("ticket-attachments")
        .upload(filePath, buffer, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const { error: attachmentError } = await db.from("ticket_attachments").insert({
        tenant_id: tenantId,
        ticket_id: ticket.id,
        file_name: file.name.slice(0, 255),
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
      })
      if (attachmentError) throw attachmentError
    }

    /* Requester gets a confirmation email; the tenant's IT team a web notification */
    after(() =>
      notifyTicketEvent(db, { event: "created", ticket, actorId: me.id }).catch((err) =>
        console.error("New ticket notifications failed:", err)
      )
    )

    return NextResponse.json({ success: true, ticketId: ticket.id, number: ticket.number })
  } catch (err) {
    console.error("Ticket create failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
