import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTicketEmail, type EmailAction } from "@/lib/email"

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
    const {
      recipient_email,
      recipient_name,
      actor_name,
      ticket_id,
      ticket_subject,
      action,
      comment,
    } = body as {
      recipient_email: string
      recipient_name: string
      actor_name: string
      ticket_id: string
      ticket_subject: string
      action: EmailAction
      comment?: string | null
    }

    if (!recipient_email || !actor_name || !ticket_id || !ticket_subject || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    /* 4. Send email */
    await sendTicketEmail({
      to: recipient_email,
      recipientName: recipient_name ?? "User",
      actorName: actor_name,
      ticketId: ticket_id,
      ticketSubject: ticket_subject,
      action,
      comment: comment ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Email send failed:", err)
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    )
  }
}
