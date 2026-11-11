"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import { apiFetch } from "@/lib/api-client"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import RoleGate from "@/components/auth/RoleGate"
import { useCurrentUser, useTenantList } from "@/hooks/useCurrentUser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { PageHeader } from "@/components/common/page-header"
import { StatCard, StatCardSkeleton } from "@/components/common/stat-card"
import { StatusBadge } from "@/components/common/status-badge"
import { Building2, CircleOff, Globe, Loader2, Pencil, Plus, Power, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Company = {
  id: string
  name: string
  domain: string | null
  status: string
  tenant_id: string
  created_at: string
  people: number
}

type FormState = { id?: string; name: string; domain: string }

export default function CompaniesPage() {
  const { user: me } = useCurrentUser()
  const isSuper = me?.role === "superadmin"
  const tenants = useTenantList(isSuper)

  // Super admins pick which tenant's companies to manage; admins only see their own
  const [tenantId, setTenantId] = React.useState<string>("")
  React.useEffect(() => {
    if (me?.tenant_id && !tenantId) setTenantId(me.tenant_id)
  }, [me?.tenant_id, tenantId])

  const [companies, setCompanies] = React.useState<Company[]>([])
  const [loading, setLoading] = React.useState(true)

  const [form, setForm] = React.useState<FormState | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<Company | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!me) return
    setLoading(true)

    // The database already limits these to the viewer's tenant (super admins see all)
    let query = supabase
      .from("organizations")
      .select("id, name, domain, status, tenant_id, created_at")
      .order("name")
    if (isSuper && tenantId) query = query.eq("tenant_id", tenantId)

    const [{ data, error }, { data: people }] = await Promise.all([
      query,
      fetchAllRows<{ organization_id: string | null }>((from, to) => {
        let q = supabase.from("users").select("id, organization_id").not("organization_id", "is", null)
        if (isSuper && tenantId) q = q.eq("tenant_id", tenantId)
        return q.order("id").range(from, to)
      }),
    ])

    if (error) toast.error(error.message)

    const counts = new Map<string, number>()
    for (const p of people ?? []) {
      if (p.organization_id) counts.set(p.organization_id, (counts.get(p.organization_id) ?? 0) + 1)
    }

    setCompanies(
      ((data ?? []) as Omit<Company, "people">[]).map((c) => ({ ...c, people: counts.get(c.id) ?? 0 }))
    )
    setLoading(false)
  }, [me, isSuper, tenantId])

  React.useEffect(() => {
    load()
  }, [load])

  /* ── Actions ─────────────────────────── */

  const save = async () => {
    if (!form) return
    const name = form.name.trim()
    const domain = form.domain.trim().toLowerCase().replace(/^@/, "")
    if (!name) return toast.error("Enter the company name")

    setSaving(true)
    try {
      if (form.id) {
        await apiFetch(`/api/companies/${form.id}`, { method: "PATCH", body: { name, domain: domain || null } })
        toast.success("Company updated")
      } else {
        await apiFetch("/api/companies", {
          method: "POST",
          body: { name, domain: domain || null, ...(isSuper && tenantId ? { tenant_id: tenantId } : {}) },
        })
        toast.success(`${name} added`)
      }
      setForm(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the company")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (c: Company) => {
    const next = c.status === "active" ? "inactive" : "active"
    try {
      await apiFetch(`/api/companies/${c.id}`, { method: "PATCH", body: { status: next } })
      setCompanies((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)))
      toast.success(next === "active" ? `${c.name} activated` : `${c.name} deactivated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the status")
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/companies/${deleteTarget.id}`, { method: "DELETE" })
      setCompanies((prev) => prev.filter((x) => x.id !== deleteTarget.id))
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the company")
    } finally {
      setDeleting(false)
    }
  }

  /* ── Derived ─────────────────────────── */

  const activeCount = companies.filter((c) => c.status === "active").length
  const stats = [
    { label: "Companies", value: companies.length, icon: Building2, tone: "indigo" as const },
    { label: "Active", value: activeCount, icon: Globe, tone: "emerald" as const },
    { label: "Inactive", value: companies.length - activeCount, icon: CircleOff, tone: "rose" as const },
    { label: "People linked", value: companies.reduce((s, c) => s + c.people, 0), icon: Users, tone: "violet" as const },
  ]

  const tenantName = isSuper ? tenants.find((t) => t.id === tenantId)?.name : me?.tenant?.name

  const columns: ColumnDef<Company>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Company" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="font-semibold text-gray-900 dark:text-white">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "domain",
      header: "Domain",
      cell: ({ row }) =>
        row.original.domain ? (
          <span className="text-gray-600 dark:text-gray-300">{row.original.domain}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge tone={row.original.status === "active" ? "green" : "gray"} dot className="capitalize">
          {row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "people",
      header: ({ column }) => <DataTableColumnHeader column={column} title="People" />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">{row.original.people}</span>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Added" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">
          {new Date(row.original.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "text-right", headerClassName: "text-right" },
      cell: ({ row }) => {
        const c = row.original
        const active = c.status === "active"
        return (
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => setForm({ id: c.id, name: c.name, domain: c.domain ?? "" })}
                  className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={active ? `Deactivate ${c.name}` : `Activate ${c.name}`}
                  onClick={() => void toggleStatus(c)}
                  className={cn(
                    active
                      ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10"
                      : "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                  )}
                >
                  <Power className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{active ? "Deactivate" : "Activate"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => setDeleteTarget(c)}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        )
      },
    },
  ]

  const tenantPicker =
    isSuper && tenants.length > 0 ? (
      <Select value={tenantId} onValueChange={setTenantId}>
        <SelectTrigger className="w-[220px]" aria-label="Tenant">
          <SelectValue placeholder="Choose a tenant" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
              {t.status !== "active" ? " (suspended)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  return (
    <RoleGate allowedRoles={["admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Companies"
          description="Client companies you support. Use them to group people and assets — they don't limit who can see what."
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Companies" }]}
          actions={
            <>
              {tenantPicker}
              <Button onClick={() => setForm({ name: "", domain: "" })} disabled={isSuper && !tenantId}>
                <Plus className="h-4 w-4" />
                Add company
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            : stats.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
              ))}
        </div>

        <DataTable
          columns={columns}
          data={companies}
          loading={loading}
          title={tenantName ? `Companies in ${tenantName}` : "Companies"}
          description="Set a person's company from their profile or when you invite them."
          searchable
          searchPlaceholder="Search companies…"
          entityName="companies"
          getRowId={(c) => c.id}
          emptyIcon={Building2}
          emptyTitle="No companies yet"
          emptyDescription="Add the client companies you support."
          emptyAction={
            <Button variant="outline" size="sm" onClick={() => setForm({ name: "", domain: "" })}>
              <Plus className="h-4 w-4" />
              Add company
            </Button>
          }
        />

        {/* Add / edit */}
        <Dialog open={!!form} onOpenChange={(open) => !open && !saving && setForm(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{form?.id ? "Edit company" : "Add company"}</DialogTitle>
              <DialogDescription>
                {form?.id
                  ? "Change the company's name or domain."
                  : `Add a client company${tenantName ? ` to ${tenantName}` : ""}.`}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
              className="flex flex-col gap-6"
            >
              <FieldGroup className="sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="company-name" required>
                    Name
                  </FieldLabel>
                  <Input
                    id="company-name"
                    value={form?.name ?? ""}
                    onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                    placeholder="e.g. Acme India"
                    autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company-domain">Domain</FieldLabel>
                  <Input
                    id="company-domain"
                    value={form?.domain ?? ""}
                    onChange={(e) => setForm((f) => (f ? { ...f, domain: e.target.value } : f))}
                    placeholder="e.g. acme.in"
                  />
                  <FieldDescription>Optional, for reference only.</FieldDescription>
                </Field>
              </FieldGroup>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Saving…" : form?.id ? "Save" : "Add company"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteTarget(null)
          }}
          title="Delete company?"
          description={
            deleteTarget
              ? `Delete "${deleteTarget.name}"? ${
                  deleteTarget.people > 0
                    ? `${deleteTarget.people} ${deleteTarget.people === 1 ? "person stays" : "people stay"} in the helpdesk but will no longer be linked to a company.`
                    : "People and assets are not deleted."
                }`
              : ""
          }
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          onConfirm={() => void remove()}
        />
      </div>
    </RoleGate>
  )
}
