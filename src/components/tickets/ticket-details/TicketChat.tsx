"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import { EmptyState } from "@/components/common/empty-state"
import {
  Send,
  Paperclip,
  ChevronDown,
  History,
  MessageSquare,
  Users,
} from "lucide-react"
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

const ACTIVITY_TONE: Record<string, BadgeTone> = {
  done: "green",
  closed: "emerald",
  processing: "blue",
  hold: "orange",
  pending: "gray",
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
    <Card className="h-[640px] gap-0 overflow-hidden py-0 xl:h-[760px]">

      {/* ── Header ─────────────────────── */}
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={otherUser.avatar_url ?? undefined} />
              <AvatarFallback className="bg-gradient-to-br from-sky-500 to-brand-500 text-sm font-semibold text-white">
                {otherUser.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900",
                isOtherOnline ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
              )}
            />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-gray-900 dark:text-white">
              Conversation
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{otherUser.name}</span>
              <span aria-hidden>·</span>
              <span
                className={cn(
                  "font-medium",
                  isOtherOnline ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"
                )}
              >
                {isOtherOnline ? "Online" : "Offline"}
              </span>
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex items-center gap-2 self-center">
          <StatusBadge tone={onlineUsers.length > 1 ? "emerald" : "gray"} className="hidden sm:inline-flex">
            <Users className="h-3 w-3" />
            {onlineUsers.length} online
          </StatusBadge>
          <StatusBadge tone="indigo">
            <MessageSquare className="h-3 w-3" />
            {messages.length}
          </StatusBadge>
        </CardAction>
      </CardHeader>

      {/* ── Activity Log (collapsible) ── */}
      {visibleActivity.length > 0 && (
        <Collapsible
          open={showActivity}
          onOpenChange={setShowActivity}
          className="border-b border-gray-100 px-6 py-2 dark:border-white/10"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-2">
                <History className="h-3.5 w-3.5" />
                Activity Log · {visibleActivity.length} events
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  showActivity && "rotate-180"
                )}
              />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mt-1 mb-1 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/60 dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.03]">
              {visibleActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <StatusBadge
                    tone={ACTIVITY_TONE[item.status] ?? "gray"}
                    className="shrink-0 text-[10px] font-semibold uppercase tracking-wide"
                  >
                    {item.status === "processing" ? "active" : item.status}
                  </StatusBadge>
                  <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                    {item.label}
                  </span>
                  {item.date && (
                    <span className="ml-auto shrink-0 text-[10px] text-gray-400">
                      {item.date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Messages ───────────────────── */}
      <CardContent className="relative min-h-0 flex-1 px-0">
        <ScrollArea className="absolute inset-0">
          <div className="px-6 py-4">

            {messages.length === 0 && (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet."
                description="Start the conversation below."
                className="py-16"
              />
            )}

            {messagesByDate.map(({ date, messages: dayMessages }) => (
              <div key={date}>

                {/* Date divider */}
                <div className="my-4 flex items-center gap-3">
                  <Separator className="flex-1 bg-gray-100 dark:bg-white/10" />
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:bg-white/5 dark:text-gray-400">
                    {date}
                  </span>
                  <Separator className="flex-1 bg-gray-100 dark:bg-white/10" />
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
                        "flex items-end gap-2.5",
                        isMine ? "flex-row-reverse" : "flex-row",
                        isFirstInGroup ? "mt-4" : "mt-1"
                      )}
                    >
                      {/* Avatar — only shown on last bubble in group */}
                      <div className="h-8 w-8 shrink-0">
                        {isLastInGroup ? (
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={profile.avatar_url ?? undefined} />
                            <AvatarFallback
                              className={cn(
                                "bg-gradient-to-br text-xs font-semibold text-white",
                                isMine
                                  ? "from-brand-500 to-brand-600"
                                  : "from-sky-500 to-brand-500"
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
                          "flex max-w-[78%] flex-col sm:max-w-[70%]",
                          isMine ? "items-end" : "items-start"
                        )}
                      >
                        {isFirstInGroup && (
                          <span className="mb-1 px-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                            {profile.name}
                          </span>
                        )}

                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                            isMine
                              ? "rounded-2xl rounded-br-md bg-brand-500 text-white"
                              : "rounded-2xl rounded-bl-md bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-gray-100"
                          )}
                        >
                          {msg.message}
                        </div>

                        {isLastInGroup && (
                          <span className="mt-1 px-1 text-[10px] text-gray-400 dark:text-gray-500">
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
        </ScrollArea>
      </CardContent>

      {/* ── Input ──────────────────────── */}
      <CardFooter className="flex-col items-stretch gap-1.5 border-t border-gray-100 py-4 dark:border-white/10 [.border-t]:pt-4">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50/70 p-2 transition-colors focus-within:border-brand-300 focus-within:ring-[3px] focus-within:ring-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:focus-within:border-brand-500/40">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                aria-label="Attach file (coming soon)"
                onClick={() => {}}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file (coming soon)</TooltipContent>
          </Tooltip>

          <Textarea
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
            className="max-h-[120px] min-h-9 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
          />

          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!text.trim()}
            className="shrink-0 rounded-xl hover:translate-y-0"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <p className="px-1 text-[10px] text-gray-400 select-none dark:text-gray-500">
          Enter to send · Shift+Enter for new line
        </p>
      </CardFooter>
    </Card>
  )
}
