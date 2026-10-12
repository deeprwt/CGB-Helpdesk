"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { getUserAccessibleDomains, buildEmailDomainFilter } from "@/lib/org"

import type {
  ColumnDef,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table"
import {
  Columns3,
  Eye,
  ListFilter,
  Shield,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatCard, StatCardSkeleton, type StatTone } from "@/components/common/stat-card"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import { getInitials, roleLabel } from "@/hooks/useCurrentUser"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/* ---------------- TYPES ---------------- */

type Role = "user" | "engineer" | "admin" | "superadmin"

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
}

/* ---------------- PRESENTATION ---------------- */

const ROLE_TONE: Record<Role, BadgeTone> = {
  superadmin: "violet",
  admin: "orange",
  engineer: "sky",
  user: "gray",
}

/** Columns the "Columns" menu can toggle, with friendly labels */
const HIDEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "role", label: "Role" },
  { id: "empId", label: "Emp ID" },
  { id: "department", label: "Department" },
  { id: "position", label: "Position" },
  { id: "email", label: "Official Email" },
  { id: "phone", label: "Phone" },
  { id: "location", label: "Location" },
]

/* ---------------- COMPONENT ---------------- */

export default function EmployeeTable() {
  const router = useRouter()

  const [data, setData] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)

  const [currentRole, setCurrentRole] =
    React.useState<Role>("user")

  const [roleFilter, setRoleFilter] = React.useState<Role[]>([])
  // Email already shows under each name, so its own column starts hidden
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({ email: false })
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const [pendingDelete, setPendingDelete] = React.useState<Employee | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  /* ---------------- FETCH USERS ---------------- */

  React.useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setLoading(false)
        return
      }

      const userId = session.user.id

      const { data: me } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single()

      if (!me || !["admin", "engineer", "superadmin"].includes(me.role)) {
        setData([])
        setLoading(false)
        return
      }

      setCurrentRole(me.role)

      // Scope to user's accessible org domain(s)
      const domains = await getUserAccessibleDomains(supabase, session.user.id, session.user.email ?? "", me.role)

      let query = supabase.from("users").select(`
        id,
        full_name,
        role,
        employee_id,
        department,
        position,
        email,
        phone,
        city,
        avatar_url
      `)
        .or(buildEmailDomainFilter(domains))

      if (me.role === "engineer") {
        query = query.in("role", ["user", "engineer"])
      }

      const { data } = await query

      if (data) {
        setData(
          data.map((u) => ({
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
          }))
        )
      }

      setLoading(false)
    }

    fetchUsers()
  }, [])

  /* ---------------- DELETE USER ---------------- */

  const handleDeleteUser = (user: Employee) => {
    if (user.role === "admin" || user.role === "superadmin") {
      toast.error("Admin account cannot be deleted")
      return
    }

    // Confirmation happens in <ConfirmDialog> (replaces window.confirm)
    setPendingDelete(user)
    setConfirmOpen(true)
  }

  const deleteUser = async (user: Employee) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        toast.error("You must be logged in")
        return
      }

      const res = await fetch("/api/user/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ target_user_id: user.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete user")
        return
      }

      toast.success("User deleted and all sessions invalidated")
      setData((prev) => prev.filter((u) => u.id !== user.id))
    } catch {
      toast.error("Failed to delete user")
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
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 dark:text-white">
                {user.name}
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
      cell: ({ row }) => (
        <StatusBadge tone={ROLE_TONE[row.original.role] ?? "gray"} dot>
          {roleLabel(row.original.role)}
        </StatusBadge>
      ),
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
          currentRole === "superadmin" ||
          (currentRole === "admin" &&
            (user.role === "user" ||
              user.role === "engineer")) ||
          (currentRole === "engineer" &&
            user.role === "user")

        const canDelete =
          (currentRole === "admin" || currentRole === "superadmin") &&
          user.role !== "admin" && user.role !== "superadmin"

        return (
          <div className="flex items-center justify-end gap-1">
            {canView && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`View ${user.name}`}
                    onClick={() => router.push(`/profile/${user.id}`)}
                    className="text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
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

  const roles: Role[] = ["user", "engineer", "admin"]

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
            <span className="rounded-full bg-indigo-50 px-1.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
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

  const columnsMenu = (
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
        {HIDEABLE_COLUMNS.map((column) => (
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
  )

  const selectionBar =
    selectedCount > 0 ? (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-indigo-50/60 px-3 py-1.5 text-sm text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
        <span>
          <span className="font-semibold">{selectedCount}</span> of{" "}
          {filteredData.length} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRowSelection({})}
          className="h-8 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
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
        description="Everyone in your organisation and the role they hold"
        searchable
        searchPlaceholder="Search users…"
        filters={roleFilterMenu}
        toolbarActions={columnsMenu}
        subHeader={selectionBar}
        getRowId={(row) => row.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        columnVisibility={columnVisibility}
        pageSize={10}
        pageSizeOptions={[10, 20, 50]}
        entityName="users"
        emptyIcon={Users}
        emptyTitle="No users found"
        emptyDescription="Try a different search term or clear the role filter."
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete user?"
        description={`Are you sure you want to delete ${pendingDelete?.name ?? "this user"}? This will immediately log them out of all sessions.`}
        confirmLabel="Delete user"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) void deleteUser(pendingDelete)
        }}
      />
    </div>
  )
}
