import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

export const runtime = "nodejs"

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get("token")
    const uid = searchParams.get("uid")

    if (!token || !uid) {
      return NextResponse.json(
        { error: "Missing token or user ID" },
        { status: 400 }
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    /* 1. Find user by ID */
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, verification_token, token_expiry, is_verified")
      .eq("id", uid)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid verification link" },
        { status: 400 }
      )
    }

    /* 2. Already verified */
    if (user.is_verified) {
      return NextResponse.json({
        success: true,
        message: "Email already verified. You can log in.",
        already_verified: true,
      })
    }

    /* 3. Check token exists */
    if (!user.verification_token) {
      return NextResponse.json(
        { error: "No pending verification. Please request a new link." },
        { status: 400 }
      )
    }

    /* 4. Check token expiry */
    if (user.token_expiry && new Date(user.token_expiry) < new Date()) {
      return NextResponse.json(
        { error: "Verification link has expired. Please request a new one from the login page." },
        { status: 410 }
      )
    }

    /* 5. Validate hashed token */
    const hashedToken = hashToken(token)
    if (hashedToken !== user.verification_token) {
      return NextResponse.json(
        { error: "Invalid verification link" },
        { status: 400 }
      )
    }

    /* 6. Mark as verified + clear token (single-use) */
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        is_verified: true,
        verification_token: null,
        token_expiry: null,
      })
      .eq("id", uid)

    if (updateError) {
      console.error("Verification update failed:", updateError)
      return NextResponse.json(
        { error: "Failed to verify email" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    })
  } catch (err) {
    console.error("Verify email failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
