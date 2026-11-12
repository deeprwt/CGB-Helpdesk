"use client"

import * as React from "react"
import Link from "next/link"
import { Link2, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import {
  LINK_TYPES,
  LINK_TYPE_LABELS,
  TICKET_TYPE_LABELS,
  ticketRef,
  type LinkType,
} from "@/lib/itsm"
import { STATUS_TONE, statusLabel } from "@/lib/ticket-utils"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/common/status-badge"
import { TYPE_TONE, typeOf } from "./itsm-ticket"

type LinkedTicket = {
  id: string
  number: string | null
  subject: string
  ticket_type: string | null
  status: string
}

type TicketLink = {
  id: string
  link_type: LinkType
  direction: "out" | "in"
  created_at: string
  ticket: LinkedTicket | null
}

/** How the link reads from this ticket's side. */
const INBOUND_LABELS: Record<LinkType, string> = {
  related: "Related to",
  caused_by: "Causes",
  duplicate_of: "Duplicated by",
  implements: "Implements",
}

function phrase(l: TicketLink) {
  return l.direction === "out" ? LINK_TYPE_LABELS[l.link_type] : INBOUND_LABELS[l.link_type]
}

type Props = {
  ticketId: string
  canEdit: boolean
  /** Called after a link is added or removed (e.g. to reload the activity) */
  onChanged?: () => void | Promise<void>
}

export default function TicketLinks({ ticketId, canEdit, onChanged }: Props) {
  const [links, setLinks] = React.useState<TicketLink[] | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [to, setTo] = React.useState("")
  const [linkType, setLinkType] = React.useState<LinkType>("related")
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ links: TicketLink[] }>(`/api/tickets/${ticketId}/links`)
      setLinks(res.links ?? [])
    } catch (err) {
      setLinks([])
      toast.error(err instanceof Error ? err.message : "Couldn't load linked records")
    }
  }, [ticketId])

  React.useEffect(() => {
    load()
  }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim()) return
    setBusy(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/links`, { method: "POST", body: { to: to.trim(), link_type: linkType } })
      toast.success("Linked")
      setTo("")
      setAdding(false)
      await load()
      await onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't link the ticket")
    } finally {
      setBusy(false)
    }
  }

  const remove = async (linkId: string) => {
    setRemoving(linkId)
    try {
      await apiFetch(`/api/tickets/${ticketId}/links?link_id=${encodeURIComponent(linkId)}`, { method: "DELETE" })
      toast.success("Link removed")
      await load()
      await onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the link")
    } finally {
      setRemoving(null)
    }
  }

  /* Group by how the link reads */
  const groups = new Map<string, TicketLink[]>()
  for (const l of links ?? []) {
    if (!l.ticket) continue
    const key = phrase(l)
    groups.set(key, [...(groups.get(key) ?? []), l])
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/20">
            <Link2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">Linked records</CardTitle>
            <CardDescription className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Related incidents, problems and changes
            </CardDescription>
          </div>
        </div>
        {canEdit && !adding && (
          <CardAction className="self-center">
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Link
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4 py-5">
        {adding && (
          <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={linkType} onValueChange={(v) => setLinkType(v as LinkType)}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Link type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {LINK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Ticket number, e.g. PRB0001001"
                aria-label="Ticket number"
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !to.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Add link
              </Button>
            </div>
          </form>
        )}

        {links === null ? (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : groups.size === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No linked records.</p>
        ) : (
          [...groups.entries()].map(([label, items]) => (
            <div key={label} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
              <ul className="flex flex-col gap-2">
                {items.map((l) => {
                  const t = l.ticket!
                  const type = typeOf(t)
                  return (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-white/10"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/ticket/${t.id}`}
                          className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                        >
                          {ticketRef(t)}
                        </Link>
                        <p className="truncate text-sm text-gray-700 dark:text-gray-300">{t.subject}</p>
                      </div>
                      <StatusBadge tone={TYPE_TONE[type]} className="hidden sm:inline-flex">
                        {TICKET_TYPE_LABELS[type]}
                      </StatusBadge>
                      <StatusBadge tone={STATUS_TONE[t.status] ?? "gray"} dot>
                        {statusLabel(t.status)}
                      </StatusBadge>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove link to ${ticketRef(t)}`}
                          onClick={() => remove(l.id)}
                          disabled={removing === l.id}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          {removing === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
