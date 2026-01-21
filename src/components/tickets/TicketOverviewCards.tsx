"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

type OverviewStat = {
  label: string
  value: number
}

export default function TicketOverviewCards() {
  const [stats, setStats] = useState<OverviewStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const [total, newTickets, openTickets, closedTickets] =
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
            .eq("status", "closed"),
        ])

      setStats([
        { label: "Total Tickets", value: total.count ?? 0 },
        { label: "New Tickets", value: newTickets.count ?? 0 },
        { label: "Open Tickets", value: openTickets.count ?? 0 },
        { label: "Closed Tickets", value: closedTickets.count ?? 0 },
      ])

      setLoading(false)
    }

    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-5 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{stat.label}</p>
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
