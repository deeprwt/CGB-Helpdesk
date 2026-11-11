import { NextResponse } from "next/server"
import { jsonError, requireActor, UUID_RE } from "@/lib/ticket-server"
import { AssetError, deleteAssets } from "@/lib/assets-server"

export const runtime = "nodejs"

/**
 * POST /api/assets/bulk-delete  (IT team)  { ids: string[] }  (at most 500)
 * Only assets of the caller's tenant are deleted (super admin: any).
 * → { deleted }
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["engineer", "admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === "string" && UUID_RE.test(v)) : []
    if (!ids.length) return jsonError("No assets selected", 400)
    if (ids.length > 500) return jsonError("Delete at most 500 assets at a time", 400)

    const deleted = await deleteAssets(db, ids, me.role === "superadmin" ? null : me.tenant_id)
    return NextResponse.json({ deleted })
  } catch (err) {
    if (err instanceof AssetError) return jsonError(err.message, err.status)
    console.error("Bulk asset delete failed:", err)
    return jsonError("Internal server error", 500)
  }
}
