"use client"

import * as React from "react"
import { GitPullRequestArrow, Info, Loader2, Pencil } from "lucide-react"
import { CHANGE_TYPES, LEVELS, type ChangeType, type Level } from "@/lib/itsm"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import { statusLabel } from "@/lib/ticket-utils"
import {
  LEVEL_LABEL,
  fmtDateTime,
  fromLocalInput,
  patchTicket,
  toLocalInput,
  type ItsmTicket,
} from "./itsm-ticket"
import { DetailText } from "./ProblemDetails"

const NONE = "__none__"

const CHANGE_TONE: Record<ChangeType, BadgeTone> = { standard: "sky", normal: "indigo", emergency: "red" }
const RISK_TONE: Record<Level, BadgeTone> = { low: "emerald", medium: "amber", high: "red" }

type Props = {
  ticket: ItsmTicket
  canEdit: boolean
  onSaved: () => void | Promise<void>
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="text-sm font-medium text-gray-900 dark:text-white">{children}</div>
    </div>
  )
}

const notSet = <span className="font-normal text-gray-400 dark:text-gray-500">Not set</span>

export default function ChangeDetails({ ticket, canEdit, onSaved }: Props) {
  const editable = canEdit && ticket.status !== "closed"
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [changeType, setChangeType] = React.useState<ChangeType | "">("")
  const [risk, setRisk] = React.useState<Level | "">("")
  const [start, setStart] = React.useState("")
  const [end, setEnd] = React.useState("")
  const [plan, setPlan] = React.useState("")
  const [backout, setBackout] = React.useState("")

  React.useEffect(() => {
    if (!editable) setEditing(false)
  }, [editable])

  const startEdit = () => {
    setChangeType(ticket.change_type ?? "")
    setRisk(ticket.risk ?? "")
    setStart(toLocalInput(ticket.planned_start))
    setEnd(toLocalInput(ticket.planned_end))
    setPlan(ticket.implementation_plan ?? "")
    setBackout(ticket.backout_plan ?? "")
    setEditing(true)
  }

  const windowError =
    start && end && new Date(end) <= new Date(start) ? "The planned end must be after the planned start" : null

  const save = async () => {
    const body: Record<string, unknown> = {}
    if (changeType !== (ticket.change_type ?? "")) body.change_type = changeType || null
    if (risk !== (ticket.risk ?? "")) body.risk = risk || null
    if (start !== toLocalInput(ticket.planned_start)) body.planned_start = fromLocalInput(start)
    if (end !== toLocalInput(ticket.planned_end)) body.planned_end = fromLocalInput(end)
    if (plan.trim() !== (ticket.implementation_plan ?? "")) body.implementation_plan = plan.trim() || null
    if (backout.trim() !== (ticket.backout_plan ?? "")) body.backout_plan = backout.trim() || null
    if (Object.keys(body).length === 0) return setEditing(false)
    setSaving(true)
    const ok = await patchTicket(ticket.id, body)
    setSaving(false)
    if (ok) {
      setEditing(false)
      await onSaved()
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
            <GitPullRequestArrow className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">Change details</CardTitle>
            <CardDescription className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Type, risk, planned window and plans
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

      <CardContent className="flex flex-col gap-5 py-5">
        <p className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Approvals and CAB review come in a later release. For now, agree the change outside the tool before
          implementing it.
        </p>

        {!editing ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Fact label="Change type">
                {ticket.change_type ? (
                  <StatusBadge tone={CHANGE_TONE[ticket.change_type]}>{statusLabel(ticket.change_type)}</StatusBadge>
                ) : (
                  notSet
                )}
              </Fact>
              <Fact label="Risk">
                {ticket.risk ? <StatusBadge tone={RISK_TONE[ticket.risk]} dot>{LEVEL_LABEL[ticket.risk]}</StatusBadge> : notSet}
              </Fact>
              <Fact label="Planned start">{ticket.planned_start ? fmtDateTime(ticket.planned_start) : notSet}</Fact>
              <Fact label="Planned end">{ticket.planned_end ? fmtDateTime(ticket.planned_end) : notSet}</Fact>
            </div>
            <DetailText label="Implementation plan" value={ticket.implementation_plan} />
            <DetailText label="Backout plan" value={ticket.backout_plan} />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="chg-type">Change type</FieldLabel>
                <Select value={changeType || NONE} onValueChange={(v) => setChangeType(v === NONE ? "" : (v as ChangeType))}>
                  <SelectTrigger id="chg-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {CHANGE_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {statusLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="chg-risk">Risk</FieldLabel>
                <Select value={risk || NONE} onValueChange={(v) => setRisk(v === NONE ? "" : (v as Level))}>
                  <SelectTrigger id="chg-risk" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LEVEL_LABEL[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="chg-start">Planned start</FieldLabel>
                <Input id="chg-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="chg-end">Planned end</FieldLabel>
                <Input id="chg-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            {windowError && <p className="text-xs text-red-600 dark:text-red-400">{windowError}</p>}
            <Field>
              <FieldLabel htmlFor="chg-plan">Implementation plan</FieldLabel>
              <Textarea
                id="chg-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="min-h-[110px]"
                placeholder="Steps to carry out the change"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="chg-backout">Backout plan</FieldLabel>
              <Textarea
                id="chg-backout"
                value={backout}
                onChange={(e) => setBackout(e.target.value)}
                className="min-h-[110px]"
                placeholder="How to undo the change if it goes wrong"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving || !!windowError}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
