"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
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
import { ticketRef } from "@/lib/itsm"
import { PriorityBadge, TicketTypeBadge, TICKET_REF_CLASS } from "@/components/tickets/TicketBadges"

const DEFAULT_PAGE_SIZE = 50

type Tab = "queue" | "mytask" | "raised" | "all"

type Ticket = {
  id: string
  number: string | null
  ticket_type: string | null
  priority: string | null
  subject: string
  location: string | null
  requester_id: string
  requester_name: string
  created_at: string
  status: string
  category: string | null
  sub_category: string | null
  assignee: string | null
  tenant_id: string | null
}

const TAB_COPY: Record<Tab, { description: string; emptyTitle: string; emptyDescription: string }> = {
  queue: {
    description: "Unassigned tickets, newest first.",
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
      "Every ticket you can see. Tickets assigned to someone else are view only until they are transferred to you.",
    emptyTitle: "No tickets found",
    emptyDescription: "There are no tickets matching your filters.",
  },
}

export default function EngineerTicketTable() {
  const router = useRouter()

  const [tickets, setTickets] = React.useState<Ticket[]>([])
  const [tab, setTab] = React.useState<Tab>("queue")
  const [me, setMe] = React.useState<string | null>(null)
  // Super admins see every tenant's tickets, so each row shows its tenant
  const [isSuperadmin, setIsSuperadmin] = React.useState(false)
  const [tenantNames, setTenantNames] = React.useState<Record<string, string>>({})
  const [assigneeNames, setAssigneeNames] = React.useState<Record<string, string>>({})
  const [acquiring, setAcquiring] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [category, setCategory] = React.useState("all")
  const [ticketType, setTicketType] = React.useState("all")

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
      if (ticketType !== "all") q = q.eq("ticket_type", ticketType)
      // Characters that would break the or() filter syntax are dropped
      const term = search.replace(/[,()"\\*%]/g, " ").trim()
      if (term) q = q.or(`subject.ilike.%${term}%,number.ilike.%${term}%`)
      return q
    }

    // The database (RLS) limits rows to this person's tenant (every tenant
    // for a super admin), so no organisation filter is needed here.
    let q =
      tab === "queue"
        ? base().is("assignee", null) // Queue: unassigned tickets
        : tab === "mytask"
          ? base().eq("assignee", user.id) // My tasks: tickets assigned to this engineer
          : tab === "raised"
            ? base().eq("requester_id", user.id) // Raised by me: tickets this person raised
            : base() // All tickets
    // "All" skips the range; Supabase's own max-rows setting still caps the response
    if (!showAll) q = q.range(offset, offset + pageSize - 1)
    const { data, count: c, error } = await q
    const failed = !!error
    const rows = (data ?? []) as Ticket[]
    const count = c ?? 0

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

  /* Super admins: tenant names for the Tenant column (looked up once) */
  React.useEffect(() => {
    let active = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
      if (!active || profile?.role !== "superadmin") return
      setIsSuperadmin(true)
      const { data: tenants } = await supabase.from("tenants").select("id, name")
      if (!active) return
      setTenantNames(
        Object.fromEntries((tenants ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))
      )
    })()
    return () => {
      active = false
    }
  }, [])

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
  }, [tab, search, status, category, ticketType, page, pageSize])

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
      accessorKey: "number",
      header: "Number",
      cell: ({ row }) => <span className={TICKET_REF_CLASS}>{ticketRef(row.original)}</span>,
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "ticket_type",
      header: "Type",
      cell: ({ row }) => <TicketTypeBadge type={row.original.ticket_type} />,
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
    ...(isSuperadmin
      ? ([
          {
            accessorKey: "tenant_id",
            header: "Tenant",
            cell: ({ row }) => {
              const tid = row.original.tenant_id
              return (
                <span className="whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {(tid && tenantNames[tid]) ?? "-"}
                </span>
              )
            },
          },
        ] as ColumnDef<Ticket>[])
      : []),
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
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      meta: { className: "whitespace-nowrap" },
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
      searchPlaceholder="Search by subject or number…"
      search={search}
      onSearchChange={setSearch}
      filters={
        <TicketFilters
          status={status}
          setStatus={setStatus}
          category={category}
          setCategory={(v) => {
            setCategory(v)
            setPage(1)
          }}
          ticketType={ticketType}
          setTicketType={(v) => {
            setTicketType(v)
            setPage(1)
          }}
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
