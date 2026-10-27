import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { extractOrgDomain, getUserAccessibleDomains } from "@/lib/org"

export const runtime = "nodejs"

const ROLES = ["user", "engineer", "admin", "superadmin"] as const
type Role = (typeof ROLES)[number]

/** Roles an admin may hand out, and may take away (Super Admin stays with super admins) */
const ADMIN_MANAGED: Role[] = ["user", "engineer", "admin"]

/**
 * Changes a user's role.
 *
 * Runs with the service role because the users table's update policy only
 * lets a browser session edit rows in its own org, so a role change made
 * from the browser could silently save nothing.
 *
 * - superadmin: any role, for anyone except themselves
 * - admin: user / engineer / admin, for anyone except super admins,
 *   in organizations they can access
 */
export async function POST(req: Request) {
  try {
    /* 1. Who is calling */
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization")

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = authHeader.replace("Bearer ", "")
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!caller || (caller.role !== "admin" && caller.role !== "superadmin")) {
      return NextResponse.json(
        { error: "Only admins can change roles" },
        { status: 403 }
      )
    }

    /* 2. What they asked for */
    const body = await req.json().catch(() => ({}))
    const targetId: string | undefined = body?.target_user_id
    const newRole: Role | undefined = body?.role

    if (!targetId || !newRole || !ROLES.includes(newRole)) {
      return NextResponse.json(
        { error: "A user and a valid role are required" },
        { status: 400 }
      )
    }

    if (targetId === user.id) {
      return NextResponse.json(
        { error: "You cannot change your own role" },
        { status: 400 }
      )
    }

    const { data: target } = await supabaseAdmin
      .from("users")
      .select("id, role, email")
      .eq("id", targetId)
      .single()

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    /* 3. Admins: no Super Admin changes, and only inside their organizations */
    if (caller.role === "admin") {
      if (
        !ADMIN_MANAGED.includes(target.role as Role) ||
        !ADMIN_MANAGED.includes(newRole)
      ) {
        return NextResponse.json(
          { error: "Only a super admin can grant or change the Super Admin role" },
          { status: 403 }
        )
      }

      const domains = await getUserAccessibleDomains(
        supabaseAdmin,
        user.id,
        user.email ?? "",
        caller.role
      )

      if (!domains.includes(extractOrgDomain(target.email ?? ""))) {
        return NextResponse.json(
          { error: "This user is outside your organization" },
          { status: 403 }
        )
      }
    }

    if (target.role === newRole) {
      return NextResponse.json({ success: true, role: newRole })
    }

    /* 4. Save, and confirm a row actually changed */
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("users")
      .update({ role: newRole })
      .eq("id", targetId)
      .select("role")
      .single()

    if (updateError || !updated) {
      console.error("Role update failed:", updateError)
      return NextResponse.json(
        { error: updateError?.message ?? "Failed to change role" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, role: updated.role })
  } catch (err) {
    console.error("Role change failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
