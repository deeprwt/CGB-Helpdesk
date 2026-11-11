"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"

export type AppRole = "user" | "engineer" | "admin" | "superadmin"

export type TenantInfo = {
  id: string
  name: string
  slug: string
  status: "active" | "suspended" | string
}

export type CurrentUser = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  role: AppRole
  tenant_id: string | null
  organization_id: string | null
  /** The tenant (organisation) this person belongs to */
  tenant: TenantInfo | null
}

const SELECT =
  "id, full_name, email, avatar_url, role, tenant_id, organization_id, tenant:tenants(id, name, slug, status)"

type Row = Omit<CurrentUser, "role" | "tenant"> & {
  role: string | null
  tenant: TenantInfo | TenantInfo[] | null
}

/** Signed-in user's profile row (from `users`, with their tenant), kept in sync with auth state changes. */
export function useCurrentUser() {
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    const load = async (userId: string) => {
      const { data } = await supabase.from("users").select(SELECT).eq("id", userId).maybeSingle()
      if (cancelled) return
      const row = data as Row | null
      setUser(
        row
          ? {
              ...row,
              role: ((row.role as AppRole) ?? "user") as AppRole,
              tenant_id: row.tenant_id ?? null,
              organization_id: row.organization_id ?? null,
              tenant: (Array.isArray(row.tenant) ? row.tenant[0] : row.tenant) ?? null,
            }
          : null
      )
      setLoading(false)
    }

    // Immediate fetch — covers Strict Mode double-mount where INITIAL_SESSION is missed
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) load(authUser.id)
      else if (!cancelled) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) load(session.user.id)
      else if (!cancelled) {
        setUser(null)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}

/**
 * Every tenant, for super admin pickers and "Tenant" columns.
 * Only loads when `enabled` (the database returns other tenants to super admins only).
 */
export function useTenantList(enabled: boolean) {
  const [tenants, setTenants] = React.useState<TenantInfo[]>([])

  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false
    supabase
      .from("tenants")
      .select("id, name, slug, status")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setTenants((data as TenantInfo[] | null) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return tenants
}

export type CompanyOption = { id: string; name: string; status: string; tenant_id: string }

/**
 * Client companies, for pickers. The database already limits them to the
 * viewer's tenant; pass `tenantId` to narrow a super admin's view to one tenant.
 * Returns everything when `tenantId` is undefined, nothing while it is null.
 */
export function useCompanyList(tenantId?: string | null, reloadKey = 0) {
  const [companies, setCompanies] = React.useState<CompanyOption[]>([])

  React.useEffect(() => {
    if (tenantId === null) {
      setCompanies([])
      return
    }
    let cancelled = false
    let query = supabase.from("organizations").select("id, name, status, tenant_id").order("name")
    if (tenantId) query = query.eq("tenant_id", tenantId)
    query.then(({ data }) => {
      if (!cancelled) setCompanies((data as CompanyOption[] | null) ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [tenantId, reloadKey])

  return companies
}

export function getInitials(name?: string | null) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function roleLabel(role?: string | null) {
  if (!role) return ""
  return role === "superadmin" ? "Super Admin" : role.charAt(0).toUpperCase() + role.slice(1)
}
