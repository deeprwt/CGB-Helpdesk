"use client"

import * as React from "react"
import {
  CircleCheck,
  CirclePause,
  FolderOpen,
  Inbox,
  Ticket,
  type LucideIcon,
} from "lucide-react"
import { StatCard, StatCardSkeleton, type StatTone } from "@/components/common/stat-card"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"
import { getUserAccessibleDomains, getOrgUserIdsByDomains } from "@/lib/org"

type Role = "user" | "engineer" | "admin" | "superadmin"

type OverviewStat = {
  label: string
  value: number
}

/* Both role variants list stats in the same order: total, new, open, hold, closed */
const STAT_STYLES: { icon: LucideIcon; tone: StatTone }[] = [
  { icon: Ticket, tone: "indigo" },
  { icon: Inbox, tone: "sky" },
  { icon: FolderOpen, tone: "amber" },
  { icon: CirclePause, tone: "rose" },
  { icon: CircleCheck, tone: "emerald" },
]

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
/* On phones the first (total) tile spans the row so the rest sit in a neat 2×2 */
const FIRST_TILE = "col-span-2 md:col-span-1"

export default function TicketOverviewCards() {
  const [stats, setStats] = React.useState<OverviewStat[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const loadStats = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: roleData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()

      const role = (roleData?.role ?? "user") as Role

      /* ----------------------------
         USER STATS — scoped to this user's own tickets only
      ---------------------------- */
      if (role === "user") {
        const [total, newTickets, openTickets, holdTickets, closedTickets] =
          await Promise.all([
            supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("requester_id", user.id),

            supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("requester_id", user.id)
              .eq("status", "new"),

            supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("requester_id", user.id)
              .eq("status", "open"),

            supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("requester_id", user.id)
              .eq("status", "hold"),

            supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("requester_id", user.id)
              .eq("status", "closed"),
          ])

        setStats([
          { label: "Total Tickets", value: total.count ?? 0 },
          { label: "New Tickets", value: newTickets.count ?? 0 },
          { label: "Open Tickets", value: openTickets.count ?? 0 },
          { label: "Hold Tickets", value: holdTickets.count ?? 0 },
          { label: "Closed Tickets", value: closedTickets.count ?? 0 },
        ])
      }

      /* ----------------------------
         ENGINEER / ADMIN STATS — scoped to this org only
      ---------------------------- */
      if (role === "engineer" || role === "admin" || role === "superadmin") {
        const domains = await getUserAccessibleDomains(supabase, user.id, user.email ?? "", role)
        const orgUserIds = await getOrgUserIdsByDomains(supabase, domains)

        if (orgUserIds.length === 0) {
          setStats([
            { label: "Total Tickets", value: 0 },
            { label: "New in Queue", value: 0 },
            { label: "Open (Assigned)", value: 0 },
            { label: "Hold Tickets", value: 0 },
            { label: "Closed (Resolved)", value: 0 },
          ])
          setLoading(false)
          return
        }

        const [
          total,
          queueNew,
          openAssigned,
          hold,
          closedAssigned,
        ] = await Promise.all([
          // All tickets raised by anyone in this org
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .in("requester_id", orgUserIds),

          // New unassigned tickets from this org
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .in("requester_id", orgUserIds)
            .is("assignee", null)
            .eq("status", "new"),

          // Open tickets assigned to this engineer
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("assignee", user.id)
            .eq("status", "open"),

          // Hold tickets assigned to this engineer
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("assignee", user.id)
            .eq("status", "hold"),

          // Closed tickets resolved by this engineer
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("assignee", user.id)
            .eq("status", "closed"),
        ])

        setStats([
          { label: "Total Tickets", value: total.count ?? 0 },
          { label: "New in Queue", value: queueNew.count ?? 0 },
          { label: "Open (Assigned)", value: openAssigned.count ?? 0 },
          { label: "Hold Tickets", value: hold.count ?? 0 },
          { label: "Closed (Resolved)", value: closedAssigned.count ?? 0 },
        ])
      }

      setLoading(false)
    }

    loadStats()
  }, [])

  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} className={cn(i === 0 && FIRST_TILE)} />
        ))}
      </div>
    )
  }

  if (stats.length === 0) return null

  return (
    <div className={GRID}>
      {stats.map((stat, i) => {
        const style = STAT_STYLES[i % STAT_STYLES.length]
        return (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={style.icon}
            tone={style.tone}
            className={cn(i === 0 && FIRST_TILE)}
          />
        )
      })}
    </div>
  )
}
