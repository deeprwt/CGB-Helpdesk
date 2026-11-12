import { NextResponse } from "next/server"
import { jsonError } from "@/lib/ticket-server"
import { requireTenantAdmin } from "@/lib/itsm-admin"
import { LEVELS, isLevel, isPriority } from "@/lib/itsm"

export const runtime = "nodejs"

/**
 * PUT /api/admin/itsm/matrix  (tenant admin, or super admin)
 * { tenant_id?, cells: [{ impact, urgency, priority }] }   — all 9 cells
 * Applies to tickets raised or re-classified from now on.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ctx = await requireTenantAdmin(req, body.tenant_id)
    if (ctx instanceof Response) return ctx
    const { db, tenantId } = ctx

    const cells = Array.isArray(body.cells) ? body.cells : []
    const seen = new Set<string>()
    for (const c of cells) {
      if (!isLevel(c?.impact) || !isLevel(c?.urgency) || !isPriority(c?.priority)) {
        return jsonError("Each cell needs impact, urgency (low/medium/high) and a priority", 400)
      }
      seen.add(`${c.impact}/${c.urgency}`)
    }
    if (seen.size !== LEVELS.length * LEVELS.length || cells.length !== seen.size) {
      return jsonError("Send each of the 9 impact × urgency cells exactly once", 400)
    }

    const { error } = await db.from("priority_matrix").upsert(
      cells.map((c: { impact: string; urgency: string; priority: string }) => ({
        tenant_id: tenantId,
        impact: c.impact,
        urgency: c.urgency,
        priority: c.priority,
      })),
      { onConflict: "tenant_id,impact,urgency" }
    )
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Priority matrix save failed:", err)
    return jsonError("Internal server error", 500)
  }
}
