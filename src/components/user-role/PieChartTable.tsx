"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"
import { ChartPie } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { getUserAccessibleDomains, getOrgUserIdsByDomains } from "@/lib/org"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/common/empty-state"

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
type UserRole = "user" | "engineer" | "admin" | "superadmin"

type ChartRow = {
  key: string
  label: string
  value: number
  fill: string
}

/* ---------------- COLORS ---------------- */

/* Same tones as the dashboard stat cards (indigo / sky / amber / rose / emerald) */
const COLORS = {
  total: "#6366f1",
  new: "#0ea5e9",
  open: "#f59e0b",
  hold: "#f43f5e",
  closed: "#10b981",
}

const RANGE_DESCRIPTION: Record<Range, string> = {
  weekly: "Ticket breakdown for the last 7 days",
  monthly: "Ticket breakdown for the last month",
  yearly: "Ticket breakdown for the last 12 months",
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

      // Scope aggregate counts to user's accessible org(s)
      const domains = await getUserAccessibleDomains(supabase, user.id, user.email ?? "", profile.role)
      const orgUserIds = await getOrgUserIdsByDomains(supabase, domains)

      if (orgUserIds.length === 0) {
        setData([
          { key: "total", label: "Total Tickets", value: 0, fill: COLORS.total },
          { key: "new", label: "New Tickets (Queue)", value: 0, fill: COLORS.new },
          { key: "open", label: "Open Tickets", value: 0, fill: COLORS.open },
          { key: "hold", label: "Hold Tickets", value: 0, fill: COLORS.hold },
          { key: "closed", label: "Closed Tickets", value: 0, fill: COLORS.closed },
        ])
        setLoading(false)
        setReady(true)
        return
      }

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
          .in("requester_id", orgUserIds)
          .gte("created_at", fromDate),

        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .in("requester_id", orgUserIds)
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

  const totalTickets = data.find((d) => d.key === "total")?.value ?? 0
  const hasData = data.some((d) => d.value > 0)

  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
          Ticket Overview
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400">
          {RANGE_DESCRIPTION[range]}
        </CardDescription>
        <CardAction>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger size="sm" className="w-[130px]" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 items-center">
        {loading ? (
          <div className="grid w-full grid-cols-1 items-center gap-6 md:grid-cols-2">
            <Skeleton className="mx-auto aspect-square w-full max-w-[240px] rounded-full" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 items-center gap-6 md:grid-cols-2">
            {hasData ? (
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square w-full max-w-[240px]"
              >
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="95%"
                    paddingAngle={2}
                    cornerRadius={4}
                    strokeWidth={0}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={viewBox.cy}
                                className="fill-gray-900 text-3xl font-bold dark:fill-white"
                              >
                                {totalTickets.toLocaleString()}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 24}
                                className="fill-gray-500 text-xs dark:fill-gray-400"
                              >
                                Total tickets
                              </tspan>
                            </text>
                          )
                        }
                        return null
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <EmptyState
                icon={ChartPie}
                title="No tickets yet"
                description="No tickets in this period."
                className="py-8"
              />
            )}

            <ul className="flex flex-col gap-2">
              {data.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">
                    {item.label}
                  </span>
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                    {item.value.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
