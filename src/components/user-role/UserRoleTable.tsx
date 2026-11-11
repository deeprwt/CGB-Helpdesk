"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { apiFetch } from "@/lib/api-client"
import { fetchAllRows } from "@/lib/fetch-all-rows"

import type {
  ColumnDef,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table"
import {
  Columns3,
  ChevronDown,
  Eye,
  ListFilter,
  Loader2,
  MailPlus,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { changeUserRole } from "@/lib/change-role"
import { StatCard, StatCardSkeleton, type StatTone } from "@/components/common/stat-card"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import {
  getInitials,
  roleLabel,
  useCompanyList,
  useCurrentUser,
  useTenantList,
} from "@/hooks/useCurrentUser"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/* ---------------- TYPES ---------------- */

type Role = "user" | "engineer" | "admin" | "superadmin"
type InviteRole = Exclude<Role, "superadmin">

type Employee = {
  id: string
  name: string
  role: Role
  empId: string
  department: string
  position: string
  email: string
  phone: string
  location: string
  avatar: string
  company: string
  tenantId: string | null
  tenant: string
  /** No presence recorded yet: most likely they never signed in */
  pending: boolean
}

/* ---------------- PRESENTATION ---------------- */

const ROLE_TONE: Record<Role, BadgeTone> = {
  superadmin: "violet",
  admin: "orange",
  engineer: "sky",
  user: "gray",
}

const INVITE_ROLES: { value: InviteRole; label: string; hint: string }[] = [
  { value: "user", label: "User", hint: "Raises and follows their own tickets" },
  { value: "engineer", label: "Engineer", hint: "Works on the team's tickets and assets" },
  { value: "admin", label: "Admin", hint: "Everything, plus people and companies" },
]

const NO_COMPANY = "__none__"

/* ---------------- INVITE DIALOG ---------------- */

function InviteMemberDialog({
  open,
  onOpenChange,
  isSuper,
  defaultTenantId,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isSuper: boolean
  defaultTenantId: string | null
  onInvited: () => void
}) {
  const tenants = useTenantList(isSuper && open)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<InviteRole>("user")
  const [companyId, setCompanyId] = React.useState(NO_COMPANY)
  const [tenantId, setTenantId] = React.useState<string>(defaultTenantId ?? "")
  const [sending, setSending] = React.useState(false)

  // Companies of the tenant the person joins
  const companies = useCompanyList(open ? (isSuper ? tenantId || null : undefined) : null)

  React.useEffect(() => {
    if (!open) return
    setName("")
    setEmail("")
    setRole("user")
    setCompanyId(NO_COMPANY)
    setTenantId(defaultTenantId ?? "")
  }, [open, defaultTenantId])

  const submit = async () => {
    const fullName = name.trim()
    const address = email.trim().toLowerCase()
    if (!fullName) return toast.error("Enter the person's name")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return toast.error("Enter a valid email address")
    if (isSuper && !tenantId) return toast.error("Choose a tenant")

    setSending(true)
    try {
      const res = await apiFetch<{ emailed: boolean; emailError?: string }>("/api/users/invite", {
        method: "POST",
        body: {
          email: address,
          full_name: fullName,
          role,
          organization_id: companyId === NO_COMPANY ? null : companyId,
          ...(isSuper ? { tenant_id: tenantId } : {}),
        },
      })
      if (res.emailed) {
        toast.success(`Invitation sent to ${address}`, {
          description: "They'll get a link to set their password.",
        })
      } else {
        toast.warning(`${fullName} was added, but the email could not be sent`, {
          description: `${res.emailError ?? "Email failed"}. Use “Resend invitation” to try again.`,
          duration: 10000,
        })
      }
      onOpenChange(false)
      onInvited()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invitation")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email with a link to set their password and sign in.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-6"
        >
          <FieldGroup className="sm:grid-cols-2">
            {isSuper && (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="invite-tenant" required>
                  Tenant
                </FieldLabel>
                <Select
                  value={tenantId}
                  onValueChange={(v) => {
                    setTenantId(v)
                    setCompanyId(NO_COMPANY)
                  }}
                >
                  <SelectTrigger id="invite-tenant" className="w-full">
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
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="invite-name" required>
                Full name
              </FieldLabel>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="invite-email" required>
                Email
              </FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="invite-role" required>
                Role
              </FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{INVITE_ROLES.find((r) => r.value === role)?.hint}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="invite-company">Company</FieldLabel>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="invite-company" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COMPANY}>No company</SelectItem>
                  {companies
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FieldDescription>Optional. Manage the list under Companies.</FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- COMPONENT ---------------- */

export default function EmployeeTable() {
  const router = useRouter()
  const { user: me } = useCurrentUser()

  const [data, setData] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [reloadKey, setReloadKey] = React.useState(0)

  const currentRole: Role = me?.role ?? "user"
  const currentUserId = me?.id ?? ""
  const isSuper = currentRole === "superadmin"
  const canManage = currentRole === "admin" || isSuper

  const [roleFilter, setRoleFilter] = React.useState<Role[]>([])
  // Email already shows under each name, so its own column starts hidden
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({ email: false, phone: false, tenant: false })
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const [pendingDelete, setPendingDelete] = React.useState<Employee | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // A role picked from the Role column, waiting for confirmation
  const [roleChange, setRoleChange] =
    React.useState<{ user: Employee; role: Role } | null>(null)
  const [savingRole, setSavingRole] = React.useState(false)

  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [resendTarget, setResendTarget] = React.useState<Employee | null>(null)
  const [resending, setResending] = React.useState(false)

  // Super admins see every tenant, so show which one each person is in
  React.useEffect(() => {
    if (isSuper) setColumnVisibility((prev) => ({ ...prev, tenant: true }))
  }, [isSuper])

  /* ---------------- FETCH USERS ---------------- */

  React.useEffect(() => {
    if (!me) return
    if (!["admin", "engineer", "superadmin"].includes(me.role)) {
      setData([])
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchUsers = async () => {
      setLoading(true)

      // The database limits these to the viewer's tenant (super admins: all tenants)
      const [{ data: rows, error }, { data: orgs }, { data: tenantRows }] = await Promise.all([
        fetchAllRows<{
          id: string
          full_name: string | null
          role: Role | null
          employee_id: string | null
          department: string | null
          position: string | null
          email: string | null
          phone: string | null
          city: string | null
          avatar_url: string | null
          organization_id: string | null
          tenant_id: string | null
          last_seen_at: string | null
        }>((from, to) => {
          let q = supabase
            .from("users")
            .select(
              "id, full_name, role, employee_id, department, position, email, phone, city, avatar_url, organization_id, tenant_id, last_seen_at"
            )
          if (me.role === "engineer") q = q.in("role", ["user", "engineer"])
          return q.order("id").range(from, to)
        }),
        supabase.from("organizations").select("id, name"),
        supabase.from("tenants").select("id, name"),
      ])

      if (cancelled) return
      if (error) toast.error(error.message)

      const companyName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))
      const tenantName = new Map((tenantRows ?? []).map((t) => [t.id as string, t.name as string]))

      setData(
        rows.map((u) => ({
          id: u.id,
          name: u.full_name ?? "-",
          role: u.role ?? "user",
          empId: u.employee_id ?? "-",
          department: u.department ?? "-",
          position: u.position ?? "-",
          email: u.email ?? "-",
          phone: u.phone ?? "-",
          location: u.city ?? "-",
          avatar: u.avatar_url ?? "/images/user/user-31.jpg",
          company: (u.organization_id && companyName.get(u.organization_id)) || "-",
          tenantId: u.tenant_id,
          tenant: (u.tenant_id && tenantName.get(u.tenant_id)) || "-",
          pending: !u.last_seen_at,
        }))
      )
      setLoading(false)
    }

    fetchUsers()
    return () => {
      cancelled = true
    }
  }, [me, reloadKey])

  /* ---------------- DELETE USER ---------------- */

  const handleDeleteUser = (user: Employee) => {
    if (user.role === "admin" || user.role === "superadmin") {
      toast.error("Admin account cannot be deleted")
      return
    }
    setPendingDelete(user)
  }

  const deleteUser = async (user: Employee) => {
    setDeleting(true)
    try {
      const res = await apiFetch<{ warning?: string }>("/api/user/delete", {
        method: "POST",
        body: { target_user_id: user.id },
      })
      if (res.warning) toast.warning(res.warning, { duration: 10000 })
      else toast.success(`${user.name} removed and signed out everywhere`)
      setData((prev) => prev.filter((u) => u.id !== user.id))
      setPendingDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user")
    } finally {
      setDeleting(false)
    }
  }

  /* ---------------- RESEND INVITATION ---------------- */

  const resendInvite = async (user: Employee) => {
    setResending(true)
    try {
      await apiFetch("/api/users/invite", { method: "PUT", body: { user_id: user.id } })
      toast.success(`A new invitation was sent to ${user.email}`)
      setResendTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend the invitation")
      setResendTarget(null)
    } finally {
      setResending(false)
    }
  }

  /* ---------------- CHANGE ROLE ---------------- */

  // Same rules as /api/user/role: super admins change anyone but themselves;
  // admins hand out User, Engineer or Admin, and can't touch super admins
  const assignableRoles: Role[] = isSuper
    ? ["user", "engineer", "admin", "superadmin"]
    : ["user", "engineer", "admin"]

  const canChangeRole = (user: Employee) =>
    user.id !== currentUserId &&
    (isSuper || (currentRole === "admin" && user.role !== "superadmin"))

  const saveRole = async () => {
    if (!roleChange) return
    const { user, role } = roleChange
    setSavingRole(true)
    try {
      await changeUserRole(user.id, role)
      setData((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role } : u))
      )
      toast.success(`${user.name} is now ${roleLabel(role)}`)
      setRoleChange(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role")
    } finally {
      setSavingRole(false)
    }
  }

  /* ---------------- COLUMNS ---------------- */

  const columns: ColumnDef<Employee>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all users on this page"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) =>
            table.toggleAllPageRowsSelected(!!v)
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onCheckedChange={(v) =>
            row.toggleSelected(!!v)
          }
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: "w-10", headerClassName: "w-10" },
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex min-w-[220px] items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-medium text-gray-900 dark:text-white">
                <span className="truncate">{user.name}</span>
                {canManage && user.pending && user.id !== currentUserId && (
                  <StatusBadge tone="amber" className="text-[10px]">
                    Invited
                  </StatusBadge>
                )}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {user.email}
              </p>
            </div>
          </div>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => {
        const user = row.original
        const badge = (
          <StatusBadge tone={ROLE_TONE[user.role] ?? "gray"} dot>
            {roleLabel(user.role)}
            {canChangeRole(user) && <ChevronDown className="size-3 opacity-60" />}
          </StatusBadge>
        )

        if (!canChangeRole(user)) return badge

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Change role of ${user.name}`}
                className="rounded-full outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brand-500/50"
              >
                {badge}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel>Change role</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={user.role}
                onValueChange={(value) => {
                  if (value !== user.role) {
                    setRoleChange({ user, role: value as Role })
                  }
                }}
              >
                {assignableRoles.map((role) => (
                  <DropdownMenuRadioItem key={role} value={role}>
                    {roleLabel(role)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
    {
      accessorKey: "tenant",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tenant" />
      ),
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "company",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Company" />
      ),
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "empId",
      header: "Emp ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {row.original.empId}
        </span>
      ),
    },
    {
      accessorKey: "department",
      header: "Department",
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "position",
      header: "Position",
      meta: { className: "whitespace-nowrap" },
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Official Email" />
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      meta: { className: "whitespace-nowrap tabular-nums" },
    },
    {
      accessorKey: "location",
      header: "Location",
      meta: { className: "whitespace-nowrap" },
    },

    /* -------- ACTIONS -------- */
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "text-right", headerClassName: "text-right" },
      cell: ({ row }) => {
        const user = row.original

        const canView =
          isSuper ||
          (currentRole === "admin" && user.role !== "superadmin") ||
          (currentRole === "engineer" && user.role === "user")

        const canDelete =
          canManage && user.role !== "admin" && user.role !== "superadmin"

        const canResend = canManage && user.pending && user.id !== currentUserId

        return (
          <div className="flex items-center justify-end gap-1">
            {canResend && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Resend invitation to ${user.name}`}
                    onClick={() => setResendTarget(user)}
                    className="text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10"
                  >
                    <MailPlus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Resend invitation</TooltipContent>
              </Tooltip>
            )}

            {canView && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`View ${user.name}`}
                    onClick={() => router.push(`/profile/${user.id}`)}
                    className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                  >
                    <Eye />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View profile</TooltipContent>
              </Tooltip>
            )}

            {canDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${user.name}`}
                    onClick={() => handleDeleteUser(user)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete user</TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      },
    },
  ]

  /* ---------------- DERIVED ---------------- */

  const roles: Role[] = isSuper ? ["user", "engineer", "admin", "superadmin"] : ["user", "engineer", "admin"]

  const hideableColumns: { id: string; label: string }[] = [
    { id: "role", label: "Role" },
    ...(isSuper ? [{ id: "tenant", label: "Tenant" }] : []),
    { id: "company", label: "Company" },
    { id: "empId", label: "Emp ID" },
    { id: "department", label: "Department" },
    { id: "position", label: "Position" },
    { id: "email", label: "Official Email" },
    { id: "phone", label: "Phone" },
    { id: "location", label: "Location" },
  ]

  const filteredData =
    roleFilter.length > 0
      ? data.filter((u) => roleFilter.includes(u.role))
      : data

  const selectedCount = filteredData.filter((u) => rowSelection[u.id]).length

  const countRole = (role: Role) => data.filter((u) => u.role === role).length

  // Engineers only ever load users + engineers, so admin tiles would always read 0
  const showAdminStats = currentRole !== "engineer"

  const stats: { label: string; value: number; icon: LucideIcon; tone: StatTone }[] = [
    { label: "Total Users", value: data.length, icon: Users, tone: "indigo" },
    ...(showAdminStats
      ? [
          { label: "Super Admins", value: countRole("superadmin"), icon: ShieldCheck, tone: "violet" as const },
          { label: "Admins", value: countRole("admin"), icon: Shield, tone: "orange" as const },
        ]
      : []),
    { label: "Engineers", value: countRole("engineer"), icon: Wrench, tone: "sky" },
    { label: "End Users", value: countRole("user"), icon: UserRound, tone: "emerald" },
  ]

  /* ---------------- TOOLBAR ---------------- */

  const roleFilterMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter />
          Role
          {roleFilter.length > 0 && (
            <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              {roleFilter.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => (
          <DropdownMenuCheckboxItem
            key={role}
            checked={roleFilter.includes(role)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              setRoleFilter((prev) =>
                checked
                  ? [...prev, role]
                  : prev.filter((r) => r !== role)
              )
            }
          >
            <StatusBadge tone={ROLE_TONE[role]} dot>
              {roleLabel(role)}
            </StatusBadge>
          </DropdownMenuCheckboxItem>
        ))}
        {roleFilter.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setRoleFilter([])}>
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const toolbarActions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Columns3 />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hideableColumns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={columnVisibility[column.id] !== false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) =>
                setColumnVisibility((prev) => ({ ...prev, [column.id]: !!v }))
              }
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {canManage && (
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus />
          Invite member
        </Button>
      )}
    </>
  )

  const selectionBar =
    selectedCount > 0 ? (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-50/60 px-3 py-1.5 text-sm text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20">
        <span>
          <span className="font-semibold">{selectedCount}</span> of{" "}
          {filteredData.length} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRowSelection({})}
          className="h-8 text-brand-700 hover:bg-brand-100 hover:text-brand-800 dark:text-brand-300 dark:hover:bg-brand-500/15"
        >
          Clear selection
        </Button>
      </div>
    ) : undefined

  /* ---------------- UI ---------------- */

  return (
    <div className="flex flex-col gap-6">
      {/* Role counts */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 md:grid-cols-3",
          (loading || showAdminStats) && "xl:grid-cols-5"
        )}
      >
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} className={cn(i === 0 && "col-span-2 md:col-span-1")} />
            ))
          : stats.map((stat, i) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
                tone={stat.tone}
                className={cn(i === 0 && "col-span-2 md:col-span-1")}
              />
            ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        loading={loading}
        title="All users"
        description={
          isSuper
            ? "Everyone in every tenant and the role they hold"
            : `Everyone in ${me?.tenant?.name ?? "your organisation"} and the role they hold`
        }
        searchable
        searchPlaceholder="Search users…"
        filters={roleFilterMenu}
        toolbarActions={toolbarActions}
        subHeader={selectionBar}
        getRowId={(row) => row.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        columnVisibility={columnVisibility}
        pageSize={10}
        entityName="users"
        emptyIcon={Users}
        emptyTitle="No users found"
        emptyDescription="Try a different search term or clear the role filter."
      />

      {canManage && (
        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          isSuper={isSuper}
          defaultTenantId={me?.tenant_id ?? null}
          onInvited={() => setReloadKey((k) => k + 1)}
        />
      )}

      <ConfirmDialog
        open={!!resendTarget}
        onOpenChange={(open) => {
          if (!open && !resending) setResendTarget(null)
        }}
        title="Resend invitation?"
        description={
          resendTarget
            ? `Send ${resendTarget.name} (${resendTarget.email}) a new link to set their password? Earlier links stop working.`
            : ""
        }
        confirmLabel="Resend"
        variant="info"
        loading={resending}
        onConfirm={() => {
          if (resendTarget) void resendInvite(resendTarget)
        }}
      />

      <ConfirmDialog
        open={!!roleChange}
        onOpenChange={(open) => {
          if (!open && !savingRole) setRoleChange(null)
        }}
        title="Change role?"
        description={
          roleChange
            ? `Change ${roleChange.user.name} from ${roleLabel(roleChange.user.role)} to ${roleLabel(roleChange.role)}?`
            : ""
        }
        confirmLabel="Change role"
        variant="info"
        loading={savingRole}
        onConfirm={() => void saveRole()}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
        title="Delete user?"
        description={`Are you sure you want to delete ${pendingDelete?.name ?? "this user"}? This will immediately log them out of all sessions.`}
        confirmLabel="Delete user"
        variant="danger"
        loading={deleting}
        onConfirm={() => {
          if (pendingDelete) void deleteUser(pendingDelete)
        }}
      />
    </div>
  )
}
