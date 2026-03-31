"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Send, Paperclip, ChevronDown, ChevronUp, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActivityItem } from "./TicketActivityTrail"
import { sendNotification, sendEmailNotification } from "@/lib/notify"

/* -----------------------------------
   Types
----------------------------------- */
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
  ticketSubject?: string
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  currentUser: Profile
  otherUser: Profile
  onSend: (message: string) => Promise<void>
  activityItems?: ActivityItem[]
}

/* -----------------------------------
   Helpers
----------------------------------- */
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const ACTIVITY_PILL: Record<string, string> = {
  done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  hold: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  pending: "bg-muted text-muted-foreground",
}

/* -----------------------------------
   Component
----------------------------------- */
export default function TicketChat({
  ticketId,
  ticketSubject,
  messages,
  setMessages,
  currentUser,
  otherUser,
  onSend,
  activityItems = [],
}: Props) {
  const [text, setText] = React.useState("")
  const [onlineUsers, setOnlineUsers] = React.useState<string[]>([])
  const [showActivity, setShowActivity] = React.useState(false)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  /* ── Realtime: Messages ─────────── */
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

    return () => { supabase.removeChannel(channel) }
  }, [ticketId, setMessages])

  /* ── Presence ───────────────────── */
  React.useEffect(() => {
    const presenceChannel = supabase.channel(
      `presence-ticket-${ticketId}`,
      { config: { presence: { key: currentUser.id } } }
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

    return () => { supabase.removeChannel(presenceChannel) }
  }, [ticketId, currentUser])

  /* ── Auto-scroll ────────────────── */
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isOtherOnline = onlineUsers.includes(otherUser.id)

  const handleSend = async () => {
    if (!text.trim()) return
    const msg = text
    setText("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    await onSend(msg)

    /* Notify the other party only if they are NOT currently
       viewing this ticket (presence-based deduplication) */
    if (!isOtherOnline) {
      await sendNotification({
        user_id: otherUser.id,
        actor_id: currentUser.id,
        ticket_id: ticketId,
        type: "message",
        message: "sent you a message",
      })

      /* Also send email when user is offline */
      const { data: recipientData } = await supabase
        .from("users")
        .select("email, name")
        .eq("id", otherUser.id)
        .single()

      if (recipientData?.email) {
        sendEmailNotification({
          recipient_email: recipientData.email,
          recipient_name: recipientData.name ?? otherUser.name,
          actor_name: currentUser.name,
          ticket_id: ticketId,
          ticket_subject: ticketSubject ?? "Support Ticket",
          action: "message",
          comment: msg,
        })
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /* ── Group messages by date ─────── */
  const messagesByDate = React.useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = []
    for (const msg of messages) {
      const label = formatDateLabel(msg.created_at)
      const last = groups[groups.length - 1]
      if (!last || last.date !== label) {
        groups.push({ date: label, messages: [msg] })
      } else {
        last.messages.push(msg)
      }
    }
    return groups
  }, [messages])

  /* Filter activity items worth showing */
  const visibleActivity = activityItems.filter(
    (a) => a.status !== "pending"
  )

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ─────────────────────── */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <div className="relative flex-shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={otherUser.avatar_url ?? undefined} />
            <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold text-sm">
              {otherUser.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
              isOtherOnline ? "bg-green-500" : "bg-muted-foreground/40"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-none">{otherUser.name}</p>
          <p className={cn(
            "text-xs mt-0.5",
            isOtherOnline ? "text-green-500" : "text-muted-foreground"
          )}>
            {isOtherOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>

      {/* ── Activity Log (collapsible) ── */}
      {visibleActivity.length > 0 && (
        <div className="mt-3 mb-1">
          <button
            onClick={() => setShowActivity(!showActivity)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors border border-border/40"
          >
            <span className="text-xs font-semibold text-muted-foreground">
              Activity Log · {visibleActivity.length} events
            </span>
            {showActivity
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>

          {showActivity && (
            <div className="mt-1.5 rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/30 overflow-hidden">
              {visibleActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide flex-shrink-0",
                      ACTIVITY_PILL[item.status] ?? ACTIVITY_PILL.pending
                    )}
                  >
                    {item.status === "processing" ? "active" : item.status}
                  </span>
                  <span className="text-xs font-medium text-foreground/90 truncate">
                    {item.label}
                  </span>
                  {item.date && (
                    <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">
                      {item.date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Messages ───────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 mt-3 pr-1 space-y-1">

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-10">
            <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
              <CheckCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No messages yet.
              <br />
              <span className="text-xs">Start the conversation below.</span>
            </p>
          </div>
        )}

        {messagesByDate.map(({ date, messages: dayMessages }) => (
          <div key={date}>

            {/* Date divider */}
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 flex-shrink-0">
                {date}
              </span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {dayMessages.map((msg, idx) => {
              const isMine = msg.sender_id === currentUser.id
              const profile = isMine ? currentUser : otherUser
              const prevMsg = dayMessages[idx - 1]
              const nextMsg = dayMessages[idx + 1]
              const isFirstInGroup =
                !prevMsg || prevMsg.sender_id !== msg.sender_id
              const isLastInGroup =
                !nextMsg || nextMsg.sender_id !== msg.sender_id

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex items-end gap-2",
                    isMine ? "flex-row-reverse" : "flex-row",
                    isFirstInGroup ? "mt-4" : "mt-0.5"
                  )}
                >
                  {/* Avatar — only shown on last bubble in group */}
                  <div className="h-7 w-7 flex-shrink-0">
                    {isLastInGroup ? (
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={profile.avatar_url ?? undefined} />
                        <AvatarFallback
                          className={cn(
                            "text-xs font-bold",
                            isMine
                              ? "bg-blue-600 text-white"
                              : "bg-muted-foreground/20 text-foreground"
                          )}
                        >
                          {profile.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : null}
                  </div>

                  {/* Bubble + metadata */}
                  <div
                    className={cn(
                      "flex flex-col max-w-[72%]",
                      isMine ? "items-end" : "items-start"
                    )}
                  >
                    {isFirstInGroup && (
                      <span className="text-[11px] font-semibold text-muted-foreground mb-1 px-1">
                        {profile.name}
                      </span>
                    )}

                    <div
                      className={cn(
                        "px-3.5 py-2 text-sm leading-relaxed shadow-sm break-words",
                        isMine
                          ? [
                              "bg-blue-600 text-white",
                              isFirstInGroup && isLastInGroup
                                ? "rounded-2xl"
                                : isFirstInGroup
                                ? "rounded-2xl rounded-br-sm"
                                : isLastInGroup
                                ? "rounded-2xl rounded-tr-sm"
                                : "rounded-xl rounded-r-sm",
                            ]
                          : [
                              "bg-muted text-foreground",
                              isFirstInGroup && isLastInGroup
                                ? "rounded-2xl"
                                : isFirstInGroup
                                ? "rounded-2xl rounded-bl-sm"
                                : isLastInGroup
                                ? "rounded-2xl rounded-tl-sm"
                                : "rounded-xl rounded-l-sm",
                            ]
                      )}
                    >
                      {msg.message}
                    </div>

                    {isLastInGroup && (
                      <span className="text-[10px] text-muted-foreground mt-1 px-1">
                        {formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ──────────────────────── */}
      <div className="mt-3 pt-3 border-t border-border/60">
        <div className="flex items-end gap-2 bg-muted/40 rounded-2xl px-3.5 py-2.5 border border-border/50 focus-within:border-blue-400 transition-colors">
          <button
            className="flex-shrink-0 mb-0.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Attach file (coming soon)"
            onClick={() => {}}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Type a message…"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height =
                Math.min(e.target.scrollHeight, 120) + "px"
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent resize-none text-sm outline-none placeholder:text-muted-foreground overflow-y-auto leading-relaxed py-0.5 max-h-[120px]"
          />

          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex-shrink-0 h-8 w-8 rounded-xl mb-0.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground mt-1.5 px-1 select-none">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
