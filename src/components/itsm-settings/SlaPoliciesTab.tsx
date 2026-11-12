"use client"

import * as React from "react"
import { Layers, Loader2, Plus, Save } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import { PRIORITY_LABELS, TICKET_TYPES, TICKET_TYPE_LABELS, type SlaPolicy } from "@/lib/itsm"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/common/empty-state"
import { toDuration, toMinutes } from "./DurationInput"
import { SlaPolicyRow, policyError, type DraftPolicy } from "./SlaPolicyRow"
import { DirtyHint, PRIORITY_ORDER, Section, errorMessage, type TabProps } from "./shared"

let seq = 0
const nextKey = () => `p${++seq}`

function toDraft(p: SlaPolicy): DraftPolicy {
  return {
    key: nextKey(),
    ticket_type: p.ticket_type,
    priority: p.priority,
    response: toDuration(p.response_minutes),
    resolution: toDuration(p.resolution_minutes),
    business_hours: p.business_hours,
  }
}

/** Defaults in P1..P4 order (filled in when one is missing) and overrides by type, then priority. */
function split(policies: SlaPolicy[]) {
  const defaults = PRIORITY_ORDER.map((priority) =>
    toDraft(
      policies.find((p) => p.ticket_type === null && p.priority === priority) ?? {
        ticket_type: null,
        priority,
        response_minutes: 15,
        resolution_minutes: 360,
        business_hours: false,
      }
    )
  )
  const overrides = policies
    .filter((p) => p.ticket_type !== null)
    .sort(
      (a, b) =>
        TICKET_TYPES.indexOf(a.ticket_type!) - TICKET_TYPES.indexOf(b.ticket_type!) ||
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    )
    .map(toDraft)
  return { defaults, overrides }
}

/** Comparable form of a draft, for the "unsaved changes" hint. */
function signature(rows: DraftPolicy[]) {
  return JSON.stringify(
    rows.map((r) => [r.ticket_type, r.priority, toMinutes(r.response), toMinutes(r.resolution), r.business_hours])
  )
}

const thClass = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"

export function SlaPoliciesTab({ policies, tenantId, onSaved }: TabProps & { policies: SlaPolicy[] }) {
  const initial = React.useMemo(() => split(policies), [policies])
  const [defaults, setDefaults] = React.useState(initial.defaults)
  const [overrides, setOverrides] = React.useState(initial.overrides)
  const [saving, setSaving] = React.useState(false)

  const dirty =
    signature(defaults) !== signature(initial.defaults) || signature(overrides) !== signature(initial.overrides)

  // Overrides that repeat a type + priority
  const duplicateKeys = React.useMemo(() => {
    const seen = new Map<string, string>()
    const dupes = new Set<string>()
    for (const o of overrides) {
      const k = `${o.ticket_type}/${o.priority}`
      if (seen.has(k)) dupes.add(o.key)
      else seen.set(k, o.key)
    }
    return dupes
  }, [overrides])

  const rowError = (p: DraftPolicy) =>
    policyError(p) ??
    (duplicateKeys.has(p.key)
      ? `There is already an override for ${TICKET_TYPE_LABELS[p.ticket_type!]} at ${PRIORITY_LABELS[p.priority]}`
      : null)

  const hasErrors = [...defaults, ...overrides].some((p) => rowError(p) !== null)

  const patchRow =
    (setter: React.Dispatch<React.SetStateAction<DraftPolicy[]>>, key: string) => (patch: Partial<DraftPolicy>) =>
      setter((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addOverride = () => {
    const used = new Set(overrides.map((o) => `${o.ticket_type}/${o.priority}`))
    const type = TICKET_TYPES.find((t) => PRIORITY_ORDER.some((p) => !used.has(`${t}/${p}`))) ?? "incident"
    const priority = PRIORITY_ORDER.find((p) => !used.has(`${type}/${p}`)) ?? "critical"
    const base = defaults.find((d) => d.priority === priority)
    setOverrides((rows) => [
      ...rows,
      {
        key: nextKey(),
        ticket_type: type,
        priority,
        response: base ? { ...base.response } : { value: "1", unit: "hours" },
        resolution: base ? { ...base.resolution } : { value: "8", unit: "hours" },
        business_hours: base?.business_hours ?? false,
      },
    ])
  }

  const save = async () => {
    const bad = [...defaults, ...overrides].find((p) => rowError(p) !== null)
    if (bad) return toast.error(rowError(bad)!)
    setSaving(true)
    try {
      const body = [...defaults, ...overrides].map((p) => ({
        ticket_type: p.ticket_type,
        priority: p.priority,
        response_minutes: toMinutes(p.response)!,
        resolution_minutes: toMinutes(p.resolution)!,
        business_hours: p.business_hours,
      }))
      await apiFetch("/api/admin/itsm/sla", {
        method: "PUT",
        body: { policies: body, ...(tenantId ? { tenant_id: tenantId } : {}) },
      })
      toast.success("SLA policies saved", {
        description: "They apply to tickets raised, re-classified, reopened or resumed from now on.",
      })
      await onSaved()
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the SLA policies"))
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setDefaults(initial.defaults)
    setOverrides(initial.overrides)
  }

  return (
    <Section
      title="SLA policies"
      description="How quickly the IT team must respond to and resolve a ticket, by priority."
      footer={
        <>
          <DirtyHint dirty={dirty} />
          {dirty && (
            <Button variant="outline" onClick={discard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={() => void save()} disabled={saving || !dirty || hasErrors}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save SLA policies"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Default for every record type</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            &quot;Business hours&quot; policies only count time inside the working hours set on the Business hours tab.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50 dark:bg-white/[0.03]">
                <tr>
                  <th className={thClass}>Priority</th>
                  <th className={thClass}>Respond within</th>
                  <th className={thClass}>Resolve within</th>
                  <th className={thClass}>Clock</th>
                </tr>
              </thead>
              <tbody>
                {defaults.map((p) => (
                  <SlaPolicyRow
                    key={p.key}
                    policy={p}
                    onChange={patchRow(setDefaults, p.key)}
                    error={rowError(p)}
                    disabled={saving}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Overrides by record type</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Use different targets for one record type, e.g. slower targets for Changes.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addOverride} disabled={saving}>
              <Plus className="h-4 w-4" />
              Add override
            </Button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
            {overrides.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No overrides"
                description="Every record type uses the defaults above."
                className="py-8"
              />
            ) : (
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 dark:bg-white/[0.03]">
                  <tr>
                    <th className={thClass}>Record type</th>
                    <th className={thClass}>Priority</th>
                    <th className={thClass}>Respond within</th>
                    <th className={thClass}>Resolve within</th>
                    <th className={thClass}>Clock</th>
                    <th className={thClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((p) => (
                    <SlaPolicyRow
                      key={p.key}
                      policy={p}
                      onChange={patchRow(setOverrides, p.key)}
                      onRemove={() => setOverrides((rows) => rows.filter((r) => r.key !== p.key))}
                      error={rowError(p)}
                      disabled={saving}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}
