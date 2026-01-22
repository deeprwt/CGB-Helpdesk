"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import TicketFilters from "@/components/tickets/TicketFilters"
import { Eye } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { timeAgo, STATUS_STYLE } from "@/lib/ticket-utils"

const PAGE_SIZE = 50

type Ticket = {
  id: string
  subject: string
  location: string | null
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
      query = query.is("assignee", null)
    } else {
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
    loadTickets()

    const channel = supabase
      .channel("engineer-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        loadTickets
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tab, search, status, category, page])

  const acquireTicket = async (ticketId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { error } = await supabase
      .from("tickets")
      .update({
        assignee: user.id,
        status: "open",
        assigned_at: new Date().toISOString(),
      })
      .eq("id", ticketId)
      .is("assignee", null)

    if (error) {
      toast.error("Ticket already acquired")
    } else {
      toast.success("Ticket acquired")
      loadTickets()
    }
  }

  return (
    <Card className="p-6 space-y-6">
      {/* Header + Filters */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Engineer Tickets</h2>

        <TicketFilters
          search={search}
          setSearch={setSearch}
          status={status}
          setStatus={setStatus}
          category={category}
          setCategory={setCategory}
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "queue" | "mytask")
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="mytask">My Tasks</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket ID</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Sub-Category</TableHead>
            <TableHead className="text-right">
              {tab === "queue" ? "Assign" : "Actions"}
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.id.slice(0, 8).toUpperCase()}</TableCell>
              <TableCell>{t.subject}</TableCell>
              <TableCell>{t.location ?? "-"}</TableCell>
              <TableCell>{t.requester_name}</TableCell>
              <TableCell>{timeAgo(t.created_at)}</TableCell>

              <TableCell>
                <Badge className={STATUS_STYLE[t.status]}>
                  {t.status.replace("_", " ").toUpperCase()}
                </Badge>
              </TableCell>

              <TableCell>{t.category ?? "-"}</TableCell>
              <TableCell>{t.sub_category ?? "-"}</TableCell>

              <TableCell className="text-right">
                {tab === "queue" ? (
                  <Button size="sm" onClick={() => acquireTicket(t.id)}>
                    Acquire
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/ticket/${t.id}`)}
                  >
                    <Eye className="h-5 w-5" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>

        <Button
          variant="outline"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </Card>
  )
}
