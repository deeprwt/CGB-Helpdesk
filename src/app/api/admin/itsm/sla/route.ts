import { NextResponse } from "next/server"
import { jsonError } from "@/lib/ticket-server"
import { requireTenantAdmin } from "@/lib/itsm-admin"
import { PRIORITIES, isPriority, isTicketType } from "@/lib/itsm"

export const runtime = "nodejs"

const MAX_MINUTES = 525600 // one year

/**
 * PUT /api/admin/itsm/sla  (tenant admin, or super admin)
 * { tenant_id?, policies: [{ ticket_type: null | type, priority, response_minutes,
 *                            resolution_minutes, business_hours }] }
 * Replaces the tenant's whole set. A default (ticket_type null) is required for
 * every priority; type-specific rows override it for that type.
 * Applies to tickets raised, re-classified, reopened or resumed from now on.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ctx = await requireTenantAdmin(req, body.tenant_id)
    if (ctx instanceof Response) return ctx
    const { db, tenantId } = ctx

    const list = Array.isArray(body.policies) ? body.policies : []
    const rows = []
    const keys = new Set<string>()
    for (const p of list) {
      const type = p?.ticket_type ?? null
      if (type !== null && !isTicketType(type)) return jsonError("Unknown record type in a policy", 400)
      if (!isPriority(p?.priority)) return jsonError("Unknown priority in a policy", 400)
      const response = Number(p.response_minutes)
      const resolution = Number(p.resolution_minutes)
      if (!Number.isInteger(response) || response < 1 || response > MAX_MINUTES) {
        return jsonError("Response time must be between 1 minute and 1 year", 400)
      }
      if (!Number.isInteger(resolution) || resolution < 1 || resolution > MAX_MINUTES) {
        return jsonError("Resolution time must be between 1 minute and 1 year", 400)
      }
      if (resolution < response) return jsonError("Resolution time cannot be shorter than response time", 400)
      const key = `${type ?? "*"}/${p.priority}`
      if (keys.has(key)) return jsonError("Each record type and priority can have only one policy", 400)
      keys.add(key)
      rows.push({
        ticket_type: type,
        priority: p.priority,
        response_minutes: response,
        resolution_minutes: resolution,
        business_hours: p.business_hours === true,
      })
    }
    for (const pr of PRIORITIES) {
      if (!keys.has(`*/${pr}`)) return jsonError(`A default policy is needed for ${pr} priority`, 400)
    }

    // Replace the whole set in one database transaction
    const { error } = await db.rpc("replace_sla_policies", { _tenant: tenantId, _rows: rows })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("SLA policy save failed:", err)
    return jsonError("Internal server error", 500)
  }
}
