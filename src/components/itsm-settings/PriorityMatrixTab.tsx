"use client"

import * as React from "react"
import { Loader2, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import {
  LEVELS,
  PRIORITY_LABELS,
  priorityFromMatrix,
  type Level,
  type MatrixCell,
  type Priority,
} from "@/lib/itsm"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  DirtyHint,
  PRIORITY_DOT,
  PRIORITY_ORDER,
  PRIORITY_STYLES,
  Section,
  errorMessage,
  type TabProps,
} from "./shared"

/** High first, as people read the grid */
const AXIS: Level[] = [...LEVELS].reverse()

const LEVEL_NAME: Record<Level, string> = { high: "High", medium: "Medium", low: "Low" }
const IMPACT_HINT: Record<Level, string> = {
  high: "Many people or a whole site",
  medium: "A team or department",
  low: "One person",
}
const URGENCY_HINT: Record<Level, string> = {
  high: "Work has stopped",
  medium: "Work is slowed down",
  low: "Can wait",
}

type Grid = Record<string, Priority>
const key = (impact: Level, urgency: Level) => `${impact}/${urgency}`

function toGrid(matrix: MatrixCell[]): Grid {
  const grid: Grid = {}
  for (const i of LEVELS) for (const u of LEVELS) grid[key(i, u)] = priorityFromMatrix(matrix, i, u)
  return grid
}

/** Critical for H/H; high for H/M, M/H; medium for H/L, M/M, L/H; low for the rest. */
const ITIL_DEFAULT = toGrid([])

export function PriorityMatrixTab({ matrix, tenantId, onSaved }: TabProps & { matrix: MatrixCell[] }) {
  const saved = React.useMemo(() => toGrid(matrix), [matrix])
  const [grid, setGrid] = React.useState<Grid>(saved)
  const [saving, setSaving] = React.useState(false)

  const dirty = Object.keys(saved).some((k) => saved[k] !== grid[k])
  const isDefault = Object.keys(ITIL_DEFAULT).every((k) => ITIL_DEFAULT[k] === grid[k])

  const save = async () => {
    setSaving(true)
    try {
      const cells = LEVELS.flatMap((impact) =>
        LEVELS.map((urgency) => ({ impact, urgency, priority: grid[key(impact, urgency)] }))
      )
      await apiFetch("/api/admin/itsm/matrix", {
        method: "PUT",
        body: { cells, ...(tenantId ? { tenant_id: tenantId } : {}) },
      })
      toast.success("Priority matrix saved", {
        description: "It applies to tickets raised or re-classified from now on.",
      })
      await onSaved()
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the priority matrix"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="Priority matrix"
      description="A ticket's priority comes from its impact and urgency. Pick the priority for each combination."
      actions={
        <Button variant="outline" size="sm" onClick={() => setGrid(ITIL_DEFAULT)} disabled={saving || isDefault}>
          <RotateCcw className="h-4 w-4" />
          Reset to ITIL default
        </Button>
      }
      footer={
        <>
          <DirtyHint dirty={dirty} />
          {dirty && (
            <Button variant="outline" onClick={() => setGrid(saved)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save matrix"}
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-2">
          <thead>
            <tr>
              <th className="w-44 text-left align-bottom text-xs font-medium uppercase tracking-wide text-gray-400">
                Impact ↓ / Urgency →
              </th>
              {AXIS.map((u) => (
                <th key={u} className="text-left align-bottom">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{LEVEL_NAME[u]} urgency</p>
                  <p className="text-xs font-normal text-gray-500 dark:text-gray-400">{URGENCY_HINT[u]}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AXIS.map((i) => (
              <tr key={i}>
                <th scope="row" className="text-left align-middle">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{LEVEL_NAME[i]} impact</p>
                  <p className="text-xs font-normal text-gray-500 dark:text-gray-400">{IMPACT_HINT[i]}</p>
                </th>
                {AXIS.map((u) => {
                  const k = key(i, u)
                  const value = grid[k]
                  return (
                    <td key={u}>
                      <Select
                        value={value}
                        onValueChange={(v) => setGrid((g) => ({ ...g, [k]: v as Priority }))}
                        disabled={saving}
                      >
                        <SelectTrigger
                          aria-label={`Priority for ${LEVEL_NAME[i]} impact, ${LEVEL_NAME[u]} urgency`}
                          className={cn(
                            "font-medium ring-1 ring-inset",
                            PRIORITY_STYLES[value],
                            saved[k] !== value && "outline-2 outline-offset-2 outline-dashed outline-amber-400"
                          )}
                        >
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
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Changes apply to tickets raised or re-classified after you save. Existing tickets keep their priority.
      </p>
    </Section>
  )
}
