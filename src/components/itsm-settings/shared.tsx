"use client"

import * as React from "react"
import type { MatrixCell, Priority, SlaPolicy, TicketType, WorkCalendar } from "@/lib/itsm"
import { cn } from "@/lib/utils"

export type CategoryRow = {
  id: string
  parent_id: string | null
  name: string
  ticket_types: TicketType[] | null
  sort_order: number
  is_active: boolean
}

/** GET /api/itsm/config */
export type ItsmConfigResponse = {
  tenant_id: string
  categories: CategoryRow[]
  matrix: MatrixCell[]
  policies: SlaPolicy[]
  calendar: WorkCalendar
}

/** What every tab gets: the tenant being configured and a way to reload after saving. */
export type TabProps = {
  /** Sent on every call when set (super admins); admins work on their own tenant. */
  tenantId?: string
  onSaved: () => Promise<void> | void
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

/** P1..P4 order */
export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"]

export const PRIORITY_STYLES: Record<Priority, string> = {
  critical:
    "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
  high: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
  medium:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
}

export const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
}

/** Card-like section used by every tab. */
export function Section({
  title,
  description,
  actions,
  children,
  footer,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/40",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-white/5">
          {footer}
        </div>
      )}
    </section>
  )
}

/** "Unsaved changes" hint for the footers. */
export function DirtyHint({ dirty }: { dirty: boolean }) {
  if (!dirty) return null
  return (
    <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unsaved changes
    </span>
  )
}
