"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import RoleGate from "@/components/auth/RoleGate"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label"
import { Plus, X, Shield, ShieldCheck, User } from "lucide-react"
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

const ROLE_ICON: Record<string, React.ReactNode> = {
  superadmin: <ShieldCheck className="h-3.5 w-3.5" />,
  admin: <Shield className="h-3.5 w-3.5" />,
  engineer: <User className="h-3.5 w-3.5" />,
  user: <User className="h-3.5 w-3.5" />,
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  engineer: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  user: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
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

  /* ── Revoke org access ──────────────── */
  const revokeAccess = async (userId: string, orgId: string, orgName: string) => {
    if (!confirm(`Revoke ${orgName} access?`)) return

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

  return (
    <RoleGate allowedRoles={["superadmin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Access Control</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage user roles and cross-organization access
            </p>
          </div>
          <Button onClick={() => setGrantOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Grant Access
          </Button>
        </div>

        {/* Users table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organization Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : manageableUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No admins or engineers found
                  </TableCell>
                </TableRow>
              ) : (
                manageableUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs font-bold bg-muted">
                            {u.full_name?.[0]?.toUpperCase() ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{u.full_name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`gap-1 ${ROLE_BADGE[u.role] ?? ROLE_BADGE.user}`}
                      >
                        {ROLE_ICON[u.role]}
                        {u.role.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {u.orgs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            No org access
                          </span>
                        ) : (
                          u.orgs.map((org) => (
                            <Badge
                              key={org.id}
                              variant="outline"
                              className="gap-1 text-xs pr-1"
                            >
                              {org.name}
                              <button
                                onClick={() => revokeAccess(u.id, org.id, org.name)}
                                className="ml-0.5 hover:text-red-500 transition-colors"
                                title="Revoke access"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRoleTarget(u)
                          setNewRole(u.role)
                          setRoleOpen(true)
                        }}
                      >
                        Change Role
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* All Users overview */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">All Users ({users.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs font-bold bg-muted">
                    {u.full_name?.[0]?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${ROLE_BADGE[u.role] ?? ROLE_BADGE.user}`}
                >
                  {u.role.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Grant Access Dialog */}
        <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Organization Access</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>Organization</Label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
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
              </div>

              <Button className="w-full" onClick={grantAccess}>
                Grant Access
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Change Role Dialog */}
        <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Change Role — {roleTarget?.full_name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>New Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="superadmin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={changeRole}>
                Save Role
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  )
}
