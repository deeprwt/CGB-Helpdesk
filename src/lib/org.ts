import type { SupabaseClient } from "@supabase/supabase-js"

/*
 * Tenancy helpers.
 *
 * Every person, ticket and asset carries a `tenant_id`. The database (RLS)
 * already limits what a browser session can read to its own tenant, so client
 * code never filters by tenant or email domain itself.
 *
 * "Organizations" are client companies inside a tenant: a label for grouping
 * people and assets, not an access boundary.
 */

/** A client company inside a tenant. */
export type Organization = {
  id: string
  name: string
  domain?: string | null
  status?: string
  tenant_id?: string
}

/** Splits a list into chunks, e.g. IDs for `.in()` filters that must keep the URL short. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/* ─────────────────────────────────────────────────────────
   Ticket notification recipients (server)
   ───────────────────────────────────────────────────────── */

export type TicketStaff = {
  id: string
  email: string | null
  name: string | null
  role: string
  tenant_id: string
}

/** Kept for existing imports. */
export type TicketAdmin = TicketStaff

/**
 * Loads the IT team once and returns a picker: the people with one of `roles`
 * in a given tenant. Loops over many tickets (e.g. the SLA check) reuse it.
 */
export async function loadTicketStaffPicker(
  supabase: SupabaseClient,
  roles: string[] = ["engineer", "admin", "superadmin"]
): Promise<(tenantId: string | null | undefined) => TicketStaff[]> {
  const { data } = await supabase
    .from("users")
    .select("id, email, name:full_name, role, tenant_id")
    .in("role", roles)

  const staff = (data ?? []) as TicketStaff[]
  return (tenantId) => (tenantId ? staff.filter((s) => s.tenant_id === tenantId) : [])
}

/** Admins (and super admins) of a tenant, for escalations and SLA alerts. */
export async function loadTicketAdminPicker(
  supabase: SupabaseClient
): Promise<(tenantId: string | null | undefined) => TicketAdmin[]> {
  return loadTicketStaffPicker(supabase, ["admin", "superadmin"])
}

export async function getTicketAdmins(
  supabase: SupabaseClient,
  tenantId: string | null | undefined
): Promise<TicketAdmin[]> {
  const pick = await loadTicketAdminPicker(supabase)
  return pick(tenantId)
}
