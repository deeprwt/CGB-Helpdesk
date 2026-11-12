"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type DurationUnit = "minutes" | "hours" | "days"
export type Duration = { value: string; unit: DurationUnit }

const FACTOR: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440 }

/** Largest unit that shows the minutes as a whole number. */
export function toDuration(minutes: number): Duration {
  if (minutes > 0 && minutes % 1440 === 0) return { value: String(minutes / 1440), unit: "days" }
  if (minutes > 0 && minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" }
  return { value: String(minutes), unit: "minutes" }
}

/** Whole minutes, or null when the value isn't a positive number. */
export function toMinutes(d: Duration): number | null {
  const n = Number(d.value)
  if (!d.value.trim() || !Number.isFinite(n) || n <= 0) return null
  return Math.round(n * FACTOR[d.unit])
}

export function DurationInput({
  value,
  onChange,
  label,
  invalid,
  disabled,
}: {
  value: Duration
  onChange: (d: Duration) => void
  label: string
  invalid?: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex min-w-[180px] items-center gap-1.5">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value.value}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        aria-label={`${label} amount`}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className="h-9 w-20"
      />
      <Select
        value={value.unit}
        onValueChange={(unit) => onChange({ ...value, unit: unit as DurationUnit })}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="h-9 w-[100px]" aria-label={`${label} unit`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">minutes</SelectItem>
          <SelectItem value="hours">hours</SelectItem>
          <SelectItem value="days">days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
