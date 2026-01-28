"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

type Role = "user" | "engineer" | "admin"

type OverviewStat = {
  label: string
  value: number
}

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
         USER STATS
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
         ENGINEER STATS
      ---------------------------- */
      if (role === "engineer") {
        const [
          total,
          queueNew,
          openAssigned,
          hold,
          closedAssigned,
        ] = await Promise.all([
          // Total tickets visible to engineer
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true }),

          // New tickets in queue (unassigned)
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .is("assignee", null)
            .eq("status", "new"),

          // Open tickets assigned to engineer
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("assignee", user.id)
            .eq("status", "open"),

          // Hold tickets assigned to engineer
          supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("assignee", user.id)
            .eq("status", "hold"),

          // Closed tickets handled by engineer
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


      // admin → intentionally empty for now
      setLoading(false)
    }

    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-5 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    )
  }

  if (stats.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </span>
          </div>

          <CardContent className="p-0 mt-2">
            <h3 className="text-3xl font-bold">{stat.value}</h3>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
