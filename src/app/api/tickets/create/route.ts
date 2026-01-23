import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

    /* -----------------------------------
       5️⃣ Insert ticket
    ----------------------------------- */
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .insert({
        requester_id: user.id,
        requester_name: formData.get("requester_name")?.toString() ?? null,
        contact: formData.get("contact")?.toString() ?? null,
        subject: formData.get("subject")?.toString() ?? null,
        description: formData.get("description")?.toString() ?? null,
        category: formData.get("category")?.toString() ?? null,
        sub_category: formData.get("sub_category")?.toString() ?? null,
        priority: formData.get("priority")?.toString() ?? null,
        status: "new",
        urgency: formData.get("urgency")?.toString() ?? null,
        impact: formData.get("impact")?.toString() ?? null,
        // assignee: formData.get("assignee")?.toString() ?? null,
        location: formData.get("location")?.toString() ?? null,
        inventory: formData.get("inventory")?.toString() ?? null,
        link: formData.get("link")?.toString() ?? null,
        cc: formData.get("cc")?.toString() ?? null,
      })
      .select()
      .single()

    if (ticketError || !ticket) {
      throw ticketError
    }

    /* -----------------------------------
       6️⃣ Upload attachments
    ----------------------------------- */
for (const file of files) {
  if (
    typeof file !== "object" ||
    !("arrayBuffer" in file) ||
    !("size" in file) ||
    file.size === 0
  ) {
    continue
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

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
       7️⃣ Success response
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
