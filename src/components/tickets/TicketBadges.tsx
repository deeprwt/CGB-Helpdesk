"use client"

import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import {
  PRIORITY_LABELS,
  TICKET_TYPE_LABELS,
  isPriority,
  isTicketType,
  type Priority,
  type TicketType,
} from "@/lib/itsm"

export const TICKET_TYPE_TONE: Record<TicketType, BadgeTone> = {
  incident: "rose",
  service_request: "sky",
  problem: "violet",
  change: "indigo",
}

export const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  critical: "red",
  high: "orange",
  medium: "amber",
  low: "gray",
}

/** Incident / Service Request / Problem / Change. Rows from before ITSM count as incidents. */
export function TicketTypeBadge({ type, className }: { type: string | null | undefined; className?: string }) {
  const t: TicketType = isTicketType(type) ? type : "incident"
  return (
    <StatusBadge tone={TICKET_TYPE_TONE[t]} className={className}>
      {TICKET_TYPE_LABELS[t]}
    </StatusBadge>
  )
}

/** "P1 · Critical" … "P4 · Low"; a dash when the ticket has no priority. */
export function PriorityBadge({ priority, className }: { priority: string | null | undefined; className?: string }) {
  if (!isPriority(priority)) return <span className="text-gray-400 dark:text-gray-500">-</span>
  return (
    <StatusBadge tone={PRIORITY_TONE[priority]} className={className}>
      <span className="whitespace-nowrap">{PRIORITY_LABELS[priority]}</span>
    </StatusBadge>
  )
}

/** Monospace pill with the ticket's number (or the old id stub). */
export const TICKET_REF_CLASS =
  "inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10"
