import { NextResponse } from "next/server"
import { canAdministerTenant, jsonError, requireActor } from "@/lib/ticket-server"

export const runtime = "nodejs"

/**
 * POST /api/user/delete  { target_user_id }
 * An admin removes a member of their own tenant (a super admin: of any tenant).
 * Admins and super admins cannot be deleted this way; change their role first.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const { target_user_id } = await req.json().catch(() => ({}))
    if (!target_user_id) return jsonError("Missing target_user_id", 400)
    if (target_user_id === me.id) return jsonError("Cannot delete yourself", 400)

    const { data: target } = await db
      .from("users")
      .select("id, role, tenant_id")
      .eq("id", target_user_id)
      .maybeSingle()
    if (!target || !canAdministerTenant(me, target.tenant_id)) return jsonError("User not found", 404)

    if (target.role === "admin" || target.role === "superadmin") {
      return jsonError("Cannot delete admin or superadmin accounts", 403)
    }

    // Profile first: if their tickets or assets still reference them the
    // database refuses, and nothing is half-deleted.
    const { error: dbDeleteError } = await db.from("users").delete().eq("id", target_user_id)
    if (dbDeleteError) {
      console.error("DB delete failed:", dbDeleteError)
      return jsonError(
        "This person can't be deleted because tickets or assets still refer to them. Change their role or reassign their items instead.",
        409
      )
    }

    // Then the login itself — this also ends their sessions
    const { error: authDeleteError } = await db.auth.admin.deleteUser(target_user_id)
    if (authDeleteError) {
      console.error("Auth delete failed:", authDeleteError)
      // Without a profile the login reaches nothing (RLS), but say so
      return NextResponse.json({
        success: true,
        warning: "The profile was removed, but the sign-in account could not be deleted. Remove it in Supabase Auth.",
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("User delete failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
