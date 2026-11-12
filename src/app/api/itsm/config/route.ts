import { NextResponse } from "next/server"
import { jsonError, requireActor, targetTenant } from "@/lib/ticket-server"
import { isAdminRole } from "@/lib/ticket-access"
import { loadItsmConfig } from "@/lib/itsm-server"

export const runtime = "nodejs"

/**
 * GET /api/itsm/config[?tenant_id=…]
 * The tenant's categories, priority matrix, SLA policies and working calendar,
 * for the ticket forms and the settings page. Inactive categories are only
 * returned to admins. A super admin may ask for any tenant.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireActor(req)
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const tenantId = targetTenant(me, new URL(req.url).searchParams.get("tenant_id"))
    if (!tenantId) return jsonError("Organisation not found", 404)
    if (tenantId !== me.tenant_id) {
      const { data: t } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle()
      if (!t) return jsonError("Organisation not found", 404)
    }

    const config = await loadItsmConfig(db, tenantId)
    if (!isAdminRole(me.role)) config.categories = config.categories.filter((c) => c.is_active)
    return NextResponse.json({ tenant_id: tenantId, ...config })
  } catch (err) {
    console.error("ITSM config load failed:", err)
    return jsonError("Internal server error", 500)
  }
}
