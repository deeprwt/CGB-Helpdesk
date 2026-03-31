import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomBytes, createHash } from "crypto"
import { sendVerificationEmail } from "@/lib/email"

export const runtime = "nodejs"

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email } = body as { email: string }

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    /* 1. Find user */
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, full_name, is_verified")
      .eq("email", email.toLowerCase())
      .single()

    if (userError || !user) {
      // Don't reveal if user exists or not
      return NextResponse.json({
        success: true,
        message: "If an account exists with that email, a verification link has been sent.",
      })
    }

    /* 2. Already verified */
    if (user.is_verified) {
      return NextResponse.json({
        success: true,
        message: "Your email is already verified. You can log in.",
        already_verified: true,
      })
    }

    /* 3. Generate new token */
    const rawToken = randomBytes(32).toString("hex")
    const hashedToken = hashToken(rawToken)
    const tokenExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    /* 4. Update user with new token */
    await supabaseAdmin
      .from("users")
      .update({
        verification_token: hashedToken,
        token_expiry: tokenExpiry,
      })
      .eq("id", user.id)

    /* 5. Send verification email */
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const verificationUrl = `${appUrl}/verify-email?token=${rawToken}&uid=${user.id}`

    sendVerificationEmail({
      to: email,
      recipientName: user.full_name || "User",
      verificationUrl,
    }).catch((err) => {
      console.error("Resend verification email failed:", err)
    })

    return NextResponse.json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
    })
  } catch (err) {
    console.error("Resend verification failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
