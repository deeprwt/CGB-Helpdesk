import { NextResponse, after } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { notifyTicketEvent } from "@/lib/ticket-notify"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    /* -----------------------------------
       1️⃣ Validate Authorization header
    ----------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = authHeader.replace("Bearer ", "")

    /* -----------------------------------
       2️⃣ User-auth client (token-based)
    ----------------------------------- */
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    /* -----------------------------------
       3️⃣ Admin client (service role)
    ----------------------------------- */
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      }
    )

    /* -----------------------------------
       4️⃣ Read form data
    ----------------------------------- */
    const formData = await req.formData()
    const files = formData.getAll("attachments") as File[]

    // Only staff may raise a ticket on someone else's behalf; a regular
    // user's ticket (and its confirmation email) always belongs to them
    const { data: creator } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    const requesterId =
      creator && creator.role !== "user"
        ? formData.get("requester_id")?.toString() || user.id
        : user.id

    const { data: requester } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", requesterId)
      .single()

    if (!requester) {
      return NextResponse.json(
        { error: "Requester not found" },
        { status: 400 }
      )
    }

    /* -----------------------------------
       5️⃣ Insert ticket
    ----------------------------------- */
    const now = new Date()
    const slaResponseAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .insert({
        requester_id: requesterId,
        requester_name: formData.get("requester_name")?.toString() ?? "",
        contact: formData.get("contact")?.toString() ?? null,
        subject: formData.get("subject")?.toString() ?? "",
        description: formData.get("description")?.toString() ?? null,
        category: formData.get("category")?.toString() ?? null,
        sub_category: formData.get("sub_category")?.toString() ?? null,
        priority: formData.get("priority")?.toString() ?? null,
        status: "new",
        location: formData.get("location")?.toString() ?? null,
        link: formData.get("link")?.toString() ?? null,
        sla_response_at: slaResponseAt,
      })
      .select()
      .single()

    if (ticketError || !ticket) {
      throw ticketError
    }

    /* Log ticket creation activity */
    await supabaseAdmin.from("ticket_activity").insert({
      ticket_id: ticket.id,
      actor_id: requesterId,
      action: "created",
      details: {},
    })

    /* -----------------------------------
       5.5️⃣ Requester gets a confirmation email with the ticket details;
       the IT team of the requester's organization gets a web notification.
       after() runs once the response is sent, so the user is redirected
       straight away; Vercel keeps the function alive until it finishes.
    ----------------------------------- */
    after(() =>
      notifyTicketEvent(supabaseAdmin, {
        event: "created",
        ticket,
        actorId: user.id,
      }).catch((err) => console.error("New ticket notifications failed:", err))
    )

    /* -----------------------------------
       6️⃣ Link asset (if provided)
    ----------------------------------- */
    const assetId = formData.get("asset_id")?.toString()

    if (assetId) {
      const { error: assetLinkError } = await supabaseAdmin
        .from("asset_tickets")
        .insert({
          ticket_id: ticket.id,
          asset_id: assetId,
        })

      if (assetLinkError) {
        throw assetLinkError
      }
    }

    /* -----------------------------------
       7️⃣ Upload attachments
    ----------------------------------- */
    for (const file of files) {
      if (!file || file.size === 0) continue

      const buffer = Buffer.from(await file.arrayBuffer())
      const filePath = `tickets/${ticket.id}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from("ticket-attachments")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { error: attachmentError } = await supabaseAdmin
        .from("ticket_attachments")
        .insert({
          ticket_id: ticket.id,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
        })

      if (attachmentError) throw attachmentError
    }

    /* -----------------------------------
       8️⃣ Success
    ----------------------------------- */
    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
    })
  } catch (err) {
    console.error("Ticket create failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
