"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye, Plus, Ticket as TicketIcon } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/common/status-badge"
import { supabase } from "@/lib/supabaseClient"
import { STATUS_TONE, statusLabel } from "@/lib/ticket-utils"
import { getInitials } from "@/hooks/useCurrentUser"


type Ticket = {
  id: string
  subject: string
  location: string | null
  requester_name: string | null
  created_at: string
  status: "new" | "open" | "in_progress" | "closed"
  category: string | null
  sub_category: string | null
}

/* -----------------------------------
   Time Ago Helper
----------------------------------- */
function timeAgo(date: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  )

  if (seconds < 60) return "Just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

export default function UserLatestTickets() {
  const router = useRouter()
  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const loadTickets = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          location,
          requester_name,
          created_at,
          status,
          category,
          sub_category
        `)
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)

      if (data) setTickets(data)
      setLoading(false)
    }

    loadTickets()
  }, [])

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10">
          {row.original.id.slice(0, 8).toUpperCase()}
        </span>
      ),
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <span
          title={row.original.subject}
          className="block max-w-[280px] truncate font-medium text-gray-900 dark:text-white"
        >
          {row.original.subject}
        </span>
      ),
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400">{row.original.location ?? "-"}</span>
      ),
    },
    {
      accessorKey: "requester_name",
      header: "Requester",
      cell: ({ row }) =>
        row.original.requester_name ? (
          <div className="flex items-center gap-2.5">
            <Avatar className="size-7">
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-[11px] font-semibold text-white">
                {getInitials(row.original.requester_name)}
              </AvatarFallback>
            </Avatar>
            <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">
              {row.original.requester_name}
            </span>
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">-</span>
        ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400">{timeAgo(row.original.created_at)}</span>
      ),
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge tone={STATUS_TONE[row.original.status] ?? "gray"} dot>
          {statusLabel(row.original.status)}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">{row.original.category ?? "-"}</span>
      ),
    },
    {
      accessorKey: "sub_category",
      header: "Sub-Category",
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-300">{row.original.sub_category ?? "-"}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View ticket"
              className="text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              onClick={() => router.push(`/ticket/${row.original.id}`)}
            >
              <Eye />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View ticket</TooltipContent>
        </Tooltip>
      ),
      meta: { className: "text-right", headerClassName: "text-right" },
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={tickets}
      loading={loading}
      getRowId={(t) => t.id}
      title="Latest Tickets"
      description="Your most recent support requests."
      searchable
      searchPlaceholder="Search tickets…"
      pageSize={10}
      entityName="tickets"
      emptyIcon={TicketIcon}
      emptyTitle="No tickets found."
      emptyDescription="Tickets you raise will appear here."
      emptyAction={
        <Button variant="gradient" size="sm" asChild>
          <Link href="/create-ticket">
            <Plus />
            New Ticket
          </Link>
        </Button>
      }
      onRowClick={(t) => router.push(`/ticket/${t.id}`)}
    />
  )
}
