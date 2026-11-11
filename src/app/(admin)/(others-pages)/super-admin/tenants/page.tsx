"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import RoleGate from "@/components/auth/RoleGate"
import { apiFetch } from "@/lib/api-client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { PageHeader } from "@/components/common/page-header"
import { StatCard, StatCardSkeleton } from "@/components/common/stat-card"
import { StatusBadge } from "@/components/common/status-badge"
import {
  Building,
  CircleOff,
  Loader2,
  Pencil,
  Plus,
  Power,
  Ticket,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type TenantRow = {
  id: string
  name: string
  slug: string
  status: "active" | "suspended"
  created_at: string
  members: number
  admins: number
  engineers: number
  tickets: number
  open_tickets: number
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/

/** "CGB Solutions" → "cgb-solutions" */
function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}

const EMPTY_FORM = { name: "", slug: "", adminName: "", adminEmail: "" }

export default function TenantsPage() {
  const { user: me } = useCurrentUser()

  const [tenants, setTenants] = React.useState<TenantRow[]>([])
  const [loading, setLoading] = React.useState(true)

  // Create
  const [createOpen, setCreateOpen] = React.useState(false)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  // Rename
  const [renameTarget, setRenameTarget] = React.useState<TenantRow | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [renaming, setRenaming] = React.useState(false)

  // Suspend / reactivate
  const [statusTarget, setStatusTarget] = React.useState<TenantRow | null>(null)
  const [savingStatus, setSavingStatus] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const { tenants } = await apiFetch<{ tenants: TenantRow[] }>("/api/admin/tenants")
      setTenants(tenants)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load tenants")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  /* ── Create ─────────────────────────── */

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setSlugTouched(false)
    setCreateOpen(true)
  }

  const createTenant = async () => {
    const name = form.name.trim()
    const slug = form.slug.trim().toLowerCase()
    const adminName = form.adminName.trim()
    const adminEmail = form.adminEmail.trim().toLowerCase()

    if (!name) return toast.error("Enter the tenant's name")
    if (!SLUG_RE.test(slug)) {
      return toast.error("The short name may use lowercase letters, numbers and dashes (2–63 characters)")
    }
    if (!adminName || !adminEmail) return toast.error("Enter the first admin's name and email")

    setCreating(true)
    try {
      const res = await apiFetch<{ tenant: { name: string }; emailed: boolean; emailError?: string }>(
        "/api/admin/tenants",
        { method: "POST", body: { name, slug, admin_name: adminName, admin_email: adminEmail } }
      )
      if (res.emailed) {
        toast.success(`${res.tenant.name} created`, {
          description: `An invitation was sent to ${adminEmail}.`,
        })
      } else {
        toast.warning(`${res.tenant.name} created, but the invitation email failed`, {
          description: `${res.emailError ?? "Email failed"}. Resend it from Users & Roles.`,
          duration: 10000,
        })
      }
      setCreateOpen(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the tenant")
    } finally {
      setCreating(false)
    }
  }

  /* ── Rename ─────────────────────────── */

  const saveRename = async () => {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return toast.error("Enter a name")
    if (name === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    setRenaming(true)
    try {
      await apiFetch(`/api/admin/tenants/${renameTarget.id}`, { method: "PATCH", body: { name } })
      setTenants((prev) => prev.map((t) => (t.id === renameTarget.id ? { ...t, name } : t)))
      toast.success("Tenant renamed")
      setRenameTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename the tenant")
    } finally {
      setRenaming(false)
    }
  }

  /* ── Suspend / reactivate ───────────── */

  const saveStatus = async () => {
    if (!statusTarget) return
    const next = statusTarget.status === "active" ? "suspended" : "active"
    setSavingStatus(true)
    try {
      await apiFetch(`/api/admin/tenants/${statusTarget.id}`, { method: "PATCH", body: { status: next } })
      setTenants((prev) => prev.map((t) => (t.id === statusTarget.id ? { ...t, status: next } : t)))
      toast.success(next === "active" ? `${statusTarget.name} reactivated` : `${statusTarget.name} suspended`)
      setStatusTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the status")
    } finally {
      setSavingStatus(false)
    }
  }

  /* ── Derived ────────────────────────── */

  const activeCount = tenants.filter((t) => t.status === "active").length
  const stats = [
    { label: "Tenants", value: tenants.length, icon: Building, tone: "indigo" as const },
    { label: "Active", value: activeCount, icon: Power, tone: "emerald" as const },
    { label: "Suspended", value: tenants.length - activeCount, icon: CircleOff, tone: "rose" as const },
    { label: "People", value: tenants.reduce((s, t) => s + t.members, 0), icon: Users, tone: "violet" as const },
    { label: "Open Tickets", value: tenants.reduce((s, t) => s + t.open_tickets, 0), icon: Ticket, tone: "amber" as const },
  ]

  const columns: ColumnDef<TenantRow>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tenant" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
            <Building className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900 dark:text-white">
              {row.original.name}
              {me?.tenant_id === row.original.id && (
                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(yours)</span>
              )}
            </p>
            <p className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">{row.original.slug}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const active = row.original.status === "active"
        return (
          <StatusBadge tone={active ? "green" : "red"} dot className="capitalize">
            {row.original.status}
          </StatusBadge>
        )
      },
    },
    {
      accessorKey: "members",
      header: ({ column }) => <DataTableColumnHeader column={column} title="People" />,
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <span className="font-medium tabular-nums text-gray-900 dark:text-white">{row.original.members}</span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            {row.original.admins} admin{row.original.admins === 1 ? "" : "s"} · {row.original.engineers} engineer
            {row.original.engineers === 1 ? "" : "s"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "open_tickets",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tickets" />,
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <span className="font-medium tabular-nums text-gray-900 dark:text-white">{row.original.open_tickets}</span>
          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">open of {row.original.tickets}</span>
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
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
        const t = row.original
        const active = t.status === "active"
        return (
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${t.name}`}
                  onClick={() => {
                    setRenameTarget(t)
                    setRenameValue(t.name)
                  }}
                  className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rename</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={active ? `Suspend ${t.name}` : `Reactivate ${t.name}`}
                  onClick={() => setStatusTarget(t)}
                  className={cn(
                    active
                      ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10"
                      : "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                  )}
                >
                  <Power className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{active ? "Suspend" : "Reactivate"}</TooltipContent>
            </Tooltip>
          </div>
        )
      },
    },
  ]

  const suspending = statusTarget?.status === "active"
  const ownTenant = !!statusTarget && statusTarget.id === me?.tenant_id

  return (
    <RoleGate allowedRoles={["superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Tenants"
          description="Each tenant is a separate customer of the helpdesk with its own people, tickets and assets."
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Tenants" }]}
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New tenant
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
            : stats.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
              ))}
        </div>

        <DataTable
          columns={columns}
          data={tenants}
          loading={loading}
          title="All tenants"
          description="Suspending a tenant locks its people out until it is reactivated. Nothing is deleted."
          searchable
          searchPlaceholder="Search tenants…"
          entityName="tenants"
          getRowId={(t) => t.id}
          emptyIcon={Building}
          emptyTitle="No tenants yet"
          emptyDescription="Create one to get started."
          emptyAction={
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New tenant
            </Button>
          }
        />

        {/* Create */}
        <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New tenant</DialogTitle>
              <DialogDescription>
                Creates the tenant and invites its first admin, who can then invite their own engineers and users.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void createTenant()
              }}
              className="flex flex-col gap-6"
            >
              <FieldSet>
                <FieldLegend>Tenant</FieldLegend>
                <FieldGroup className="sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="tenant-name" required>
                      Name
                    </FieldLabel>
                    <Input
                      id="tenant-name"
                      value={form.name}
                      onChange={(e) => {
                        const name = e.target.value
                        setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))
                      }}
                      placeholder="e.g. Acme Corp"
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tenant-slug" required>
                      Short name
                    </FieldLabel>
                    <Input
                      id="tenant-slug"
                      value={form.slug}
                      onChange={(e) => {
                        setSlugTouched(true)
                        setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))
                      }}
                      placeholder="e.g. acme"
                      className="font-mono"
                    />
                    <FieldDescription>Lowercase letters, numbers and dashes. Can&apos;t be changed later.</FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldSet>

              <Separator />

              <FieldSet>
                <FieldLegend>First admin</FieldLegend>
                <FieldGroup className="sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="tenant-admin-name" required>
                      Full name
                    </FieldLabel>
                    <Input
                      id="tenant-admin-name"
                      value={form.adminName}
                      onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                      placeholder="e.g. Priya Sharma"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tenant-admin-email" required>
                      Email
                    </FieldLabel>
                    <Input
                      id="tenant-admin-email"
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                      placeholder="name@company.com"
                    />
                  </Field>
                </FieldGroup>
                <FieldDescription>
                  They get an email with a link to set their password. The address can&apos;t already belong to
                  another tenant.
                </FieldDescription>
              </FieldSet>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? "Creating…" : "Create and invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Rename */}
        <Dialog open={!!renameTarget} onOpenChange={(open) => !open && !renaming && setRenameTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename tenant</DialogTitle>
              <DialogDescription>The short name ({renameTarget?.slug}) stays the same.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void saveRename()
              }}
              className="flex flex-col gap-6"
            >
              <Field>
                <FieldLabel htmlFor="tenant-rename" required>
                  Name
                </FieldLabel>
                <Input
                  id="tenant-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>
                  Cancel
                </Button>
                <Button type="submit" disabled={renaming}>
                  {renaming && <Loader2 className="h-4 w-4 animate-spin" />}
                  {renaming ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Suspend / reactivate */}
        <ConfirmDialog
          open={!!statusTarget}
          onOpenChange={(open) => {
            if (!open && !savingStatus) setStatusTarget(null)
          }}
          title={suspending ? `Suspend ${statusTarget?.name ?? "tenant"}?` : `Reactivate ${statusTarget?.name ?? "tenant"}?`}
          description={
            suspending
              ? `Everyone in ${statusTarget?.name} will be signed out and locked out until you reactivate it. Their data is kept.` +
                (ownTenant ? " This is your own tenant: super admins keep access, but everyone else in it is locked out." : "")
              : `People in ${statusTarget?.name} will be able to sign in and use the helpdesk again.`
          }
          confirmLabel={suspending ? "Suspend" : "Reactivate"}
          variant={suspending ? "warning" : "info"}
          loading={savingStatus}
          onConfirm={() => void saveStatus()}
        />
      </div>
    </RoleGate>
  )
}
