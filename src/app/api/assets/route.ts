import { NextResponse } from "next/server"
import { jsonError, requireActor, targetTenant } from "@/lib/ticket-server"
import {
  AssetError,
  assertCodeFree,
  assetFields,
  resolveAssignee,
  resolveCompany,
  saveAssignment,
  saveDetails,
} from "@/lib/assets-server"

export const runtime = "nodejs"

/**
 * POST /api/assets  (IT team)
 * {
 *   asset: { asset_code, asset_type, model, status, location, department,
 *            purchase_date, warranty_expiry, organization_id? | company_name? },
 *   details?: { serial_no, cpu, ram, storage, os_name, mac_address, vendor },
 *   assigned_user_id? | assigned_user_email?,
 *   tenant_id?            (super admin only)
 * }
 * → { id } or { error, code? }   (code "duplicate_code" when the asset code is taken)
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const input = (body.asset ?? {}) as Record<string, unknown>

    const tenantId = targetTenant(me, body.tenant_id)
    if (!tenantId) return jsonError("Organisation not found", 404)
    if (tenantId !== me.tenant_id) {
      const { data: t } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle()
      if (!t) return jsonError("Organisation not found", 404)
    }

    const fields = assetFields(input, false)
    await assertCodeFree(db, tenantId, fields.asset_code as string)
    const organizationId = await resolveCompany(db, tenantId, input)
    const assignee = await resolveAssignee(db, tenantId, body)

    const { data: asset, error } = await db
      .from("assets")
      .insert({ ...fields, tenant_id: tenantId, organization_id: organizationId ?? null })
      .select("id")
      .single()
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Asset code already exists", code: "duplicate_code" }, { status: 409 })
      throw error
    }

    await saveDetails(db, tenantId, asset.id, body.details, false)
    if (assignee) await saveAssignment(db, tenantId, asset.id, assignee, me.id)

    return NextResponse.json({ id: asset.id })
  } catch (err) {
    if (err instanceof AssetError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error("Asset create failed:", err)
    return jsonError("Internal server error", 500)
  }
}
