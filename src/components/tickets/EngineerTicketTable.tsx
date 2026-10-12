"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import { getUserAccessibleDomains, getOrgUserIdsByDomains } from "@/lib/org"
import { DataTable } from "@/components/ui/data-table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/common/status-badge"
import TicketFilters from "@/components/tickets/TicketFilters"
import { Eye, Inbox, ListTodo, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { timeAgo, STATUS_TONE, statusLabel } from "@/lib/ticket-utils"
import { getInitials } from "@/hooks/useCurrentUser"
import { sendNotification, sendEmailNotification } from "@/lib/notify"
import { logActivity } from "@/lib/activity"

const PAGE_SIZE = 50

type Ticket = {
  id: string
  subject: string
  location: string | null
  requester_id: string
  requester_name: string
  created_at: string
  status: string
  category: string | null
  sub_category: string | null
  assignee: string | null
}

export default function EngineerTicketTable() {
  const router = useRouter()

  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [tab, setTab] = React.useState<"queue" | "mytask">("queue")

  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [category, setCategory] = React.useState("all")

  const [page, setPage] = React.useState(1)
  const [hasNext, setHasNext] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  const loadTickets = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from("tickets")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)

    if (tab === "queue") {
      // Queue: unassigned tickets scoped to this engineer's org(s)
      const { data: roleData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()
      const userRole = roleData?.role ?? "engineer"
      const domains = await getUserAccessibleDomains(supabase, user.id, user.email ?? "", userRole)
      const orgUserIds = await getOrgUserIdsByDomains(supabase, domains)

      if (orgUserIds.length === 0) {
        setTickets([])
        setHasNext(false)
        return
      }

      query = query.is("assignee", null).in("requester_id", orgUserIds)
    } else {
      // My tasks: tickets assigned to this specific engineer
      query = query.eq("assignee", user.id)
    }

    if (status !== "all") query = query.eq("status", status)
    if (category !== "all") query = query.eq("category", category)
    if (search) query = query.ilike("subject", `%${search}%`)

    const { data, count, error } = await query

    if (error) {
      toast.error("Failed to load tickets")
      return
    }

    setTickets(data ?? [])
    setHasNext((count ?? 0) > page * PAGE_SIZE)
  }

  React.useEffect(() => {
    let active = true
    setLoading(true)
    loadTickets().finally(() => {
      if (active) setLoading(false)
    })

    const channel = supabase
      .channel("engineer-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        loadTickets
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [tab, search, status, category, page])

  const acquireTicket = async (ticketId: string, requesterId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const now = new Date()
    const slaResolutionAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from("tickets")
      .update({
        assignee: user.id,
        status: "open",
        assigned_at: now.toISOString(),
        sla_resolution_at: slaResolutionAt,
      })
      .eq("id", ticketId)
      .is("assignee", null)

    if (error) {
      toast.error("Ticket already acquired")
    } else {
      toast.success("Ticket acquired")

      /* Notify the user who raised the ticket */
      await sendNotification({
        user_id: requesterId,
        actor_id: user.id,
        ticket_id: ticketId,
        type: "acquired",
        message: `acquired your ticket #${ticketId.slice(0, 8).toUpperCase()}`,
      })

      /* Send email notification */
      const [requesterRes, engineerRes, ticketRes] = await Promise.all([
        supabase.from("users").select("email, name").eq("id", requesterId).single(),
        supabase.from("users").select("name").eq("id", user.id).single(),
        supabase.from("tickets").select("subject").eq("id", ticketId).single(),
      ])

      if (requesterRes.data?.email) {
        sendEmailNotification({
          recipient_email: requesterRes.data.email,
          recipient_name: requesterRes.data.name ?? "User",
          actor_name: engineerRes.data?.name ?? "Support Engineer",
          ticket_id: ticketId,
          ticket_subject: ticketRes.data?.subject ?? "Support Ticket",
          action: "acquired",
        })
      }

      /* Log activity + assignment record */
      logActivity({
        ticket_id: ticketId,
        actor_id: user.id,
        action: "acquired",
        details: { engineer_name: engineerRes.data?.name ?? "Engineer" },
      })

      // Insert assignment record (non-blocking)
      supabase.from("ticket_assignments").insert({
        ticket_id: ticketId,
        engineer_id: user.id,
        action: "acquired",
      }).then(() => {})

      loadTickets()
    }
  }

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: "id",
      header: "Ticket ID",
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
      cell: ({ row }) => (
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
      header: tab === "queue" ? "Assign" : "Actions",
      enableSorting: false,
      cell: ({ row }) => {
        const t = row.original
        return tab === "queue" ? (
          <Button size="sm" onClick={() => acquireTicket(t.id, t.requester_id)}>
            <UserCheck />
            Acquire
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="View ticket"
                className="text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                onClick={() => router.push(`/ticket/${t.id}`)}
              >
                <Eye />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View ticket</TooltipContent>
          </Tooltip>
        )
      },
      meta: { className: "text-right", headerClassName: "text-right" },
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={tickets}
      loading={loading}
      getRowId={(t) => t.id}
      title="Engineer Tickets"
      description={
        tab === "queue"
          ? "Unassigned tickets from your organisation, newest first."
          : "Tickets currently assigned to you."
      }
      searchable
      searchPlaceholder="Search by subject…"
      search={search}
      onSearchChange={setSearch}
      filters={
        <TicketFilters
          status={status}
          setStatus={setStatus}
          category={category}
          setCategory={setCategory}
        />
      }
      subHeader={
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "queue" | "mytask")
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value="queue">
              <Inbox />
              Queue
            </TabsTrigger>
            <TabsTrigger value="mytask">
              <ListTodo />
              My Tasks
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      pagination={{
        pageIndex: page - 1,
        pageSize: PAGE_SIZE,
        hasNextPage: hasNext,
        onPageChange: (i) => setPage(i + 1),
      }}
      entityName="tickets"
      emptyIcon={tab === "queue" ? Inbox : ListTodo}
      emptyTitle={tab === "queue" ? "Queue is clear" : "No tasks assigned"}
      emptyDescription={
        tab === "queue"
          ? "There are no unassigned tickets matching your filters."
          : "Tickets you acquire will show up here."
      }
      onRowClick={tab === "mytask" ? (t) => router.push(`/ticket/${t.id}`) : undefined}
    />
  )
}
