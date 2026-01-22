"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import EngineerTicketTable from "@/components/tickets/EngineerTicketTable"
import UserLatestTickets from "@/components/tickets/UserLatestTickets"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type Role = "user" | "engineer" | "admin"

export default function RoleBasedTickets() {
  const [role, setRole] = React.useState<Role | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const loadRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setLoading(false)
          return
        }

        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single()

        setRole(data?.role ?? "user")
      } finally {
        // 🔑 ALWAYS stop loader
        setLoading(false)
      }
    }

    loadRole()
  }, [])

  if (loading) {
    return (
      <Card className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </Card>
    )
  }

  if (role === "engineer") return <EngineerTicketTable />
  if (role === "user") return <UserLatestTickets />

  // admin → blank for now
  return null
}
