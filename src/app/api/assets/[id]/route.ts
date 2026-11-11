import { NextResponse } from "next/server"
import { inTenant, jsonError, requireActor, UUID_RE } from "@/lib/ticket-server"
import {
  AssetError,
  assertCodeFree,
  assetFields,
  deleteAssets,
  resolveAssignee,
  resolveCompany,
  saveAssignment,
  saveDetails,
} from "@/lib/assets-server"

export const runtime = "nodejs"

async function load(req: Request, params: Promise<{ id: string }>) {
  const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError("Asset not found", 404)
  const { data: asset } = await ctx.db.from("assets").select("id, tenant_id").eq("id", id).maybeSingle()
  if (!asset || !inTenant(ctx.me, asset.tenant_id)) return jsonError("Asset not found", 404)
  return { ...ctx, asset }
}

/**
 * PATCH /api/assets/:id  (IT team)
 * Same body as POST /api/assets; only the fields present are changed.
 * `details`, when present, replaces all detail values.
 * `assigned_user_id: null` returns the asset (assigned to nobody).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await load(req, params)
    if (ctx instanceof Response) return ctx
    const { db, me, asset } = ctx
    const tenantId = asset.tenant_id as string

    const body = await req.json().catch(() => ({}))
    const input = (body.asset ?? {}) as Record<string, unknown>

    const fields = assetFields(input, true)
    if (fields.asset_code) await assertCodeFree(db, tenantId, fields.asset_code as string, asset.id)
    const organizationId = await resolveCompany(db, tenantId, input)
    if (organizationId !== undefined) fields.organization_id = organizationId
    const assignee = await resolveAssignee(db, tenantId, body)

    if (Object.keys(fields).length) {
      const { error } = await db.from("assets").update(fields).eq("id", asset.id)
      if (error) {
        if (error.code === "23505") return NextResponse.json({ error: "Asset code already exists", code: "duplicate_code" }, { status: 409 })
        throw error
      }
    }

    if (body.details !== undefined) await saveDetails(db, tenantId, asset.id, body.details, true)
    if (assignee !== undefined) await saveAssignment(db, tenantId, asset.id, assignee, me.id)

    return NextResponse.json({ id: asset.id })
  } catch (err) {
    if (err instanceof AssetError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error("Asset update failed:", err)
    return jsonError("Internal server error", 500)
  }
}

/** DELETE /api/assets/:id  (IT team) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await load(req, params)
    if (ctx instanceof Response) return ctx
    await deleteAssets(ctx.db, [ctx.asset.id], null)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AssetError) return jsonError(err.message, err.status)
    console.error("Asset delete failed:", err)
    return jsonError("Internal server error", 500)
  }
}
