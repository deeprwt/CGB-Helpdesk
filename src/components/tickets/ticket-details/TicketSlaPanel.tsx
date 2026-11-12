"use client"

import * as React from "react"
import { Briefcase, Gauge, PauseCircle, ShieldCheck, Timer, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/lib/itsm"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import { fmtDateTime } from "./itsm-ticket"

export type SlaTicket = {
  status: string
  assignee: string | null
  created_at: string
  assigned_at?: string | null
  sla_response_at?: string | null
  sla_resolution_at?: string | null
  sla_response_breached?: boolean | null
  sla_resolution_breached?: boolean | null
  sla_business_hours?: boolean | null
  hold_started_at?: string | null
  hold_until?: string | null
  hold_duration_hours?: number | null
}

type State = { badge: React.ReactNode; detail: string | null; pct: number | null; bar: string }

const BAR: Record<string, string> = {
  brand: "[&_[data-slot=progress-indicator]]:bg-brand-500",
  emerald: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
  amber: "[&_[data-slot=progress-indicator]]:bg-amber-500",
  red: "[&_[data-slot=progress-indicator]]:bg-red-500",
  violet: "[&_[data-slot=progress-indicator]]:bg-violet-500",
}

function pct(start: string | number, end: string, now: number) {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 100
  return Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100))
}

function badge(tone: BadgeTone, text: string) {
  return (
    <StatusBadge tone={tone} dot>
      {text}
    </StatusBadge>
  )
}

/** A running clock: time left, or overdue. */
function running(start: string, due: string, now: number): State {
  const left = (new Date(due).getTime() - now) / 60000
  const p = pct(start, due, now)
  if (left <= 0) {
    return { badge: badge("red", "Breached"), detail: `Due ${fmtDateTime(due)}`, pct: 100, bar: BAR.red }
  }
  return {
    badge: badge(p >= 75 ? "amber" : "sky", `${formatMinutes(left)} left`),
    detail: `Due ${fmtDateTime(due)}`,
    pct: p,
    bar: p >= 75 ? BAR.amber : BAR.brand,
  }
}

function SlaRow({ icon: Icon, label, state }: { icon: LucideIcon; label: string; state: State }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Icon className="h-4 w-4 text-gray-400" />
          {label}
        </span>
        {state.badge}
      </div>
      {state.detail && <p className="text-xs text-gray-500 dark:text-gray-400">{state.detail}</p>}
      {state.pct != null && (
        <Progress value={state.pct} className={cn("h-1.5 bg-gray-100 dark:bg-white/10", state.bar)} />
      )}
    </div>
  )
}

export default function TicketSlaPanel({ ticket }: { ticket: SlaTicket }) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const { status } = ticket
  const onHold = status === "hold"
  const closed = status === "closed"

  /* Response: met once someone picked the ticket up */
  let response: State | null = null
  if (ticket.sla_response_at) {
    const met = !!ticket.assignee || status !== "new"
    if (ticket.sla_response_breached) {
      response = { badge: badge("red", "Breached"), detail: `Was due ${fmtDateTime(ticket.sla_response_at)}`, pct: null, bar: BAR.red }
    } else if (met) {
      response = {
        badge: badge("emerald", "Met"),
        detail: ticket.assigned_at ? `Picked up ${fmtDateTime(ticket.assigned_at)}` : null,
        pct: null,
        bar: BAR.emerald,
      }
    } else {
      response = running(ticket.created_at, ticket.sla_response_at, now)
    }
  }

  /* Resolution */
  let resolution: State | null = null
  if (ticket.sla_resolution_at) {
    if (ticket.sla_resolution_breached) {
      resolution = { badge: badge("red", "Breached"), detail: `Was due ${fmtDateTime(ticket.sla_resolution_at)}`, pct: closed ? null : 100, bar: BAR.red }
    } else if (closed) {
      resolution = { badge: badge("emerald", "Met"), detail: `Was due ${fmtDateTime(ticket.sla_resolution_at)}`, pct: null, bar: BAR.emerald }
    } else if (onHold) {
      const frozenAt = ticket.hold_started_at ? new Date(ticket.hold_started_at).getTime() : now
      const left = (new Date(ticket.sla_resolution_at).getTime() - frozenAt) / 60000
      resolution = {
        badge: badge("violet", "Paused (on hold)"),
        detail: left > 0 ? `${formatMinutes(left)} left when resumed` : `Due ${fmtDateTime(ticket.sla_resolution_at)}`,
        pct: pct(ticket.created_at, ticket.sla_resolution_at, frozenAt),
        bar: BAR.violet,
      }
    } else {
      resolution = running(ticket.created_at, ticket.sla_resolution_at, now)
    }
  }

  /* Hold window */
  let hold: State | null = null
  if (onHold && ticket.hold_until) {
    const start =
      ticket.hold_started_at ??
      (ticket.hold_duration_hours
        ? new Date(ticket.hold_until).getTime() - ticket.hold_duration_hours * 3600000
        : null)
    hold = {
      badge: badge("amber", ticket.hold_duration_hours ? `${ticket.hold_duration_hours}h` : "On hold"),
      detail: `Until ${fmtDateTime(ticket.hold_until)}`,
      pct: start != null ? pct(start, ticket.hold_until, now) : null,
      bar: BAR.amber,
    }
  }

  if (!response && !resolution && !hold) return null

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20">
            <Gauge className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">Service level</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {ticket.sla_business_hours ? (
                <>
                  <Briefcase className="h-3 w-3" />
                  Counted in business hours only
                </>
              ) : (
                "Counted around the clock"
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 py-5">
        {response && <SlaRow icon={Timer} label="Response" state={response} />}
        {resolution && <SlaRow icon={ShieldCheck} label="Resolution" state={resolution} />}
        {hold && <SlaRow icon={PauseCircle} label="On hold" state={hold} />}
      </CardContent>
    </Card>
  )
}
