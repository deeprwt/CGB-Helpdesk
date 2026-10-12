"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import EngineerTicketTable from "@/components/tickets/EngineerTicketTable"
import UserLatestTickets from "@/components/tickets/UserLatestTickets"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type Role = "user" | "engineer" | "admin" | "superadmin"

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
      <Card className="gap-0 overflow-hidden py-0">
        {/* Toolbar: title + filters + search */}
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between dark:border-white/10">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-[150px]" />
            <Skeleton className="h-9 w-[150px]" />
            <Skeleton className="h-9 w-full sm:w-64" />
          </div>
        </div>

        {/* Sub-header: tabs */}
        <div className="border-b border-gray-200 px-5 py-3 dark:border-white/10">
          <Skeleton className="h-10 w-48 rounded-xl" />
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-6 bg-gray-50 px-4 py-3.5 dark:bg-white/[0.03]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3.5">
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-4 flex-1" />
              <div className="hidden flex-1 items-center gap-2 md:flex">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>

        {/* Footer: counts + pagination */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 dark:border-white/10">
          <Skeleton className="h-4 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-[72px]" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </Card>
    )
  }

  if (role === "user") return <UserLatestTickets />

  // engineer, admin, superadmin → show all org tickets
  if (role === "engineer" || role === "admin" || role === "superadmin") {
    return <EngineerTicketTable />
  }

  return null
}
