import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAllRows } from "@/lib/fetch-all-rows"

/**
 * Extracts the organisation domain from an email address.
 * e.g. "user@cgbindia.com" → "cgbindia.com"
 */
export function extractOrgDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? ""
}

/**
 * Returns the IDs of every user whose email belongs to `domain`.
 * Used for client-side multi-tenant filtering.
 */
export async function getOrgUserIds(
  supabase: SupabaseClient,
  domain: string
): Promise<string[]> {
  if (!domain) return []

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("email", `%@${domain}`)

  if (error) return []
  return (data ?? []).map((u: { id: string }) => u.id)
}

/* ─────────────────────────────────────────────────────────
   Multi-Organization helpers (Super Admin feature)
   ───────────────────────────────────────────────────────── */

/**
 * Returns ALL domains a user is allowed to access.
 *
 * - superadmin  → every active organization domain
 * - admin/engineer with cross-org → domains from user_organization_access
 * - default      → just their own email domain
 *
 * Gracefully falls back to single-domain if the `organizations`
 * or `user_organization_access` tables don't exist yet.
 */
export async function getUserAccessibleDomains(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  userRole: string
): Promise<string[]> {
  /* ── Super Admin: all active org domains ─────────── */
  if (userRole === "superadmin") {
    const { data, error } = await supabase
      .from("organizations")
      .select("domain")
      .eq("status", "active")

    if (!error && data && data.length > 0) {
      return data.map((o: { domain: string }) => o.domain)
    }
    // Fallback if table doesn't exist yet
    return [extractOrgDomain(userEmail)]
  }

  /* ── Check user_organization_access ──────────────── */
  const { data: accessData, error: accessError } = await supabase
    .from("user_organization_access")
    .select("organization:organization_id (domain)")
    .eq("user_id", userId)

  if (!accessError && accessData && accessData.length > 0) {
    const domains = accessData
      .map((a: any) => {
        const org = Array.isArray(a.organization)
          ? a.organization[0]
          : a.organization
        return org?.domain as string | undefined
      })
      .filter(Boolean) as string[]

    if (domains.length > 0) return domains
  }

  /* ── Fallback: single email domain ──────────────── */
  return [extractOrgDomain(userEmail)]
}

export type Organization = {
  id: string
  name: string
  domain: string
}

/**
 * Returns the organization records a user is allowed to access
 * (same rules as getUserAccessibleDomains), sorted by name.
 */
export async function getUserAccessibleOrganizations(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  userRole: string
): Promise<Organization[]> {
  const domains = await getUserAccessibleDomains(
    supabase,
    userId,
    userEmail,
    userRole
  )

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, domain")
    .in("domain", domains)
    .order("name")

  if (error) return []
  return (data ?? []) as Organization[]
}

/**
 * Returns user IDs across multiple organisation domains.
 * Used for cross-org ticket filtering when an admin has
 * access to several organizations.
 */
export async function getOrgUserIdsByDomains(
  supabase: SupabaseClient,
  domains: string[]
): Promise<string[]> {
  if (domains.length === 0) return []

  // Optimise single-domain case (most common)
  if (domains.length === 1) {
    return getOrgUserIds(supabase, domains[0])
  }

  const orFilter = domains.map((d) => `email.ilike.%@${d}`).join(",")

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .or(orFilter)

  if (error) return []
  return (data ?? []).map((u: { id: string }) => u.id)
}

/**
 * Builds a PostgREST `.or()` filter string for matching
 * user emails across multiple org domains.
 *
 * Usage: `query.or(buildEmailDomainFilter(domains))`
 */
export function buildEmailDomainFilter(domains: string[]): string {
  return domains.map((d) => `email.ilike.%@${d}`).join(",")
}

/* ─────────────────────────────────────────────────────────
   Ticket notification recipients
   ───────────────────────────────────────────────────────── */

export type TicketAdmin = {
  id: string
  email: string | null
  name: string | null
  role: string
}

/**
 * Admins who should hear about a ticket: every superadmin, plus admins whose
 * email domain is the requester's organization or who were granted access to
 * it (Super Admin → Access Control). Same rule AskMira uses.
 *
 * Loads admins and grants once and returns a picker, so loops over many
 * tickets (e.g. the SLA check) don't re-query per ticket.
 */
export async function loadTicketAdminPicker(
  supabase: SupabaseClient
): Promise<(requesterEmail: string | null | undefined) => TicketAdmin[]> {
  const [{ data: admins }, { data: orgs }, { data: access }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, name:full_name, role")
      .in("role", ["admin", "superadmin"]),
    supabase.from("organizations").select("id, domain"),
    fetchAllRows<{ user_id: string; organization_id: string }>((from, to) =>
      supabase
        .from("user_organization_access")
        .select("user_id, organization_id")
        .order("id")
        .range(from, to)
    ),
  ])

  const orgIdByDomain = new Map(
    (orgs ?? []).map((o: { id: string; domain: string }) => [o.domain, o.id])
  )
  const grants = new Set(access.map((a) => `${a.user_id}:${a.organization_id}`))

  return (requesterEmail) => {
    const domain = extractOrgDomain(requesterEmail ?? "")
    const orgId = orgIdByDomain.get(domain)
    return ((admins ?? []) as TicketAdmin[]).filter(
      (a) =>
        a.role === "superadmin" ||
        (!!domain && extractOrgDomain(a.email ?? "") === domain) ||
        (!!orgId && grants.has(`${a.id}:${orgId}`))
    )
  }
}

/** Admins to notify about a ticket raised by `requesterEmail`. */
export async function getTicketAdmins(
  supabase: SupabaseClient,
  requesterEmail: string | null | undefined
): Promise<TicketAdmin[]> {
  const pick = await loadTicketAdminPicker(supabase)
  return pick(requesterEmail)
}
