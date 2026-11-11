import { NextResponse } from "next/server"
import { canAdministerTenant, jsonError, requireActor, text, UUID_RE } from "@/lib/ticket-server"

export const runtime = "nodejs"

/** Profile fields an admin may edit for a member (people edit their own directly). */
const PROFILE_FIELDS = [
  "full_name", "phone", "employee_id", "designation", "department", "position", "manager",
  "present_address", "permanent_address", "city", "postal_code", "country",
] as const

/**
 * PATCH /api/users/:id  (tenant admin, or super admin)
 * { full_name?, phone?, …, organization_id? }   — not role (see /api/user/role)
 * Admins edit members of their own tenant, except super admins.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const { id } = await params
    if (!UUID_RE.test(id)) return jsonError("Member not found", 404)

    const { data: target } = await db.from("users").select("id, role, tenant_id").eq("id", id).maybeSingle()
    if (!target || !canAdministerTenant(me, target.tenant_id)) return jsonError("Member not found", 404)
    if (target.role === "superadmin" && me.id !== target.id && me.role !== "superadmin") {
      return jsonError("Only a super admin can edit a super admin", 403)
    }

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    for (const f of PROFILE_FIELDS) {
      if (body[f] !== undefined) patch[f] = text(body[f], f.endsWith("address") ? 500 : 200)
    }

    if (body.organization_id !== undefined) {
      const orgId = text(body.organization_id, 64)
      if (orgId) {
        const { data: org } = await db
          .from("organizations")
          .select("id")
          .eq("id", orgId)
          .eq("tenant_id", target.tenant_id)
          .maybeSingle()
        if (!org) return jsonError("That company does not belong to this organisation", 400)
      }
      patch.organization_id = orgId
    }

    if (Object.keys(patch).length === 0) return jsonError("Nothing to change", 400)
    if ("full_name" in patch && !patch.full_name) return jsonError("Name cannot be empty", 400)

    const { data, error } = await db.from("users").update(patch).eq("id", id).select("*").single()
    if (error) throw error

    return NextResponse.json({ user: data })
  } catch (err) {
    console.error("Member update failed:", err)
    return jsonError("Internal server error", 500)
  }
}
