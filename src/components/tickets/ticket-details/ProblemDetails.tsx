"use client"

import * as React from "react"
import { Bug, Loader2, Pencil } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { StatusBadge } from "@/components/common/status-badge"
import { patchTicket, type ItsmTicket } from "./itsm-ticket"

type Props = {
  ticket: ItsmTicket
  canEdit: boolean
  onSaved: () => void | Promise<void>
}

export function DetailText({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      {value ? (
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {value}
        </p>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">Not recorded yet</p>
      )}
    </div>
  )
}

export default function ProblemDetails({ ticket, canEdit, onSaved }: Props) {
  const editable = canEdit && ticket.status !== "closed"
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [rootCause, setRootCause] = React.useState("")
  const [workaround, setWorkaround] = React.useState("")
  const [knownError, setKnownError] = React.useState(false)

  React.useEffect(() => {
    if (!editable) setEditing(false)
  }, [editable])

  const startEdit = () => {
    setRootCause(ticket.root_cause ?? "")
    setWorkaround(ticket.workaround ?? "")
    setKnownError(!!ticket.known_error)
    setEditing(true)
  }

  const save = async () => {
    const body: Record<string, unknown> = {}
    if (rootCause.trim() !== (ticket.root_cause ?? "")) body.root_cause = rootCause.trim() || null
    if (workaround.trim() !== (ticket.workaround ?? "")) body.workaround = workaround.trim() || null
    if (knownError !== !!ticket.known_error) body.known_error = knownError
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20">
            <Bug className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              Problem details
              {ticket.known_error && <StatusBadge tone="amber">Known error</StatusBadge>}
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Root cause and workaround
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
        {!editing ? (
          <>
            <DetailText label="Root cause" value={ticket.root_cause} />
            <DetailText label="Workaround" value={ticket.workaround} />
          </>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="prb-root">Root cause</FieldLabel>
              <Textarea
                id="prb-root"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                className="min-h-[100px]"
                placeholder="What is causing the incidents"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prb-work">Workaround</FieldLabel>
              <Textarea
                id="prb-work"
                value={workaround}
                onChange={(e) => setWorkaround(e.target.value)}
                className="min-h-[100px]"
                placeholder="How people can keep working until it is fixed"
              />
            </Field>
            <Field orientation="horizontal">
              <div>
                <FieldLabel htmlFor="prb-known">Known error</FieldLabel>
                <FieldDescription>The root cause is understood and a workaround exists.</FieldDescription>
              </div>
              <Switch id="prb-known" checked={knownError} onCheckedChange={setKnownError} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
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
