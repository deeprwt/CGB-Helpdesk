"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { History } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/status-badge"
import { STATUS_TONE, statusLabel, timeAgo } from "@/lib/ticket-utils"
import { TICKET_TYPE_LABELS, isTicketType, ticketRef } from "@/lib/itsm"

type Props = {
  requesterId: string
  requesterName: string
  currentTicketId: string
  currentUserId: string
}

type Row = {
  id: string
  number: string | null
  ticket_type: string | null
  subject: string
  status: string
  created_at: string
  assignee: string | null
}

const LIMIT = 10

/** Other tickets raised by the same person, with their status and who is on them. */
export default function RequesterTicketHistory({
  requesterId,
  requesterName,
  currentTicketId,
  currentUserId,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = React.useState<Row[]>([])
  const [names, setNames] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from("tickets")
        .select("id, number, ticket_type, subject, status, created_at, assignee")
        .eq("requester_id", requesterId)
        .neq("id", currentTicketId)
        .order("created_at", { ascending: false })
        .limit(LIMIT)

      const tickets = (data ?? []) as Row[]
      const ids = [...new Set(tickets.map((t) => t.assignee).filter((a): a is string => !!a))]
      let nameMap: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: people } = await supabase.from("users").select("id, full_name").in("id", ids)
        nameMap = Object.fromEntries(
          (people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? "Engineer"])
        )
      }

      if (cancelled) return
      setRows(tickets)
      setNames(nameMap)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [requesterId, currentTicketId])

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <History className="h-4 w-4 text-gray-400" />
          Past tickets
        </CardTitle>
        <CardDescription className="text-xs text-gray-500 dark:text-gray-400">
          Other tickets raised by {requesterName}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
            No other tickets from {requesterName}.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {rows.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/ticket/${t.id}`)}
                  className="flex w-full items-start gap-3 px-6 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {t.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {ticketRef(t)} · {TICKET_TYPE_LABELS[isTicketType(t.ticket_type) ? t.ticket_type : "incident"]} ·{" "}
                      {timeAgo(t.created_at)} ·{" "}
                      {t.assignee
                        ? t.assignee === currentUserId
                          ? "You"
                          : names[t.assignee] ?? "Engineer"
                        : "Unassigned"}
                    </p>
                  </div>
                  <StatusBadge tone={STATUS_TONE[t.status] ?? "gray"} dot className="shrink-0">
                    {statusLabel(t.status)}
                  </StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
