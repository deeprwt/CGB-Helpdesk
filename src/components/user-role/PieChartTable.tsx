"use client"

import * as React from "react"
import { Pie, PieChart } from "recharts"
import { supabase } from "@/lib/supabaseClient"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Skeleton } from "@/components/ui/skeleton"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* ---------------- TYPES ---------------- */

type Range = "weekly" | "monthly" | "yearly"
type UserRole = "user" | "engineer" | "admin"

type ChartRow = {
  key: string
  label: string
  value: number
  fill: string
}

/* ---------------- COLORS ---------------- */

const COLORS = {
  total: "var(--chart-1)",
  new: "var(--chart-2)",
  open: "var(--chart-3)",
  hold: "var(--chart-4)",
  closed: "var(--chart-5)",
}

/* ---------------- CHART CONFIG ---------------- */

const chartConfig = {
  value: { label: "Tickets" },
  total: { label: "Total Tickets", color: COLORS.total },
  new: { label: "New Tickets", color: COLORS.new },
  open: { label: "Open Tickets", color: COLORS.open },
  hold: { label: "Hold Tickets", color: COLORS.hold },
  closed: { label: "Closed Tickets", color: COLORS.closed },
} satisfies ChartConfig

/* ---------------- DATE RANGE ---------------- */

function getFromDate(range: Range) {
  const d = new Date()
  if (range === "weekly") d.setDate(d.getDate() - 7)
  if (range === "monthly") d.setMonth(d.getMonth() - 1)
  if (range === "yearly") d.setFullYear(d.getFullYear() - 1)
  return d.toISOString()
}

/* ---------------- COMPONENT ---------------- */

export function PieChartTable() {
  const [range, setRange] = React.useState<Range>("weekly")
  const [data, setData] = React.useState<ChartRow[]>([])
  const [role, setRole] = React.useState<UserRole | null>(null)
  const [ready, setReady] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const load = async () => {
      /* ---------- AUTH ---------- */
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setReady(true)
        return
      }

      /* ---------- ROLE (SAME AS TEAMMATES) ---------- */
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()

      if (!profile) {
        setReady(true)
        return
      }

      setRole(profile.role)

      /* 🚫 HARD STOP FOR NORMAL USERS */
      if (profile.role === "user") {
        setReady(true)
        return
      }

      setLoading(true)

      const fromDate = getFromDate(range)

      const [
        total,
        newQueue,
        openAssigned,
        holdAssigned,
        closedAssigned,
      ] = await Promise.all([
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .gte("created_at", fromDate),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .is("assignee", null)
          .eq("status", "new")
          .gte("created_at", fromDate),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("assignee", user.id)
          .eq("status", "open")
          .gte("created_at", fromDate),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("assignee", user.id)
          .eq("status", "hold")
          .gte("created_at", fromDate),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("assignee", user.id)
          .eq("status", "closed")
          .gte("created_at", fromDate),
      ])

      setData([
        { key: "total", label: "Total Tickets", value: total.count ?? 0, fill: COLORS.total },
        { key: "new", label: "New Tickets (Queue)", value: newQueue.count ?? 0, fill: COLORS.new },
        { key: "open", label: "Open Tickets", value: openAssigned.count ?? 0, fill: COLORS.open },
        { key: "hold", label: "Hold Tickets", value: holdAssigned.count ?? 0, fill: COLORS.hold },
        { key: "closed", label: "Closed Tickets", value: closedAssigned.count ?? 0, fill: COLORS.closed },
      ])

      setLoading(false)
      setReady(true)
    }

    load()
  }, [range])

  /* 🚫 SAME GUARD AS TEAMMATES */
  if (!ready || role === "user") {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Ticket Overview</CardTitle>

        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
            <Skeleton className="w-[260px] h-[260px] rounded-full mx-auto" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              {data.map((item) => (
                <div key={item.key} className="flex items-center gap-3 text-sm">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="flex-1">{item.label}</span>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>

            <ChartContainer
              config={chartConfig}
              className="w-[260px] h-[260px] mx-auto"
            >
              <PieChart width={260} height={260}>
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                />
              </PieChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
