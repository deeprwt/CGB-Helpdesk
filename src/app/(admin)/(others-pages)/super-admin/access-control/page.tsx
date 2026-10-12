"use client"

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import RoleGate from "@/components/auth/RoleGate"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { PageHeader } from "@/components/common/page-header"
import { StatCard, StatCardSkeleton } from "@/components/common/stat-card"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import {
  Plus,
  X,
  Shield,
  ShieldCheck,
  User,
  Users,
  Wrench,
  Building2,
  UserCog,
  KeyRound,
} from "lucide-react"
import { toast } from "sonner"

/* ── Types ────────────────────────────── */
type Org = { id: string; name: string; domain: string }

type UserRow = {
  id: string
  email: string
  full_name: string
  role: string
  avatar_url: string | null
  orgs: Org[]
}

type RevokeTarget = { userId: string; orgId: string; orgName: string }

const ROLE_ICON: Record<string, React.ReactNode> = {
  superadmin: <ShieldCheck className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  engineer: <User className="h-3 w-3" />,
  user: <User className="h-3 w-3" />,
}

const ROLE_TONE: Record<string, BadgeTone> = {
  superadmin: "violet",
  admin: "blue",
  engineer: "green",
  user: "gray",
}

function initials(name?: string | null) {
  return name?.[0]?.toUpperCase() ?? "?"
}

function RoleBadge({ role }: { role: string }) {
  return (
    <StatusBadge tone={ROLE_TONE[role] ?? ROLE_TONE.user} className="capitalize">
      {ROLE_ICON[role]}
      {role.replace("_", " ")}
    </StatusBadge>
  )
}

