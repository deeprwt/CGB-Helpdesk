import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    /* -----------------------------------
       1️⃣ Get cookies (ASYNC in Next 14)
    ----------------------------------- */
    const cookieStore = await cookies()

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    /* -----------------------------------
       2️⃣ Admin client (secret key)
    ----------------------------------- */
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const formData = await req.formData()
    const files = formData.getAll("attachments") as File[]

    /* -----------------------------------
       3️⃣ Insert ticket
    ----------------------------------- */
    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        requester_id: user.id,
        requester_name: formData.get("requester_name"),
        contact: formData.get("contact"),
        subject: formData.get("subject"),
        description: formData.get("description"),
        category: formData.get("category"),
        sub_category: formData.get("sub_category"),
        priority: formData.get("priority"),
        status: "new",
        urgency: formData.get("urgency"),
        impact: formData.get("impact"),
        assignee: formData.get("assignee"),
        location: formData.get("location"),
        inventory: formData.get("inventory"),
        link: formData.get("link"),
        cc: formData.get("cc"),
      })
      .select()
      .single()

    if (error) throw error

    /* -----------------------------------
       4️⃣ Upload attachments
    ----------------------------------- */
    for (const file of files) {
      if (!file || file.size === 0) continue

      const buffer = await file.arrayBuffer()
      const path = `tickets/${ticket.id}/${Date.now()}-${file.name}`

      await supabaseAdmin.storage
        .from("ticket-attachments")
        .upload(path, buffer, {
          contentType: file.type,
        })

      await supabaseAdmin.from("ticket_attachments").insert({
        ticket_id: ticket.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
      })
    }

    return NextResponse.json({ success: true, ticketId: ticket.id })
  } catch (err) {
    console.error("Ticket create failed:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
