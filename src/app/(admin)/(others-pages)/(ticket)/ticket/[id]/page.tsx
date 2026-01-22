"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft } from "lucide-react"

import TicketMetaPanel from "@/components/tickets/ticket-details/TicketMetaPanel"
import TicketChat from "@/components/tickets/ticket-details/TicketChat"

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

type ChatProfile = {
  id: string
  name: string
  avatar_url: string | null
  role: "user" | "engineer"
}

export default function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [userId, setUserId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

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

      setUserId(user.id)

      const [
        { data: ticketData },
        { data: chatData },
        { data: attachmentData },
        { data: profileData },
      ] = await Promise.all([
        supabase.from("tickets").select("*").eq("id", id).single(),
        supabase
          .from("ticket_messages")
          .select("*")
          .eq("ticket_id", id)
          .order("created_at"),
        supabase
          .from("ticket_attachments")
          .select("id, file_name, file_path")
          .eq("ticket_id", id),
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

  if (loading || !ticket || !userId) {
    return (
      <div className="p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  /* -----------------------------------
     Chat Profiles (FIXED TYPES)
  ----------------------------------- */
  const currentUserProfile: ChatProfile = {
    id: userId,
    name: ticket.requester_name,
    avatar_url: profile?.avatar_url ?? null,
    role: "user",
  }

  const engineerProfile: ChatProfile = {
    id: ticket.assignee ?? "engineer",
    name: "Support Engineer",
    avatar_url: null,
    role: "engineer",
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
        {/* LEFT */}
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

        {/* CENTER */}
        <Card className="p-5 flex flex-col">
          <h3 className="font-semibold mb-3">Conversation</h3>

          <TicketChat
  ticketId={id}
  messages={messages}
  setMessages={setMessages}
  currentUser={currentUserProfile}
  otherUser={engineerProfile}
  onSend={async (text) => {
    await supabase.from("ticket_messages").insert({
      ticket_id: id,
      sender_id: userId,
      sender_role: "user",
      message: text,
    })
  }}
/>

        </Card>

        {/* RIGHT */}
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
