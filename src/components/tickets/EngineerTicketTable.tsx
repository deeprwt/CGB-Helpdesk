"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import { chunkList, getStaffWorkDomains, getOrgUserIdsByDomains } from "@/lib/org"
import { DataTable, DATA_TABLE_ALL_ROWS } from "@/components/ui/data-table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/common/status-badge"
import TicketFilters from "@/components/tickets/TicketFilters"
import { Eye, Inbox, Layers, ListTodo, Loader2, Send, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { timeAgo, STATUS_TONE, statusLabel } from "@/lib/ticket-utils"
import { getInitials } from "@/hooks/useCurrentUser"

const DEFAULT_PAGE_SIZE = 50
/** Requester IDs per request; keeps the URL PostgREST reads short */
const ID_CHUNK = 150
/** PostgREST hands back at most this many rows per request */
const MAX_ROWS = 1000

type Tab = "queue" | "mytask" | "raised" | "all"

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

const TAB_COPY: Record<Tab, { description: string; emptyTitle: string; emptyDescription: string }> = {
  queue: {
    description: "Unassigned tickets from your organisation, newest first.",
    emptyTitle: "Queue is clear",
    emptyDescription: "There are no unassigned tickets matching your filters.",
  },
  mytask: {
    description: "Tickets currently assigned to you.",
    emptyTitle: "No tasks assigned",
    emptyDescription: "Tickets you acquire, or that are transferred to you, will show up here.",
  },
  raised: {
    description: "Tickets you raised for yourself, and who is working on them.",
    emptyTitle: "You haven't raised any tickets",
    emptyDescription: "Tickets you raise for yourself will show up here.",
  },
  all: {
    description:
      "Every ticket in your organisation. Tickets assigned to someone else are view only until they are transferred to you.",
    emptyTitle: "No tickets found",
    emptyDescription: "There are no tickets matching your filters.",
  },
}

export default function EngineerTicketTable() {
  const router = useRouter()

  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [tab, setTab] = React.useState<Tab>("queue")
  const [me, setMe] = React.useState<string | null>(null)
  const [assigneeNames, setAssigneeNames] = React.useState<Record<string, string>>({})
  const [acquiring, setAcquiring] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [category, setCategory] = React.useState("all")

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
  const [hasNext, setHasNext] = React.useState(false)
  const [total, setTotal] = React.useState<number | undefined>(undefined)
  const [loading, setLoading] = React.useState(true)

  // Reload for the current tab/filters (set by the effect below, so a reload
  // never runs with an older tab's settings)
  const reloadRef = React.useRef<() => void>(() => {})

  /** `isActive` turns false once the tab/filters change, so a slow response for
   *  an old tab can never overwrite the rows of the tab now showing. */
  const loadTickets = async (isActive: () => boolean) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !isActive()) return
    setMe(user.id)

    const offset = (page - 1) * pageSize
    const showAll = pageSize === DATA_TABLE_ALL_ROWS

    const base = () => {
      let q = supabase
        .from("tickets")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
      if (status !== "all") q = q.eq("status", status)
      if (category !== "all") q = q.eq("category", category)
      if (search) q = q.ilike("subject", `%${search}%`)
      return q
    }

    let rows: Ticket[] = []
    let count = 0
    let failed = false

    if (tab === "queue" || tab === "all") {
      // Queue / All: tickets raised by anyone in the organisation(s) this person looks after
      const { data: roleData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()
      const userRole = roleData?.role ?? "engineer"
      const scoped = (q: ReturnType<typeof base>) => (tab === "queue" ? q.is("assignee", null) : q)

      if (userRole === "superadmin") {
        // Super admins look after every organisation: no requester filter needed
        let q = scoped(base())
        // "All" skips the range; Supabase's own max-rows setting still caps the response
        if (!showAll) q = q.range(offset, offset + pageSize - 1)
        const { data, count: c, error } = await q
        failed = !!error
        rows = (data ?? []) as Ticket[]
        count = c ?? 0
      } else {
        const domains = await getStaffWorkDomains(supabase, user.id, user.email ?? "", userRole)
        const orgUserIds = await getOrgUserIdsByDomains(supabase, domains)
        if (!isActive()) return

        // The requester filter goes in the request URL, so it is sent in batches
        // of IDs. Each batch returns its newest offset+pageSize rows; merged and
        // sorted, that gives the exact page (as AskMiraa's ticket lists do).
        const want = showAll ? MAX_ROWS : Math.min(offset + pageSize, MAX_ROWS)
        const parts = await Promise.all(
          chunkList(orgUserIds, ID_CHUNK).map((batch) =>
            scoped(base().in("requester_id", batch)).limit(want)
          )
        )
        failed = parts.some((p) => !!p.error)
        count = parts.reduce((sum, p) => sum + (p.count ?? 0), 0)
        const merged = parts
          .flatMap((p) => (p.data ?? []) as Ticket[])
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
        rows = showAll ? merged : merged.slice(offset, offset + pageSize)
      }
    } else {
      let q =
        tab === "mytask"
          ? base().eq("assignee", user.id) // My tasks: tickets assigned to this engineer
          : base().eq("requester_id", user.id) // Raised by me: tickets this person raised
      if (!showAll) q = q.range(offset, offset + pageSize - 1)
      const { data, count: c, error } = await q
      failed = !!error
      rows = (data ?? []) as Ticket[]
      count = c ?? 0
    }

    if (!isActive()) return

    if (failed) {
      toast.error("Failed to load tickets")
      // Don't leave the previous tab's rows on screen under this tab's title
      setTickets([])
      setHasNext(false)
      setTotal(0)
      return
    }

    setTickets(rows)
    setHasNext(count > page * pageSize)
    setTotal(count)

    /* Names of the engineers working on these tickets */
    const assigneeIds = [...new Set(rows.map((t) => t.assignee).filter((a): a is string => !!a))]
    let nameMap: Record<string, string> = {}
    if (assigneeIds.length > 0) {
      const { data: people } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", assigneeIds)
      nameMap = Object.fromEntries(
        (people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? "Engineer"])
      )
    }
    if (isActive()) setAssigneeNames(nameMap)
  }

  React.useEffect(() => {
    let active = true
    const isActive = () => active
    reloadRef.current = () => {
      loadTickets(isActive)
    }

    setLoading(true)
    loadTickets(isActive).finally(() => {
      if (active) setLoading(false)
    })

    const channel = supabase
      .channel("engineer-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        () => {
          loadTickets(isActive)
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [tab, search, status, category, page, pageSize])

  /* Acquire runs on the server: it only succeeds while the ticket is still
     unassigned, and the requester is notified there (web + email). */
  const acquireTicket = async (ticketId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    setAcquiring(ticketId)
    try {
      const res = await fetch("/api/tickets/acquire", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      })

      if (res.ok) {
        toast.success("Ticket acquired")
      } else {
        const result = await res.json().catch(() => null)
        toast.error(result?.error ?? "Failed to acquire ticket")
      }
    } catch {
      toast.error("Failed to acquire ticket")
    } finally {
      setAcquiring(null)
      reloadRef.current()
    }
  }

  const showAssignee = tab === "all" || tab === "raised"

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
            <AvatarFallback className="bg-brand-500 text-[11px] font-semibold text-white">
              {getInitials(row.original.requester_name)}
            </AvatarFallback>
          </Avatar>
          <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">
            {row.original.requester_name}
          </span>
        </div>
      ),
    },
    ...(showAssignee
      ? ([
          {
            accessorKey: "assignee",
            header: "Assignee",
            cell: ({ row }) => {
              const a = row.original.assignee
              if (!a) return <span className="text-gray-400 dark:text-gray-500">Unassigned</span>
              return (
                <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">
                  {a === me ? "You" : assigneeNames[a] ?? "Engineer"}
                </span>
              )
            },
          },
        ] as ColumnDef<Ticket>[])
      : []),
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
        const viewOnly = !!t.assignee && t.assignee !== me && t.requester_id !== me
        const viewLabel = viewOnly
          ? `View only: assigned to ${assigneeNames[t.assignee!] ?? "another engineer"}`
          : "View ticket"

        return (
          <div className="flex items-center justify-end gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={viewLabel}
                  className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                  onClick={() => router.push(`/ticket/${t.id}`)}
                >
                  <Eye />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{viewLabel}</TooltipContent>
            </Tooltip>

            {!t.assignee && t.status !== "closed" && (tab === "queue" || tab === "all") && (
              <Button
                size="sm"
                disabled={acquiring === t.id}
                onClick={() => acquireTicket(t.id)}
              >
                {acquiring === t.id ? <Loader2 className="animate-spin" /> : <UserCheck />}
                Acquire
              </Button>
            )}
          </div>
        )
      },
      meta: { className: "text-right", headerClassName: "text-right" },
    },
  ]

  const copy = TAB_COPY[tab]

  return (
    <DataTable
      columns={columns}
      data={tickets}
      loading={loading}
      getRowId={(t) => t.id}
      title="Engineer Tickets"
      description={copy.description}
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
            setTab(v as Tab)
            setPage(1)
          }}
        >
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="queue">
              <Inbox />
              Queue
            </TabsTrigger>
            <TabsTrigger value="mytask">
              <ListTodo />
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="raised">
              <Send />
              Raised by Me
            </TabsTrigger>
            <TabsTrigger value="all">
              <Layers />
              All Tickets
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      pagination={{
        pageIndex: page - 1,
        pageSize,
        totalRows: total,
        hasNextPage: hasNext,
        onPageChange: (i) => setPage(i + 1),
        onPageSizeChange: (size) => {
          setPageSize(size)
          setPage(1)
        },
      }}
      entityName="tickets"
      emptyIcon={tab === "queue" ? Inbox : tab === "mytask" ? ListTodo : tab === "raised" ? Send : Layers}
      emptyTitle={copy.emptyTitle}
      emptyDescription={copy.emptyDescription}
      onRowClick={(t) => router.push(`/ticket/${t.id}`)}
    />
  )
}