function UserCell({ u }: { u: UserRow }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9">
        <AvatarImage src={u.avatar_url ?? undefined} />
        <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
          {initials(u.full_name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate font-semibold text-gray-900 dark:text-white">
        {u.full_name || "—"}
      </span>
    </div>
  )
}

export default function AccessControlPage() {
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [allOrgs, setAllOrgs] = React.useState<Org[]>([])
  const [loading, setLoading] = React.useState(true)

  // Grant dialog state
  const [grantOpen, setGrantOpen] = React.useState(false)
  const [selectedUserId, setSelectedUserId] = React.useState("")
  const [selectedOrgId, setSelectedOrgId] = React.useState("")

  // Role change dialog state
  const [roleOpen, setRoleOpen] = React.useState(false)
  const [roleTarget, setRoleTarget] = React.useState<UserRow | null>(null)
  const [newRole, setNewRole] = React.useState("")

  // Revoke confirmation (replaces window.confirm)
  const [revokeTarget, setRevokeTarget] = React.useState<RevokeTarget | null>(null)

  /* ── Load data ──────────────────────── */
  const load = React.useCallback(async () => {
    const [{ data: usersData }, { data: orgsData }] = await Promise.all([
      supabase
        .from("users")
        .select("id, email, full_name, role, avatar_url")
        .order("full_name"),
      supabase
        .from("organizations")
        .select("id, name, domain")
        .eq("status", "active")
        .order("name"),
    ])

    setAllOrgs(orgsData ?? [])

    if (!usersData) {
      setUsers([])
      setLoading(false)
      return
    }

    // Fetch org access for all users in parallel
    const enriched: UserRow[] = await Promise.all(
      usersData.map(async (u) => {
        const { data: accessData } = await supabase
          .from("user_organization_access")
          .select("organization:organization_id (id, name, domain)")
          .eq("user_id", u.id)

        const orgs = (accessData ?? [])
          .map((a: any) =>
            Array.isArray(a.organization) ? a.organization[0] : a.organization
          )
          .filter(Boolean) as Org[]

        return { ...u, orgs }
      })
    )

    setUsers(enriched)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  /* ── Grant org access ───────────────── */
  const grantAccess = async () => {
    if (!selectedUserId || !selectedOrgId) {
      toast.error("Select a user and organization")
      return
    }

    const { error } = await supabase.from("user_organization_access").insert({
      user_id: selectedUserId,
      organization_id: selectedOrgId,
    })

    if (error) {
      if (error.code === "23505") {
        toast.error("Access already exists")
      } else {
        toast.error(error.message)
      }
      return
    }

    toast.success("Access granted")
    setGrantOpen(false)
    setSelectedUserId("")
    setSelectedOrgId("")
    load()
  }

  /* ── Revoke org access (after ConfirmDialog) ── */
  const revokeAccess = async (userId: string, orgId: string) => {
    await supabase
      .from("user_organization_access")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", orgId)

    toast.success("Access revoked")
    load()
  }

  /* ── Change user role ───────────────── */
  const changeRole = async () => {
    if (!roleTarget || !newRole) return

    await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", roleTarget.id)

    toast.success(`${roleTarget.full_name} role changed to ${newRole}`)
    setRoleOpen(false)
    setRoleTarget(null)
    setNewRole("")
    load()
  }

  // Filter to admins and engineers for the main table (users visible for access control)
  const manageableUsers = users.filter(
    (u) => u.role === "admin" || u.role === "engineer" || u.role === "superadmin"
  )

  /* ── Derived stats ─────────────────── */
  const stats = [
    { label: "Total Users", value: users.length, icon: Users, tone: "indigo" as const },
    {
      label: "Super Admins",
      value: users.filter((u) => u.role === "superadmin").length,
      icon: ShieldCheck,
      tone: "violet" as const,
    },
    {
      label: "Admins",
      value: users.filter((u) => u.role === "admin").length,
      icon: Shield,
      tone: "sky" as const,
    },
    {
      label: "Engineers",
      value: users.filter((u) => u.role === "engineer").length,
      icon: Wrench,
      tone: "emerald" as const,
    },
    { label: "Active Orgs", value: allOrgs.length, icon: Building2, tone: "amber" as const },
  ]

  /* ── Columns: admins & engineers ───── */
  const accessColumns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "full_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => <UserCell u={row.original} />,
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "role",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      id: "orgs",
      accessorFn: (u) => u.orgs.map((o) => o.name).join(" "),
      header: "Organization Access",
      enableSorting: false,
      meta: { className: "whitespace-normal" },
      cell: ({ row }) => {
        const u = row.original
        if (u.orgs.length === 0) {
          return <span className="text-xs text-gray-400 dark:text-gray-500">No org access</span>
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {u.orgs.map((org) => (
              <StatusBadge key={org.id} tone="indigo" className="gap-1 pr-1">
                {org.name}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Revoke ${org.name} access`}
                      onClick={() =>
                        setRevokeTarget({ userId: u.id, orgId: org.id, orgName: org.name })
                      }
                      className="size-4 rounded-full p-0 text-brand-500 hover:bg-red-100 hover:text-red-600 dark:text-brand-300 dark:hover:bg-red-500/20 dark:hover:text-red-300 [&_svg:not([class*='size-'])]:size-3"
                    >
                      <X />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Revoke access</TooltipContent>
                </Tooltip>
              </StatusBadge>
            ))}
          </div>
        )
      },
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "text-right", headerClassName: "text-right" },
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex items-center justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Change role"
                  onClick={() => {
                    setRoleTarget(u)
                    setNewRole(u.role)
                    setRoleOpen(true)
                  }}
                  className="text-brand-500 hover:bg-brand-50 hover:text-brand-600 dark:text-brand-300 dark:hover:bg-brand-500/10"
                >
                  <UserCog className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Change role</TooltipContent>
            </Tooltip>
          </div>
        )
      },
    },
  ]

  /* ── Columns: all users overview ───── */
  const allUserColumns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "full_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => <UserCell u={row.original} />,
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-gray-500 dark:text-gray-400">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "role",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
  ]

  return (
    <RoleGate allowedRoles={["superadmin"]}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <PageHeader
          title="Access Control"
          description="Manage user roles and cross-organization access"
          actions={
            <Button onClick={() => setGrantOpen(true)}>
              <Plus className="h-4 w-4" />
              Grant Access
            </Button>
          }
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
            : stats.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
              ))}
        </div>

        {/* Admins & engineers */}
        <DataTable
          columns={accessColumns}
          data={manageableUsers}
          loading={loading}
          title="Admins & Engineers"
          description="Change roles and manage which organizations each user can access"
          searchable
          searchPlaceholder="Search users…"
          entityName="users"
          getRowId={(u) => u.id}
          emptyIcon={ShieldCheck}
          emptyTitle="No admins or engineers found"
        />

        {/* All users overview */}
        <DataTable
          columns={allUserColumns}
          data={users}
          loading={loading}
          title={`All Users (${users.length})`}
          description="Every account in the helpdesk"
          searchable
          searchPlaceholder="Search all users…"
          entityName="users"
          getRowId={(u) => u.id}
          emptyIcon={Users}
          emptyTitle="No users found"
        />

        {/* Grant Access Dialog */}
        <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Grant Organization Access</DialogTitle>
              <DialogDescription>
                Give an admin or engineer access to another organization.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="grant-user" required>
                  User
                </FieldLabel>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger id="grant-user" className="w-full">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((u) => u.role === "admin" || u.role === "engineer")
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email} — {u.role}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="grant-org" required>
                  Organization
                </FieldLabel>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger id="grant-org" className="w-full">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {allOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGrantOpen(false)}>
                Cancel
              </Button>
              <Button onClick={grantAccess}>
                <KeyRound className="h-4 w-4" />
                Grant Access
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Role Dialog */}
        <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change Role — {roleTarget?.full_name}</DialogTitle>
              <DialogDescription>
                Select the new role for this user.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-role">New Role</FieldLabel>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger id="new-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="superadmin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleOpen(false)}>
                Cancel
              </Button>
              <Button onClick={changeRole}>Save Role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke confirmation */}
        <ConfirmDialog
          open={!!revokeTarget}
          onOpenChange={(open) => {
            if (!open) setRevokeTarget(null)
          }}
          title="Revoke access?"
          description={revokeTarget ? `Revoke ${revokeTarget.orgName} access?` : ""}
          confirmLabel="Revoke"
          variant="danger"
          onConfirm={() => {
            if (revokeTarget) revokeAccess(revokeTarget.userId, revokeTarget.orgId)
          }}
        />
      </div>
    </RoleGate>
  )
}
