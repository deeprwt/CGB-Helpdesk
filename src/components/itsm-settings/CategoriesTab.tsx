"use client"

import * as React from "react"
import { FolderTree, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import type { TicketType } from "@/lib/itsm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/common/empty-state"
import { CategoryItem, type CategoryActions } from "./CategoryItem"
import { Section, errorMessage, type CategoryRow, type TabProps } from "./shared"

const byOrder = (a: CategoryRow, b: CategoryRow) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)

/** Inline "name + Add" form */
function AddForm({
  placeholder,
  onAdd,
  onCancel,
  busy,
}: {
  placeholder: string
  onAdd: (name: string) => Promise<boolean>
  onCancel?: () => void
  busy: boolean
}) {
  const [name, setName] = React.useState("")
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const v = name.trim()
        if (!v) return toast.error("Enter a name")
        if (await onAdd(v)) setName("")
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
        placeholder={placeholder}
        maxLength={100}
        autoFocus={!!onCancel}
        disabled={busy}
        className="h-9 max-w-sm"
        aria-label={placeholder}
      />
      <Button type="submit" size="sm" disabled={busy || !name.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </form>
  )
}

export function CategoriesTab({ categories, tenantId, onSaved }: TabProps & { categories: CategoryRow[] }) {
  const [busy, setBusy] = React.useState(false)
  const [addingSubFor, setAddingSubFor] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<CategoryRow | null>(null)

  const top = React.useMemo(() => categories.filter((c) => !c.parent_id).sort(byOrder), [categories])
  const children = React.useMemo(() => {
    const map = new Map<string, CategoryRow[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      map.set(c.parent_id, [...(map.get(c.parent_id) ?? []), c])
    }
    for (const list of map.values()) list.sort(byOrder)
    return map
  }, [categories])

  /** Runs a change, reports errors, reloads. Returns whether it worked. */
  const run = async (fn: () => Promise<unknown>, success: string | null, failure: string) => {
    setBusy(true)
    try {
      await fn()
      if (success) toast.success(success)
      await onSaved()
      return true
    } catch (err) {
      toast.error(errorMessage(err, failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  const patch = (c: CategoryRow, body: Record<string, unknown>) =>
    apiFetch(`/api/admin/itsm/categories/${c.id}`, { method: "PATCH", body })

  const add = (name: string, parentId?: string) =>
    run(
      () =>
        apiFetch("/api/admin/itsm/categories", {
          method: "POST",
          body: { name, ...(parentId ? { parent_id: parentId } : {}), ...(tenantId ? { tenant_id: tenantId } : {}) },
        }),
      `${name} added`,
      "Could not add the category"
    )

  const actions: CategoryActions = {
    rename: (c, name) => run(() => patch(c, { name }), "Category renamed", "Could not rename the category"),
    toggle: (c, active) =>
      void run(
        () => patch(c, { is_active: active }),
        active ? `${c.name} activated` : `${c.name} deactivated`,
        "Could not change the category"
      ),
    remove: (c) => setDeleteTarget(c),
    setTypes: (c, types: TicketType[] | null) =>
      void run(() => patch(c, { ticket_types: types }), null, "Could not change the record types"),
    move: (c, dir) => {
      const siblings = c.parent_id ? (children.get(c.parent_id) ?? []) : top
      const i = siblings.findIndex((s) => s.id === c.id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= siblings.length) return
      const order = [...siblings]
      ;[order[i], order[j]] = [order[j], order[i]]
      // Renumber so equal sort_orders can't block the move; usually only the two swapped rows change
      const changes = order
        .map((s, idx) => ({ s, sort_order: idx + 1 }))
        .filter(({ s, sort_order }) => s.sort_order !== sort_order)
      void run(
        () => Promise.all(changes.map(({ s, sort_order }) => patch(s, { sort_order }))),
        null,
        "Could not reorder the categories"
      )
    },
  }

  const confirmDelete = async () => {
    const c = deleteTarget
    if (!c) return
    const ok = await run(
      () => apiFetch(`/api/admin/itsm/categories/${c.id}`, { method: "DELETE" }),
      `${c.name} deleted`,
      "Could not delete the category"
    )
    if (ok) setDeleteTarget(null)
  }

  const deleteSubs = deleteTarget && !deleteTarget.parent_id ? (children.get(deleteTarget.id)?.length ?? 0) : 0

  return (
    <Section
      title="Categories"
      description="What people pick when they raise a ticket. Two levels: category and sub-category. Inactive ones stay on existing tickets but aren't offered on new ones."
    >
      <div className="flex flex-col gap-4">
        <AddForm placeholder="New category name" onAdd={(name) => add(name)} busy={busy} />

        {top.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description="Add the categories people choose from, e.g. Hardware, Software, Network."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {top.map((c, i) => {
              const subs = children.get(c.id) ?? []
              return (
                <li key={c.id} className="flex flex-col gap-1">
                  <CategoryItem
                    category={c}
                    first={i === 0}
                    last={i === top.length - 1}
                    busy={busy}
                    actions={actions}
                  />
                  {subs.map((s, si) => (
                    <CategoryItem
                      key={s.id}
                      category={s}
                      sub
                      first={si === 0}
                      last={si === subs.length - 1}
                      busy={busy}
                      actions={actions}
                    />
                  ))}
                  <div className="ml-6 pt-1 sm:ml-8">
                    {addingSubFor === c.id ? (
                      <AddForm
                        placeholder={`New sub-category of ${c.name}`}
                        onAdd={async (name) => {
                          const ok = await add(name, c.id)
                          if (ok) setAddingSubFor(null)
                          return ok
                        }}
                        onCancel={() => setAddingSubFor(null)}
                        busy={busy}
                      />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddingSubFor(c.id)}
                        disabled={busy}
                        className="text-brand-600 hover:text-brand-700 dark:text-brand-300"
                      >
                        <Plus className="h-4 w-4" />
                        Add sub-category
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null)
        }}
        title={`Delete ${deleteTarget?.name ?? "category"}?`}
        description={
          `It will no longer be offered on new tickets.` +
          (deleteSubs > 0 ? ` Its ${deleteSubs} sub-categor${deleteSubs === 1 ? "y is" : "ies are"} deleted too.` : "") +
          " Tickets already filed under it keep the category name they were raised with. To hide it but keep it in the list, deactivate it instead."
        }
        confirmLabel="Delete"
        variant="danger"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </Section>
  )
}
