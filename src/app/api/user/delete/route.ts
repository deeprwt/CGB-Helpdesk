import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    /* 1. Validate auth */
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

    /* 2. Verify caller is admin/superadmin */
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    /* 3. Get target user id */
    const body = await req.json()
    const { target_user_id } = body

    if (!target_user_id) {
      return NextResponse.json({ error: "Missing target_user_id" }, { status: 400 })
    }

    // Prevent self-deletion
    if (target_user_id === user.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 })
    }

    // Prevent deleting other admins/superadmins
    const { data: targetUser } = await supabaseAdmin
      .from("users")
      .select("role, name")
      .eq("id", target_user_id)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (targetUser.role === "admin" || targetUser.role === "superadmin") {
      return NextResponse.json(
        { error: "Cannot delete admin or superadmin accounts" },
        { status: 403 }
      )
    }

    /* 4. Delete from users table first */
    const { error: dbDeleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", target_user_id)

    if (dbDeleteError) {
      console.error("DB delete failed:", dbDeleteError)
      return NextResponse.json(
        { error: "Failed to delete user record" },
        { status: 500 }
      )
    }

    /* 5. Delete from auth.users — this invalidates all sessions */
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(target_user_id)

    if (authDeleteError) {
      console.error("Auth delete failed:", authDeleteError)
      // User record already deleted, log the auth failure
      // but don't fail the request — the user is effectively removed
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("User delete failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
