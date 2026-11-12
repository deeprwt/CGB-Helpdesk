"use client"

import * as React from "react"
import { CalendarPlus, Info, Loader2, Save, X } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import type { WorkCalendar } from "@/lib/itsm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { DirtyHint, Section, errorMessage, type TabProps } from "./shared"

const COMMON_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
]

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function allZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    return intl.supportedValuesOf?.("timeZone") ?? []
  } catch {
    return []
  }
}

/** "09:00:00" → "09:00" */
const hhmm = (t: string) => (t ?? "").slice(0, 5)

function formatHoliday(d: string) {
  const date = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? d
    : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

type Draft = { timezone: string; work_days: number[]; work_start: string; work_end: string; holidays: string[] }

function toDraft(c: WorkCalendar): Draft {
  return {
    timezone: c.timezone,
    work_days: [...c.work_days].sort(),
    work_start: hhmm(c.work_start),
    work_end: hhmm(c.work_end),
    holidays: [...c.holidays].sort(),
  }
}

export function BusinessHoursTab({ calendar, tenantId, onSaved }: TabProps & { calendar: WorkCalendar }) {
  const saved = React.useMemo(() => toDraft(calendar), [calendar])
  const [draft, setDraft] = React.useState<Draft>(saved)
  const [newHoliday, setNewHoliday] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const otherZones = React.useMemo(() => {
    const common = new Set(COMMON_ZONES)
    const list = allZones().filter((z) => !common.has(z))
    if (!common.has(draft.timezone) && !list.includes(draft.timezone)) list.unshift(draft.timezone)
    return list
  }, [draft.timezone])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const error = !draft.work_days.length
    ? "Pick at least one working day"
    : !draft.work_start || !draft.work_end
      ? "Set the start and end of the working day"
      : draft.work_end <= draft.work_start
        ? "The working day must end after it starts"
        : null

  const toggleDay = (d: number) =>
    setDraft((x) => ({
      ...x,
      work_days: x.work_days.includes(d) ? x.work_days.filter((v) => v !== d) : [...x.work_days, d].sort(),
    }))

  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday)) return toast.error("Pick a date")
    if (draft.holidays.includes(newHoliday)) return toast.error("That date is already a holiday")
    setDraft((x) => ({ ...x, holidays: [...x.holidays, newHoliday].sort() }))
    setNewHoliday("")
  }

  const save = async () => {
    if (error) return toast.error(error)
    setSaving(true)
    try {
      await apiFetch("/api/admin/itsm/settings", {
        method: "PUT",
        body: { ...draft, ...(tenantId ? { tenant_id: tenantId } : {}) },
      })
      toast.success("Business hours saved")
      await onSaved()
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the business hours"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="Business hours"
      description="The working calendar for SLA clocks."
      footer={
        <>
          <DirtyHint dirty={dirty} />
          {dirty && (
            <Button variant="outline" onClick={() => setDraft(saved)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving || !dirty || !!error}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save business hours"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          These hours apply only to SLA policies marked &quot;Business hours only&quot;. Other policies run around the
          clock.
        </p>

        <div className="grid gap-5 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="bh-timezone">Time zone</FieldLabel>
            <Select value={draft.timezone} onValueChange={(timezone) => setDraft((x) => ({ ...x, timezone }))}>
              <SelectTrigger id="bh-timezone">
                <SelectValue placeholder="Choose a time zone" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectGroup>
                  <SelectLabel>Common</SelectLabel>
                  {COMMON_ZONES.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {otherZones.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>All time zones</SelectLabel>
                      {otherZones.map((z) => (
                        <SelectItem key={z} value={z}>
                          {z.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="bh-start">Day starts</FieldLabel>
            <Input
              id="bh-start"
              type="time"
              value={draft.work_start}
              onChange={(e) => setDraft((x) => ({ ...x, work_start: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bh-end">Day ends</FieldLabel>
            <Input
              id="bh-end"
              type="time"
              value={draft.work_end}
              onChange={(e) => setDraft((x) => ({ ...x, work_end: e.target.value }))}
              aria-invalid={!!draft.work_end && draft.work_end <= draft.work_start ? true : undefined}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Working days</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((label, d) => {
              const on = draft.work_days.includes(d)
              return (
                <button
                  key={label}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "h-9 w-14 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors",
                    on
                      ? "bg-brand-500 text-white ring-brand-500 hover:bg-brand-600"
                      : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/10"
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="bh-holiday">Holidays</FieldLabel>
          <FieldDescription>Dates in the time zone above. The SLA clock doesn&apos;t run on them.</FieldDescription>
          <div className="flex max-w-sm gap-2">
            <Input
              id="bh-holiday"
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addHoliday()
                }
              }}
            />
            <Button variant="outline" onClick={addHoliday} disabled={!newHoliday} className="h-11">
              <CalendarPlus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {draft.holidays.length === 0 ? (
            <p className="text-sm text-gray-400">No holidays added.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {draft.holidays.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-sm text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10"
                >
                  {formatHoliday(h)}
                  <button
                    type="button"
                    aria-label={`Remove ${h}`}
                    onClick={() => setDraft((x) => ({ ...x, holidays: x.holidays.filter((v) => v !== h) }))}
                    className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Section>
  )
}
