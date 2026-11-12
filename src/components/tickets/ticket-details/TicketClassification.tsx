"use client"

import * as React from "react"
import { Layers, Loader2, Pencil } from "lucide-react"
import {
  IMPACT_LABELS,
  LEVELS,
  PRIORITIES,
  PRIORITY_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  URGENCY_LABELS,
  isLevel,
  priorityFromMatrix,
  type Level,
  type Priority,
  type TicketType,
} from "@/lib/itsm"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/common/status-badge"
import {
  LEVEL_LABEL,
  PRIORITY_TONE,
  TYPE_TONE,
  patchTicket,
  priorityOf,
  typeOf,
  useItsmConfig,
  type ItsmTicket,
} from "./itsm-ticket"

const NONE = "__none__"
const AUTO = "__auto__"

type Props = {
  ticket: ItsmTicket
  /** IT team of the ticket's tenant */
  canEdit: boolean
  onSaved: () => void | Promise<void>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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

const muted = <span className="text-sm font-normal text-gray-400 dark:text-gray-500">Not set</span>

export default function TicketClassification({ ticket, canEdit, onSaved }: Props) {
  const closed = ticket.status === "closed"
  const currentType = typeOf(ticket)
  const currentPriority = priorityOf(ticket.priority)
  const editable = canEdit && !closed
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const { config, error } = useItsmConfig(editing)

  const [type, setType] = React.useState<TicketType>(typeOf(ticket))
  const [category, setCategory] = React.useState("")
  const [subCategory, setSubCategory] = React.useState("")
  const [impact, setImpact] = React.useState<Level | "">("")
  const [urgency, setUrgency] = React.useState<Level | "">("")
  const [override, setOverride] = React.useState<Priority | "">("")

  const startEdit = () => {
    setType(typeOf(ticket))
    setCategory(ticket.category ?? "")
    setSubCategory(ticket.sub_category ?? "")
    setImpact(isLevel(ticket.impact) ? ticket.impact : "")
    setUrgency(isLevel(ticket.urgency) ? ticket.urgency : "")
    // Keep an existing priority that differs from the matrix as an override
    setOverride("")
    setEditing(true)
  }

  React.useEffect(() => {
    if (!editable) setEditing(false)
  }, [editable])

  /* Categories offered for the chosen type */
  const topLevel = React.useMemo(
    () =>
      (config?.categories ?? [])
        .filter((c) => !c.parent_id && c.is_active && (!c.ticket_types || c.ticket_types.includes(type)))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [config, type]
  )
  const parent = topLevel.find((c) => c.name.toLowerCase() === category.toLowerCase())
  const subs = React.useMemo(
    () =>
      parent
        ? (config?.categories ?? [])
            .filter((c) => c.parent_id === parent.id && c.is_active)
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        : [],
    [config, parent]
  )

  const matrixPriority: Priority | null =
    impact && urgency ? priorityFromMatrix(config?.matrix ?? [], impact, urgency) : null
  const effective: Priority = override || matrixPriority || priorityOf(ticket.priority)

  const save = async () => {
    const body: Record<string, unknown> = {}
    if (type !== typeOf(ticket)) body.ticket_type = type
    if (category !== (ticket.category ?? "") || subCategory !== (ticket.sub_category ?? "") || body.ticket_type) {
      body.category = category || null
      body.sub_category = subCategory || null
    }
    if (impact !== (ticket.impact ?? "")) body.impact = impact || null
    if (urgency !== (ticket.urgency ?? "")) body.urgency = urgency || null
    // Without an override the server derives the priority from the matrix
    // (or keeps the current one when impact/urgency are incomplete)
    if (override && override !== currentPriority) body.priority = override
    if (Object.keys(body).length === 0) {
      setEditing(false)
      return
    }
    setSaving(true)
    const ok = await patchTicket(ticket.id, body)
    setSaving(false)
    if (ok) {
      setEditing(false)
      await onSaved()
    }
  }

  const categoryText = [ticket.category, ticket.sub_category].filter(Boolean).join(" / ")

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20">
            <Layers className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
              Classification
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {closed && canEdit ? "Closed tickets can't be re-classified" : "Type, category and priority"}
            </CardDescription>
          </div>
        </div>
        {editable && !editing && (
          <CardAction className="self-center">
            <Button variant="ghost" size="sm" onClick={startEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="py-5">
        {!editing ? (
          <dl className="flex flex-col gap-3">
            <Row label="Type">
              <StatusBadge tone={TYPE_TONE[currentType]}>{TICKET_TYPE_LABELS[currentType]}</StatusBadge>
            </Row>
            <Row label="Category">
              {categoryText ? <span className="truncate">{categoryText}</span> : muted}
            </Row>
            <Row label="Impact">{ticket.impact ? LEVEL_LABEL[ticket.impact] : muted}</Row>
            <Row label="Urgency">{ticket.urgency ? LEVEL_LABEL[ticket.urgency] : muted}</Row>
            <Row label="Priority">
              <StatusBadge tone={PRIORITY_TONE[currentPriority]} dot>
                {PRIORITY_LABELS[currentPriority]}
              </StatusBadge>
            </Row>
          </dl>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <Field>
              <FieldLabel htmlFor="cls-type">Record type</FieldLabel>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as TicketType)
                }}
              >
                <SelectTrigger id="cls-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TICKET_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type !== currentType && (
                <FieldDescription>
                  Changing the type gives the ticket new SLA deadlines
                  {currentType === "change" ? " and clears its change details" : ""}.
                </FieldDescription>
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="cls-cat">Category</FieldLabel>
                <Select
                  value={parent ? parent.name : NONE}
                  onValueChange={(v) => {
                    setCategory(v === NONE ? "" : v)
                    setSubCategory("")
                  }}
                  disabled={!config}
                >
                  <SelectTrigger id="cls-cat" className="w-full">
                    <SelectValue placeholder={config ? "Select" : "Loading…"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {topLevel.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {config && category && !parent && (
                  <FieldDescription>
                    &quot;{category}&quot; is not offered for this type. Pick another.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="cls-sub">Sub-category</FieldLabel>
                <Select
                  value={subs.some((s) => s.name === subCategory) ? subCategory : NONE}
                  onValueChange={(v) => setSubCategory(v === NONE ? "" : v)}
                  disabled={!config || subs.length === 0}
                >
                  <SelectTrigger id="cls-sub" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {subs.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="cls-impact">Impact</FieldLabel>
                <Select value={impact || NONE} onValueChange={(v) => setImpact(v === NONE ? "" : (v as Level))}>
                  <SelectTrigger id="cls-impact" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {[...LEVELS].reverse().map((l) => (
                      <SelectItem key={l} value={l}>
                        {IMPACT_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="cls-urgency">Urgency</FieldLabel>
                <Select value={urgency || NONE} onValueChange={(v) => setUrgency(v === NONE ? "" : (v as Level))}>
                  <SelectTrigger id="cls-urgency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {[...LEVELS].reverse().map((l) => (
                      <SelectItem key={l} value={l}>
                        {URGENCY_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="cls-priority">Priority</FieldLabel>
              <Select value={override || AUTO} onValueChange={(v) => setOverride(v === AUTO ? "" : (v as Priority))}>
                <SelectTrigger id="cls-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>
                    {matrixPriority ? `From matrix (${PRIORITY_LABELS[matrixPriority]})` : "Keep current"}
                  </SelectItem>
                  {[...PRIORITIES].reverse().map((p) => (
                    <SelectItem key={p} value={p}>
                      Override: {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription className="flex flex-wrap items-center gap-1.5">
                Result:
                <StatusBadge tone={PRIORITY_TONE[effective]} dot>
                  {PRIORITY_LABELS[effective]}
                </StatusBadge>
                {effective !== currentPriority && <span>(SLA deadlines are recalculated)</span>}
              </FieldDescription>
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving || !config || (!!category && !parent)}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
