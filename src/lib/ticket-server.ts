// Server-only helpers for the ticket API routes.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { extractOrgDomain, getStaffWorkDomains } from "@/lib/org"
import { isStaffRole } from "@/lib/ticket-access"

/** Service-role client (bypasses RLS). Server only. */
export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Signed-in user from the request's "Authorization: Bearer <token>" header. */
export async function getRequestUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    }
  )

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser()

  if (error || !user) return null
  return { id: user.id, email: user.email ?? null }
}

export type Person = {
  id: string
  email: string | null
  full_name: string | null
  role: string
}

export async function loadPerson(db: SupabaseClient, id: string): Promise<Person | null> {
  const { data } = await db
    .from("users")
    .select("id, email, full_name, role")
    .eq("id", id)
    .maybeSingle()
  return (data as Person | null) ?? null
}

/**
 * Whether an IT team member looks after the organisation of the person with
 * `requesterEmail` (same rule as the dashboard queue). Super admins: always.
 */
export async function staffCoversRequester(
  db: SupabaseClient,
  staff: Person,
  requesterEmail: string | null | undefined
): Promise<boolean> {
  if (!isStaffRole(staff.role)) return false
  if (staff.role === "superadmin") return true
  const domain = extractOrgDomain(requesterEmail ?? "")
  if (!domain) return false
  const domains = await getStaffWorkDomains(db, staff.id, staff.email ?? "", staff.role)
  return domains.includes(domain)
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}
