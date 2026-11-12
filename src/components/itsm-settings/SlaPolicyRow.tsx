"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import {
  PRIORITY_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  formatMinutes,
  type Priority,
  type TicketType,
} from "@/lib/itsm"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { DurationInput, toMinutes, type Duration } from "./DurationInput"
import { PRIORITY_DOT, PRIORITY_ORDER, PRIORITY_STYLES } from "./shared"

export type DraftPolicy = {
  key: string
  ticket_type: TicketType | null
  priority: Priority
  response: Duration
  resolution: Duration
  business_hours: boolean
}

const MAX_MINUTES = 525600

/** The problem with a row, or null. */
export function policyError(p: DraftPolicy): string | null {
  const response = toMinutes(p.response)
  const resolution = toMinutes(p.resolution)
  if (response === null) return "Enter a response time"
  if (resolution === null) return "Enter a resolution time"
  if (response > MAX_MINUTES || resolution > MAX_MINUTES) return "Times can be at most 1 year"
  if (resolution < response) return "Resolution can't be shorter than response"
  return null
}

function Preview({ d }: { d: Duration }) {
  const m = toMinutes(d)
  return (
    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{m === null ? "—" : formatMinutes(m)}</span>
  )
}

export function SlaPolicyRow({
  policy,
  onChange,
  onRemove,
  error,
  disabled,
}: {
  policy: DraftPolicy
  onChange: (patch: Partial<DraftPolicy>) => void
  /** Only for override rows; defaults can't be removed. */
  onRemove?: () => void
  error: string | null
  disabled?: boolean
}) {
  const isOverride = !!onRemove
  const cell = "px-3 py-3 align-top"

  return (
    <>
      <tr className="border-t border-gray-100 dark:border-white/5">
        {isOverride && (
          <td className={cell}>
            <Select
              value={policy.ticket_type ?? undefined}
              onValueChange={(v) => onChange({ ticket_type: v as TicketType })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-9 w-[160px]" aria-label="Record type">
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
          </td>
        )}
        <td className={cell}>
          {isOverride ? (
            <Select
              value={policy.priority}
              onValueChange={(v) => onChange({ priority: v as Priority })}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="h-9 w-[150px]" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[p])} />
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className={cn(
                "inline-flex h-9 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
                PRIORITY_STYLES[policy.priority]
              )}
            >
              {PRIORITY_LABELS[policy.priority]}
            </span>
          )}
        </td>
        <td className={cell}>
          <DurationInput
            label="Response time"
            value={policy.response}
            onChange={(response) => onChange({ response })}
            invalid={toMinutes(policy.response) === null}
            disabled={disabled}
          />
          <Preview d={policy.response} />
        </td>
        <td className={cell}>
          <DurationInput
            label="Resolution time"
            value={policy.resolution}
            onChange={(resolution) => onChange({ resolution })}
            invalid={!!error && error !== "Enter a response time"}
            disabled={disabled}
          />
          <Preview d={policy.resolution} />
        </td>
        <td className={cell}>
          <div className="flex h-9 items-center gap-2">
            <Switch
              checked={policy.business_hours}
              onCheckedChange={(v) => onChange({ business_hours: v })}
              aria-label="Business hours only"
              disabled={disabled}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {policy.business_hours ? "Business hours" : "24 × 7"}
            </span>
          </div>
        </td>
        {isOverride && (
          <td className={cn(cell, "text-right")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove override"
              onClick={onRemove}
              disabled={disabled}
              className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </td>
        )}
      </tr>
      {error && (
        <tr>
          <td colSpan={isOverride ? 6 : 4} className="px-3 pb-3 text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
