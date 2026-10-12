"use client"

import * as React from "react"
import {
  CheckCircle2,
  FolderOpen,
  PauseCircle,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import {
  StatCard,
  StatCardSkeleton,
  type StatTone,
} from "@/components/common/stat-card"

type OverviewStat = {
  label: string
  value: number
}

type Props = {
  userId: string
}

/** Icon + tone per stat label (tones follow the ticket status palette) */
const STAT_META: Record<string, { icon: LucideIcon; tone: StatTone }> = {
  "Total Tickets": { icon: Ticket, tone: "indigo" },
  "New Tickets": { icon: Sparkles, tone: "sky" },
  "Open Tickets": { icon: FolderOpen, tone: "amber" },
  "Hold Tickets": { icon: PauseCircle, tone: "violet" },
  "Closed Tickets": { icon: CheckCircle2, tone: "emerald" },
}

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 lg:col-span-2"

export function UserTicketOverviewById({ userId }: Props) {
  const [stats, setStats] = React.useState<OverviewStat[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!userId) return

    const loadStats = async () => {
      setLoading(true)

      const [
        total,
        newTickets,
        openTickets,
        holdTickets,
        closedTickets,
      ] = await Promise.all([
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", userId),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", userId)
          .eq("status", "new"),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", userId)
          .eq("status", "open"),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", userId)
          .eq("status", "hold"),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("requester_id", userId)
          .eq("status", "closed"),
      ])

      setStats([
        { label: "Total Tickets", value: total.count ?? 0 },
        { label: "New Tickets", value: newTickets.count ?? 0 },
        { label: "Open Tickets", value: openTickets.count ?? 0 },
        { label: "Hold Tickets", value: holdTickets.count ?? 0 },
        { label: "Closed Tickets", value: closedTickets.count ?? 0 },
      ])

      setLoading(false)
    }

    loadStats()
  }, [userId])

  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className={GRID}>
      {stats.map((stat) => {
        const meta = STAT_META[stat.label]
        return (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={meta?.icon ?? Ticket}
            tone={meta?.tone ?? "gray"}
            accentBar
          />
        )
      })}
    </div>
  )
}
