"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Send } from "lucide-react"
import TicketMetaPanel from "@/components/tickets/ticket-details/TicketMetaPanel"

/* -----------------------------------
   Types
----------------------------------- */
type Ticket = {
  id: string
  subject: string
  description: string | null
  status: "new" | "open" | "in_progress" | "closed"
  priority: "low" | "medium" | "high"
  requester_name: string
  assignee: string | null
  created_at: string
  link: string | null
}

type Attachment = {
  id: string
  file_name: string
  file_path: string
}

type Profile = {
  avatar_url: string | null
}

type Message = {
  id: string
  message: string
  sender_id: string
  sender_role: "user" | "engineer"
  created_at: string
}

export default function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [message, setMessage] = React.useState("")

  /* -----------------------------------
     Load Ticket + Messages + Profile
  ----------------------------------- */
  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const [{ data: ticketData }, { data: chatData }, { data: attachmentData }, { data: profileData }] =
        await Promise.all([
          supabase.from("tickets").select("*").eq("id", id).single(),
          supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at"),
          supabase.from("ticket_attachments").select("id, file_name, file_path").eq("ticket_id", id),
          supabase.from("users").select("avatar_url").eq("id", user.id).single(),
        ])

      setTicket(ticketData)
      setMessages(chatData ?? [])
      setAttachments(attachmentData ?? [])
      setProfile(profileData)
      setLoading(false)
    }

    loadData()
  }, [id])

  /* -----------------------------------
     Send Message
  ----------------------------------- */
  const sendMessage = async () => {
    if (!message.trim()) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    await supabase.from("ticket_messages").insert({
      ticket_id: id,
      sender_id: user.id,
      sender_role: "user",
      message,
    })

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        message,
        sender_id: user.id,
        sender_role: "user",
        created_at: new Date().toISOString(),
      },
    ])

    setMessage("")
  }

  if (loading || !ticket) {
    return (
      <div className="p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-semibold">Ticket Details</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT: Ticket Meta */}
        <TicketMetaPanel
          ticketId={ticket.id}
          subject={ticket.subject}
          priority={ticket.priority}
          requesterName={ticket.requester_name}
          requesterAvatar={profile?.avatar_url ?? null}
          assigneeText={ticket.assignee}
          createdAt={ticket.created_at}
          attachments={attachments}
          link={ticket.link}
        />

        {/* CENTER: Chat */}
        <Card className="p-5 flex flex-col">
          <h3 className="font-semibold mb-3">Conversation</h3>

          <div className="flex-1 space-y-3 overflow-y-auto pr-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                  msg.sender_role === "user"
                    ? "ml-auto bg-blue-100 text-blue-900"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {msg.message}
                <div className="text-[10px] mt-1 opacity-60">
                  {new Date(msg.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              rows={2}
            />
            <Button onClick={sendMessage}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* RIGHT: Activity */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Activity</h3>

          <div>
            <p className="text-xs text-muted-foreground">Requester</p>
            <p>{ticket.requester_name}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Assignee</p>
            <p>{ticket.assignee ?? "Not assigned"}</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
