import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    /* 1. Validate Bearer token */
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization")

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = authHeader.replace("Bearer ", "")

    /* 2. Verify the calling user */
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

    /* 3. Parse body */
    const body = await req.json()
    const { user_id, actor_id, ticket_id, type, message } = body

    if (!user_id || !actor_id || !ticket_id || !type || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    /* 4. Don't notify yourself */
    if (user_id === actor_id) {
      return NextResponse.json({ skipped: true })
    }

    /* 5. Insert with service role (bypasses RLS) */
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id,
      actor_id,
      ticket_id,
      type,
      message,
      is_read: false,
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Notification create failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
