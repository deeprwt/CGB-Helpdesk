"use client"

import * as React from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-client"
import {
  isPriority,
  isTicketType,
  type ChangeType,
  type Level,
  type MatrixCell,
  type Priority,
  type TicketType,
} from "@/lib/itsm"
import type { BadgeTone } from "@/components/common/status-badge"

/** The ITSM fields of a ticket the detail page works with. */
export type ItsmTicket = {
  id: string
  number?: string | null
  status: string
  ticket_type?: TicketType | null
  category?: string | null
  sub_category?: string | null
  impact?: Level | null
  urgency?: Level | null
  priority?: string | null
  root_cause?: string | null
  workaround?: string | null
  known_error?: boolean | null
  change_type?: ChangeType | null
  risk?: Level | null
  planned_start?: string | null
  planned_end?: string | null
  implementation_plan?: string | null
  backout_plan?: string | null
}

export type CategoryRow = {
  id: string
  parent_id: string | null
  name: string
  ticket_types: TicketType[] | null
  sort_order: number
  is_active: boolean
}

export type ItsmConfigResponse = {
  categories: CategoryRow[]
  matrix: MatrixCell[]
}

export function typeOf(t: { ticket_type?: string | null }): TicketType {
  return isTicketType(t.ticket_type) ? t.ticket_type : "incident"
}

export function priorityOf(p: string | null | undefined): Priority {
  return isPriority(p) ? p : "medium"
}

export const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  critical: "rose",
  high: "red",
  medium: "amber",
  low: "emerald",
}

export const TYPE_TONE: Record<TicketType, BadgeTone> = {
  incident: "red",
  service_request: "sky",
  problem: "violet",
  change: "indigo",
}

export const LEVEL_LABEL: Record<Level, string> = { low: "Low", medium: "Medium", high: "High" }

/**
 * PATCH /api/tickets/:id. Shows a toast on failure (a 409 asks to refresh) and
 * returns whether it saved.
 */
export async function patchTicket(id: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    await apiFetch(`/api/tickets/${id}`, { method: "PATCH", body })
    toast.success("Ticket updated")
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      toast.error("Someone else changed this ticket meanwhile. Refresh the page and try again.")
    } else {
      toast.error(err instanceof Error ? err.message : "Couldn't update the ticket")
    }
    return false
  }
}

/** The tenant's categories and priority matrix, loaded once on demand. */
export function useItsmConfig(enabled: boolean) {
  const [config, setConfig] = React.useState<ItsmConfigResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!enabled || config) return
    let cancelled = false
    apiFetch<ItsmConfigResponse>("/api/itsm/config")
      .then((c) => {
        if (!cancelled) setConfig({ categories: c.categories ?? [], matrix: c.matrix ?? [] })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load categories")
      })
    return () => {
      cancelled = true
    }
  }, [enabled, config])

  return { config, error }
}

/** ISO → value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local value → ISO (or null). */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
