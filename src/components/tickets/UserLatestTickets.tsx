"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Eye } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { STATUS_STYLE } from "@/lib/ticket-utils"


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

/* -----------------------------------
   Status → Badge Variant
----------------------------------- */


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

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Latest Tickets</h3>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets found.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Sub-Category</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium">
                    {ticket.id.slice(0, 8).toUpperCase()}
                  </TableCell>

                  <TableCell>{ticket.subject}</TableCell>
                  <TableCell>{ticket.location ?? "-"}</TableCell>
                  <TableCell>{ticket.requester_name ?? "-"}</TableCell>

                  <TableCell className="text-muted-foreground">
                    {timeAgo(ticket.created_at)}
                  </TableCell>

                  <TableCell>
                    <Badge className={STATUS_STYLE[ticket.status]}>
                      {ticket.status.replace("_", " ").toUpperCase()}
                    </Badge>

                  </TableCell>

                  <TableCell>{ticket.category ?? "-"}</TableCell>
                  <TableCell>{ticket.sub_category ?? "-"}</TableCell>

                  <TableCell className="text-right">
                    <button
                      onClick={() => router.push(`/ticket/${ticket.id}`)}
                      className="inline-flex items-center justify-center rounded-md p-2 hover:bg-muted"
                      title="View Ticket"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
