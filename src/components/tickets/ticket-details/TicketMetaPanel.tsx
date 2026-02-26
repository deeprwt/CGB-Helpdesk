"use client"

import * as React from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Calendar, Paperclip, Link2, Clock, Edit2, ArrowUp } from "lucide-react"
import { toast } from "sonner"

/* -----------------------------------
   Types
----------------------------------- */
type Attachment = {
  id: string
  file_name: string
  file_path: string
}

type Props = {
  ticketId: string
  subject: string
  priority: "low" | "medium" | "high"
  requesterName: string
  requesterAvatar?: string | null
  assigneeText?: string | null
  createdAt: string
  assignedAt?: string | null
  attachments: Attachment[]
  link?: string | null
}

/* -----------------------------------
   Helpers
----------------------------------- */
function formatProjectNo(id: string) {
  const cleaned = id.replace(/-/g, "").slice(0, 7).toUpperCase()
  return `PN${cleaned}`
}

function getDeadline(date: string) {
  const d = new Date(date)
  d.setDate(d.getDate() + 2)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTimeLogged(fromDate: string): string {
  const ms = Math.max(0, Date.now() - new Date(fromDate).getTime())
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(" ")
}

function formatEstimateHours(totalHours: number): string {
  const d = Math.floor(totalHours / 24)
  const h = totalHours % 24
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

/* -----------------------------------
   Priority config
----------------------------------- */
const PRIORITY = {
  high: {
    label: "High",
    textColor: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/40",
  },
  medium: {
    label: "Medium",
    textColor: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
  },
  low: {
    label: "Low",
    textColor: "text-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/40",
  },
}

/* -----------------------------------
   SVG Circular Progress Ring
----------------------------------- */
function CircularRing({ value }: { value: number }) {
  const SIZE = 76
  const cx = SIZE / 2
  const cy = SIZE / 2
  const radius = 28
  const stroke = 7
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(value, 100) / 100) * circumference

  return (
    <svg width={SIZE} height={SIZE} className="flex-shrink-0">
      {/* Track ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted-foreground/20"
      />
      {/* Progress ring — starts at 12 o'clock */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        className="text-blue-500 transition-all duration-700"
      />
    </svg>
  )
}

/* -----------------------------------
   Component
----------------------------------- */
export default function TicketMetaPanel({
  ticketId,
  subject,
  priority,
  requesterName,
  requesterAvatar,
  assigneeText,
  createdAt,
  assignedAt,
  attachments,
  link,
}: Props) {
  const ESTIMATE_HOURS = 80 // 3d 8h

  const timeLoggedMs = assignedAt
    ? Math.max(0, Date.now() - new Date(assignedAt).getTime())
    : 0
  const timeLoggedHours = timeLoggedMs / 3600000
  const progress = Math.min((timeLoggedHours / ESTIMATE_HOURS) * 100, 100)

  const pCfg = PRIORITY[priority]

  return (
    <Card className="p-5 shadow-sm rounded-2xl border bg-card">
      <div className="space-y-5">

        {/* ── Project No. ─────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Project No.
            </p>
            <p className="text-[22px] font-extrabold tracking-tight leading-none">
              {formatProjectNo(ticketId)}
            </p>
          </div>
          <button
            className="mt-1 rounded-xl border p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Edit ticket"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>

        <div className="border-t border-border/60" />

        {/* ── Description ─────────────────────── */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Description
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {subject}
          </p>
        </div>

        <div className="border-t border-border/60" />

        {/* ── Reporter ─────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Reporter
          </p>
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm">
              <AvatarImage src={requesterAvatar ?? undefined} />
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {requesterName?.[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">{requesterName}</span>
          </div>
        </div>

        {/* ── Assignees ────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Assignees
          </p>
          {assigneeText ? (
            <div className="flex items-center">
              <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm">
                <AvatarFallback className="text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  E
                </AvatarFallback>
              </Avatar>
              <Avatar className="-ml-2.5 h-8 w-8 ring-2 ring-background shadow-sm">
                <AvatarFallback className="text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  S
                </AvatarFallback>
              </Avatar>
              <span className="-ml-2.5 flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-background bg-blue-500 text-[10px] font-bold text-white shadow-sm">
                +2
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not assigned yet</p>
          )}
        </div>

        {/* ── Priority ─────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Priority
          </p>
          <div
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${pCfg.bgColor}`}
          >
            <ArrowUp className={`h-3.5 w-3.5 ${pCfg.textColor}`} strokeWidth={2.5} />
            <span className={`text-sm font-bold ${pCfg.textColor}`}>
              {pCfg.label}
            </span>
          </div>
        </div>

        {/* ── Dead Line ────────────────────────── */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Dead Line
          </p>
          <p className="text-sm font-bold">{getDeadline(createdAt)}</p>
        </div>

        {/* ── Time Tracking (when assigned) ────── */}
        {assignedAt && (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 space-y-4">
            <p className="text-sm font-bold">Time tracking</p>

            <div className="flex items-center gap-4">
              <CircularRing value={progress} />
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-bold leading-snug">
                  {formatTimeLogged(assignedAt)} logged
                </p>
                <p className="text-xs text-muted-foreground">
                  Original Estimate {formatEstimateHours(ESTIMATE_HOURS)}
                </p>
              </div>
            </div>

            <Button
              className="w-full rounded-xl font-semibold"
              onClick={() => toast.info("Time logging coming soon")}
            >
              <Clock className="h-4 w-4 mr-2" />
              Log time
            </Button>
          </div>
        )}

        {/* ── Created ──────────────────────────── */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Created{" "}
            {new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        {/* ── Action buttons ───────────────────── */}
        <div className="flex items-center gap-2">
          {/* Attachment button */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50 transition-colors"
            title={
              attachments.length > 0
                ? `${attachments.length} attachment(s)`
                : "No attachments"
            }
            onClick={() => {
              if (attachments.length === 0) {
                toast.info("No attachments on this ticket")
              }
            }}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Link button — fixed: navigates to the linked URL */}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-600 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50 transition-colors"
              title={link}
            >
              <Link2 className="h-4 w-4" />
            </a>
          ) : (
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-600 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50 transition-colors opacity-50"
              title="No link attached"
              onClick={() => toast.info("No link attached to this ticket")}
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}
        </div>

      </div>
    </Card>
  )
}
