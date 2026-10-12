"use client"

import * as React from "react"
import {
  ArrowUp,
  Clock,
  FileText,
  Link2,
  PauseCircle,
  Paperclip,
  Pencil,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { STATUS_TONE, statusLabel } from "@/lib/ticket-utils"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"

/* -----------------------------------
   Types
----------------------------------- */
type Attachment = {
  id: string
  file_name: string
  file_path: string
}

type SlaInfo = {
  responseAt?: string | null
  resolutionAt?: string | null
  responseBreached?: boolean
  resolutionBreached?: boolean
  holdUntil?: string | null
  holdStartedAt?: string | null
  holdDurationHours?: number | null
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
  /** Optional extras (display only) */
  description?: string | null
  status?: string
  category?: string | null
  subCategory?: string | null
  engineers?: { id: string; name: string }[]
  sla?: SlaInfo
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

function hoursSince(fromDate: string): number {
  return Math.max(0, Date.now() - new Date(fromDate).getTime()) / 3600000
}

/** Elapsed share (0–100) of the window between `start` and `end`. */
function elapsedPct(start: string | number, end: string): number {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 100
  return Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100))
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function initials(name?: string | null) {
  return (name ?? "?").trim()[0]?.toUpperCase() ?? "?"
}

/* -----------------------------------
   Visual config
----------------------------------- */
const PRIORITY: Record<Props["priority"], { label: string; tone: BadgeTone }> = {
  high: { label: "High", tone: "red" },
  medium: { label: "Medium", tone: "amber" },
  low: { label: "Low", tone: "emerald" },
}

const AVATAR_GRADIENTS = [
  "from-brand-500 to-brand-600",
  "from-sky-500 to-brand-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-fuchsia-500",
]

const PROGRESS_TONE = {
  indigo: "[&_[data-slot=progress-indicator]]:bg-brand-500",
  emerald: "[&_[data-slot=progress-indicator]]:bg-emerald-500",
  amber: "[&_[data-slot=progress-indicator]]:bg-amber-500",
  red: "[&_[data-slot=progress-indicator]]:bg-red-500",
} as const

type SlaRow = {
  key: string
  label: string
  icon: LucideIcon
  value: React.ReactNode
  pct: number | null
  tone: keyof typeof PROGRESS_TONE
}

/* -----------------------------------
   Small pieces
----------------------------------- */
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end text-right text-sm font-medium text-gray-900 dark:text-white">
        {children}
      </dd>
    </div>
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
  description,
  status,
  category,
  subCategory,
  engineers = [],
  sla,
}: Props) {
  const ESTIMATE_HOURS = 80 // 3d 8h

  const timeLoggedHours = assignedAt ? hoursSince(assignedAt) : 0
  const progress = Math.min((timeLoggedHours / ESTIMATE_HOURS) * 100, 100)

  const pCfg = PRIORITY[priority] ?? PRIORITY.medium

  /* SLA rows — same visibility rules as before */
  const slaRows: SlaRow[] = []
  if (sla) {
    if (status === "new" && sla.responseAt) {
      const breached = sla.responseBreached ?? false
      slaRows.push({
        key: "response",
        label: "Response SLA",
        icon: Timer,
        value: breached ? (
          <StatusBadge tone="red" dot>Breached</StatusBadge>
        ) : (
          fmtDateTime(sla.responseAt)
        ),
        pct: breached ? 100 : elapsedPct(createdAt, sla.responseAt),
        tone: breached ? "red" : "indigo",
      })
    }
    if (sla.resolutionAt && assigneeText && status !== "closed") {
      const breached = sla.resolutionBreached ?? false
      slaRows.push({
        key: "resolution",
        label: "Resolution SLA",
        icon: ShieldCheck,
        value: breached ? (
          <StatusBadge tone="red" dot>Breached</StatusBadge>
        ) : (
          fmtDateTime(sla.resolutionAt)
        ),
        pct: breached ? 100 : elapsedPct(assignedAt ?? createdAt, sla.resolutionAt),
        tone: breached ? "red" : "emerald",
      })
    }
    if (status === "hold" && sla.holdUntil) {
      const holdStart =
        sla.holdStartedAt ??
        (sla.holdDurationHours
          ? new Date(sla.holdUntil).getTime() - sla.holdDurationHours * 3600000
          : null)
      slaRows.push({
        key: "hold",
        label: "On hold until",
        icon: PauseCircle,
        value: (
          <span className="flex items-center gap-1.5">
            {fmtDateTime(sla.holdUntil)}
            {sla.holdDurationHours ? (
              <StatusBadge tone="amber">{sla.holdDurationHours}h</StatusBadge>
            ) : null}
          </span>
        ),
        pct: holdStart != null ? elapsedPct(holdStart, sla.holdUntil) : null,
        tone: "amber",
      })
    }
  }

  const categoryText = [category, subCategory].filter(Boolean).join(" / ")

  return (
    <Card className="gap-0 py-0">
      {/* ── Header ─────────────────────────── */}
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
              Ticket details
            </CardTitle>
            <CardDescription className="mt-1 font-mono text-xs tracking-wide text-gray-500 dark:text-gray-400">
              {formatProjectNo(ticketId)}
            </CardDescription>
          </div>
        </div>
        <CardAction className="self-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                aria-label="Edit ticket"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit ticket</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 py-5">
        {/* ── Description ─────────────────────── */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Description
          </p>
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {description || subject}
          </p>
        </div>

        <Separator className="bg-gray-100 dark:bg-white/10" />

        {/* ── Facts ───────────────────────────── */}
        <dl className="flex flex-col gap-3">
          {status && (
            <MetaRow label="Status">
              <StatusBadge tone={STATUS_TONE[status] ?? "gray"} dot>
                {statusLabel(status)}
              </StatusBadge>
            </MetaRow>
          )}

          <MetaRow label="Priority">
            <StatusBadge tone={pCfg.tone}>
              <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
              {pCfg.label}
            </StatusBadge>
          </MetaRow>

          {categoryText && (
            <MetaRow label="Category">
              <span className="truncate">{categoryText}</span>
            </MetaRow>
          )}

          <MetaRow label="Reporter">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={requesterAvatar ?? undefined} />
                <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
                  {initials(requesterName)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{requesterName}</span>
            </span>
          </MetaRow>

          <MetaRow label={engineers.length > 1 ? `Engineers (${engineers.length})` : "Assignee"}>
            {engineers.length > 0 ? (
              engineers.length === 1 ? (
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback
                      className={cn(
                        "bg-gradient-to-br text-xs font-semibold text-white",
                        AVATAR_GRADIENTS[1]
                      )}
                    >
                      {initials(engineers[0].name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{engineers[0].name}</span>
                </span>
              ) : (
                <span className="flex items-center">
                  {engineers.slice(0, 4).map((e, i) => (
                    <Tooltip key={e.id}>
                      <TooltipTrigger asChild>
                        <Avatar
                          className={cn(
                            "h-7 w-7 ring-2 ring-white dark:ring-gray-900",
                            i > 0 && "-ml-2"
                          )}
                        >
                          <AvatarFallback
                            className={cn(
                              "bg-gradient-to-br text-xs font-semibold text-white",
                              AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
                            )}
                          >
                            {initials(e.name)}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent>{e.name}</TooltipContent>
                    </Tooltip>
                  ))}
                  {engineers.length > 4 && (
                    <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-2 ring-white dark:bg-white/10 dark:text-gray-300 dark:ring-gray-900">
                      +{engineers.length - 4}
                    </span>
                  )}
                </span>
              )
            ) : assigneeText ? (
              <StatusBadge tone="sky" dot>Assigned</StatusBadge>
            ) : (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                Not assigned yet
              </span>
            )}
          </MetaRow>

          <MetaRow label="Due date">{getDeadline(createdAt)}</MetaRow>

          <MetaRow label="Created">
            {new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </MetaRow>
        </dl>

        {/* ── SLA ─────────────────────────────── */}
        {slaRows.length > 0 && (
          <>
            <Separator className="bg-gray-100 dark:bg-white/10" />
            <div className="flex flex-col gap-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Service level
              </p>
              {slaRows.map((row) => {
                const Icon = row.icon
                return (
                  <div key={row.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Icon className="h-4 w-4 text-gray-400" />
                        {row.label}
                      </span>
                      <span className="text-right text-xs font-medium text-gray-600 dark:text-gray-300">
                        {row.value}
                      </span>
                    </div>
                    {row.pct != null && (
                      <Progress
                        value={row.pct}
                        className={cn(
                          "h-1.5 bg-gray-100 dark:bg-white/10",
                          PROGRESS_TONE[row.tone]
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Time Tracking (when assigned) ────── */}
        {assignedAt && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <Clock className="h-4 w-4 text-brand-500 dark:text-brand-300" />
                Time tracking
              </p>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {Math.round(progress)}%
              </span>
            </div>

            <Progress
              value={progress}
              className="mt-3 h-2 bg-gray-200 dark:bg-white/10 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-brand-500 [&_[data-slot=progress-indicator]]:to-brand-600"
            />

            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatTimeLogged(assignedAt)} logged
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                Original Estimate {formatEstimateHours(ESTIMATE_HOURS)}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => toast.info("Time logging coming soon")}
            >
              <Clock className="h-4 w-4" />
              Log time
            </Button>
          </div>
        )}
      </CardContent>

      {/* ── Attachments & link ─────────────── */}
      <CardFooter className="justify-between gap-3 border-t border-gray-100 py-3 dark:border-white/10 [.border-t]:pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Resources
        </span>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100 hover:text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                aria-label="Attachments"
                onClick={() => {
                  if (attachments.length === 0) {
                    toast.info("No attachments on this ticket")
                  }
                }}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {attachments.length > 0
                ? `${attachments.length} attachment(s)`
                : "No attachments"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              {link ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="rounded-xl bg-teal-50 text-teal-600 hover:bg-teal-100 hover:text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25"
                >
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Open link">
                    <Link2 className="h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl bg-teal-50 text-teal-600 opacity-50 hover:bg-teal-100 hover:text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25"
                  aria-label="No link attached"
                  onClick={() => toast.info("No link attached to this ticket")}
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs break-all">
              {link ?? "No link attached"}
            </TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </Card>
  )
}
