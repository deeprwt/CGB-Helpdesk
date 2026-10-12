"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import RoleGate from "@/components/auth/RoleGate"
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
} from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { PageHeader } from "@/components/common/page-header"
import { StatCard, StatCardSkeleton } from "@/components/common/stat-card"
import { StatusBadge } from "@/components/common/status-badge"
import {
  Plus,
  Trash2,
  Power,
  Building2,
  Globe,
  Users,
  CircleOff,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Org = {
  id: string
  name: string
  domain: string
  status: string
  created_at: string
  user_count?: number
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = React.useState<Org[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [newDomain, setNewDomain] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  // Org awaiting delete confirmation (replaces window.confirm)
  const [deleteTarget, setDeleteTarget] = React.useState<Org | null>(null)

  const load = React.useCallback(async () => {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false })

    if (!orgData) {
      setOrgs([])
      setLoading(false)
      return
    }

    // Get user counts per org
    const orgsWithCounts = await Promise.all(
      orgData.map(async (org) => {
        const { count } = await supabase
          .from("user_organization_access")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)

        return { ...org, user_count: count ?? 0 }
      })
    )

    setOrgs(orgsWithCounts)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const addOrg = async () => {
    if (!newName.trim() || !newDomain.trim()) {
      toast.error("Name and domain are required")
      return
    }

    setSaving(true)

    const { error } = await supabase.from("organizations").insert({
      name: newName.trim(),
      domain: newDomain.trim().toLowerCase(),
      status: "active",
    })

    setSaving(false)

    if (error) {
      if (error.code === "23505") {
        toast.error("This domain already exists")
      } else {
        toast.error(error.message)
      }
      return
    }

    toast.success("Organization added")
    setNewName("")
    setNewDomain("")
    setDialogOpen(false)
    load()
  }

  const toggleStatus = async (org: Org) => {
    const next = org.status === "active" ? "inactive" : "active"

    await supabase
      .from("organizations")
      .update({ status: next })
      .eq("id", org.id)

    toast.success(
      next === "active"
        ? `${org.name} activated`
        : `${org.name} deactivated`
    )
    load()
  }

  // Runs after the user confirms in the ConfirmDialog
  const deleteOrg = async (org: Org) => {
    await supabase.from("organizations").delete().eq("id", org.id)
    toast.success("Organization deleted")
    load()
  }

  /* ── Derived stats ─────────────────── */
  const activeCount = orgs.filter((o) => o.status === "active").length
  const totalUsers = orgs.reduce((s, o) => s + (o.user_count ?? 0), 0)

  const stats = [
    { label: "Total Orgs", value: orgs.length, icon: Building2, tone: "indigo" as const },
    { label: "Active", value: activeCount, icon: Globe, tone: "emerald" as const },
    { label: "Inactive", value: orgs.length - activeCount, icon: CircleOff, tone: "rose" as const },
    { label: "Total Users", value: totalUsers, icon: Users, tone: "violet" as const },
  ]

  /* ── Table columns ─────────────────── */
  const columns: ColumnDef<Org>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Organization" />,
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
      cell: ({ row }) => <StatusBadge tone="blue">@{row.original.domain}</StatusBadge>,
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
      id: "users",
      accessorFn: (o) => o.user_count ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Users" />,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
          {row.original.user_count ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400">
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
        const org = row.original
        const active = org.status === "active"
        return (
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={active ? "Deactivate" : "Activate"}
                  onClick={() => toggleStatus(org)}
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
                  aria-label="Delete organization"
                  onClick={() => setDeleteTarget(org)}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete organization</TooltipContent>
            </Tooltip>
          </div>
        )
      },
    },
  ]

  return (
    <RoleGate allowedRoles={["superadmin"]}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <PageHeader
          title="Organization Management"
          description="Manage whitelisted domains and organizations"
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Organization
            </Button>
          }
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            : stats.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
              ))}
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={orgs}
          loading={loading}
          title="Organizations"
          description="Only users whose email matches an active domain can register"
          searchable
          searchPlaceholder="Search by name or domain…"
          entityName="organizations"
          getRowId={(o) => o.id}
          emptyIcon={Building2}
          emptyTitle="No organizations yet"
          emptyDescription="Add one to get started."
          emptyAction={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Organization
            </Button>
          }
        />

        {/* Add Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Organization</DialogTitle>
              <DialogDescription>
                Whitelist a new email domain for registration.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                addOrg()
              }}
              className="flex flex-col gap-6"
            >
              <FieldGroup className="sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="org-name" required>
                    Organization Name
                  </FieldLabel>
                  <Input
                    id="org-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. CGB India"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="org-domain" required>
                    Domain
                  </FieldLabel>
                  <Input
                    id="org-domain"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="e.g. cgbindia.com"
                  />
                  <FieldDescription>
                    Only users with emails from this domain can register
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Adding…" : "Add Organization"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title="Delete organization?"
          description={
            deleteTarget
              ? `Delete "${deleteTarget.name}" (${deleteTarget.domain})? This will remove all access mappings for this organization.`
              : ""
          }
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            if (deleteTarget) deleteOrg(deleteTarget)
          }}
        />
      </div>
    </RoleGate>
  )
}
