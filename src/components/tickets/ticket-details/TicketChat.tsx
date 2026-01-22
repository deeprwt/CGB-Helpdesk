"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"

type Profile = {
  id: string
  name: string
  avatar_url: string | null
  role: "user" | "engineer"
}

type Message = {
  id: string
  message: string
  sender_id: string
  sender_role: "user" | "engineer"
  created_at: string
}

type Props = {
  ticketId: string
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  currentUser: Profile
  otherUser: Profile
  onSend: (message: string) => Promise<void>
}

export default function TicketChat({
  ticketId,
  messages,
  setMessages,
  currentUser,
  otherUser,
  onSend,
}: Props) {
  const [text, setText] = React.useState("")
  const [onlineUsers, setOnlineUsers] = React.useState<string[]>([])
  const bottomRef = React.useRef<HTMLDivElement>(null)

  /* -----------------------------------
     Realtime: Messages
  ----------------------------------- */
  React.useEffect(() => {
    const channel = supabase
      .channel(`ticket-chat-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [ticketId, setMessages])

  /* -----------------------------------
     Presence (Online / Offline)
  ----------------------------------- */
  React.useEffect(() => {
    const presenceChannel = supabase.channel(
      `presence-ticket-${ticketId}`,
      {
        config: {
          presence: {
            key: currentUser.id,
          },
        },
      }
    )

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState()
        setOnlineUsers(Object.keys(state))
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: currentUser.id,
            role: currentUser.role,
          })
        }
      })

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [ticketId, currentUser])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isOtherOnline = onlineUsers.includes(otherUser.id)

  const handleSend = async () => {
    if (!text.trim()) return
    await onSend(text)
    setText("")
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="h-7 w-7">
          <AvatarImage src={otherUser.avatar_url ?? undefined} />
          <AvatarFallback>{otherUser.name[0]}</AvatarFallback>
        </Avatar>

        <span className="text-sm font-medium">{otherUser.name}</span>

        <span
          className={`h-2 w-2 rounded-full ${
            isOtherOnline ? "bg-green-500" : "bg-red-500"
          }`}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUser.id
          const profile = isMine ? currentUser : otherUser

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[75%] space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {!isMine && (
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={profile.avatar_url ?? undefined} />
                      <AvatarFallback>{profile.name[0]}</AvatarFallback>
                    </Avatar>
                  )}
                  {profile.name}
                </div>

                <div
                  className={`rounded-2xl px-4 py-2 text-sm ${
                    isMine
                      ? "bg-blue-600 text-white ml-auto"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <Textarea
          rows={2}
          placeholder="Type your message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button onClick={handleSend}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
