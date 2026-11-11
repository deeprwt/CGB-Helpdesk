import { NextResponse } from "next/server"
import { APP_ROLES, canAdministerTenant, jsonError, requireActor, type AppRole } from "@/lib/ticket-server"

export const runtime = "nodejs"

/** Roles a tenant admin may hand out and take away. Super Admin stays with super admins. */
const ADMIN_MANAGED: AppRole[] = ["user", "engineer", "admin"]

/**
 * POST /api/user/role  { target_user_id, role }
 *
 * - superadmin: any role, for anyone except themselves
 * - admin: user / engineer / admin, for members of their own tenant (not super admins)
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const targetId: string | undefined = body?.target_user_id
    const newRole = body?.role as AppRole | undefined

    if (!targetId || !newRole || !APP_ROLES.includes(newRole)) {
      return jsonError("A user and a valid role are required", 400)
    }
    if (targetId === me.id) return jsonError("You cannot change your own role", 400)

    const { data: target } = await db
      .from("users")
      .select("id, role, tenant_id")
      .eq("id", targetId)
      .maybeSingle()
    if (!target || !canAdministerTenant(me, target.tenant_id)) return jsonError("User not found", 404)

    if (me.role === "admin" && (!ADMIN_MANAGED.includes(target.role) || !ADMIN_MANAGED.includes(newRole))) {
      return jsonError("Only a super admin can grant or change the Super Admin role", 403)
    }

    if (target.role === newRole) return NextResponse.json({ success: true, role: newRole })

    const { data: updated, error } = await db
      .from("users")
      .update({ role: newRole })
      .eq("id", targetId)
      .select("role")
      .single()

    if (error || !updated) {
      console.error("Role update failed:", error)
      return jsonError("Failed to change role", 500)
    }

    // Keep the auth record in step, so a re-created profile gets the same role
    await db.auth.admin
      .updateUserById(targetId, { app_metadata: { role: newRole, tenant_id: target.tenant_id } })
      .catch(() => {})

    return NextResponse.json({ success: true, role: updated.role })
  } catch (err) {
    console.error("Role change failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
