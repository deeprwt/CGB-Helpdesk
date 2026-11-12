"use client"

import * as React from "react"
import {
  ArrowUp,
  Clock,
  FileText,
  Link2,
  Paperclip,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { STATUS_TONE, statusLabel } from "@/lib/ticket-utils"
import {
  Card,
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
import { StatusBadge } from "@/components/common/status-badge"
import { PRIORITY_LABELS, TICKET_TYPE_LABELS, type Priority, type TicketType } from "@/lib/itsm"
import { PRIORITY_TONE, TYPE_TONE, fmtDateTime } from "./itsm-ticket"

/* -----------------------------------
   Types
----------------------------------- */
type Attachment = {
  id: string
  file_name: string
  file_path: string
}

type Props = {
  /** Display reference, e.g. INC0001012 */
  ticketRef: string
  ticketType: TicketType
  subject: string
  priority: Priority
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
  engineers?: { id: string; name: string }[]
  /** Resolution SLA deadline, shown as the due date */
  resolutionDue?: string | null
}

/* -----------------------------------
   Helpers
----------------------------------- */
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

function initials(name?: string | null) {
  return (name ?? "?").trim()[0]?.toUpperCase() ?? "?"
}

/* -----------------------------------
   Visual config
----------------------------------- */
const AVATAR_GRADIENTS = [
  "from-brand-500 to-brand-600",
  "from-sky-500 to-brand-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-fuchsia-500",
]

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
  ticketRef,
  ticketType,
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
  engineers = [],
  resolutionDue,
}: Props) {
  const ESTIMATE_HOURS = 80 // 3d 8h

  const timeLoggedHours = assignedAt ? hoursSince(assignedAt) : 0
  const progress = Math.min((timeLoggedHours / ESTIMATE_HOURS) * 100, 100)

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
              {ticketRef}
            </CardDescription>
          </div>
        </div>
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

          <MetaRow label="Type">
            <StatusBadge tone={TYPE_TONE[ticketType]}>{TICKET_TYPE_LABELS[ticketType]}</StatusBadge>
          </MetaRow>

          <MetaRow label="Priority">
            <StatusBadge tone={PRIORITY_TONE[priority]}>
              <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
              {PRIORITY_LABELS[priority]}
            </StatusBadge>
          </MetaRow>

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

          {resolutionDue && <MetaRow label="Due">{fmtDateTime(resolutionDue)}</MetaRow>}

          <MetaRow label="Created">
            {new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </MetaRow>
        </dl>

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
