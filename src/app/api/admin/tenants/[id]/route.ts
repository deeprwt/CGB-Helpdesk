import { NextResponse } from "next/server"
import { jsonError, requireActor, text, UUID_RE } from "@/lib/ticket-server"

export const runtime = "nodejs"

/**
 * PATCH /api/admin/tenants/:id  (super admin)
 * { name?, status?: "active" | "suspended" }
 * Suspending a tenant locks its people out (the database stops returning its
 * data to them) until it is reactivated. Super admins keep access.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireActor(req, { roles: ["superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db } = ctx

    const { id } = await params
    if (!UUID_RE.test(id)) return jsonError("Tenant not found", 404)

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = text(body.name, 120)
      if (!name) return jsonError("A tenant name is required", 400)
      patch.name = name
    }
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "suspended") return jsonError("Invalid status", 400)
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return jsonError("Nothing to change", 400)

    const { data, error } = await db
      .from("tenants")
      .update(patch)
      .eq("id", id)
      .select("id, name, slug, status, created_at")
      .maybeSingle()
    if (error) throw error
    if (!data) return jsonError("Tenant not found", 404)

    return NextResponse.json({ tenant: data })
  } catch (err) {
    console.error("Tenant update failed:", err)
    return jsonError("Internal server error", 500)
  }
}
