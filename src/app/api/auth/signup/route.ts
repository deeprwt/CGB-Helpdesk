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
    const { email, password, first_name, last_name } = body as {
      email: string
      password: string
      first_name: string
      last_name: string
    }

    if (!email || !password || !first_name || !last_name) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    /* 1. Check organization whitelist */
    const domain = email.split("@")[1]?.toLowerCase()
    if (!domain) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      )
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("domain", domain)
      .eq("status", "active")
      .maybeSingle()

    if (!org) {
      return NextResponse.json(
        { error: "Your organization does not have permission to sign up. Please contact the administrator." },
        { status: 403 }
      )
    }

    /* 2. Check if user already exists (fast — query users table, not auth) */
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    /* 3. Create auth user via admin API */
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          first_name,
          last_name,
        },
      })

    if (authError || !authData.user) {
      console.error("Auth signup failed:", authError)
      return NextResponse.json(
        { error: authError?.message ?? "Failed to create account" },
        { status: 500 }
      )
    }

    /* 4. Generate verification token */
    const rawToken = randomBytes(32).toString("hex")
    const hashedToken = hashToken(rawToken)
    const tokenExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min

    /* 5. Store hashed token in users table */
    await supabaseAdmin
      .from("users")
      .update({
        verification_token: hashedToken,
        token_expiry: tokenExpiry,
        is_verified: false,
      })
      .eq("id", authData.user.id)

    /* 6. Send verification email (non-blocking — don't wait for SMTP) */
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const verificationUrl = `${appUrl}/verify-email?token=${rawToken}&uid=${authData.user.id}`

    sendVerificationEmail({
      to: email,
      recipientName: `${first_name} ${last_name}`.trim(),
      verificationUrl,
    }).catch((err) => {
      console.error("Verification email failed:", err)
    })

    return NextResponse.json({
      success: true,
      message: "Account created. Please check your email to verify.",
    })
  } catch (err) {
    console.error("Signup failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
