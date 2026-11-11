// Server-only helpers for API routes: who is calling, and which tenant they act in.
//
// Tenancy is explicit: every person has one `tenant_id`. Engineers, admins and
// users act only inside their own tenant; a super admin acts in any tenant.
// Email domains play no part in access.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { isStaffRole } from "@/lib/ticket-access"

export type AppRole = "user" | "engineer" | "admin" | "superadmin"
export const APP_ROLES: readonly AppRole[] = ["user", "engineer", "admin", "superadmin"]

/** Service-role client (bypasses RLS). Server only. */
export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
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
      auth: { persistSession: false, autoRefreshToken: false },
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
  role: AppRole
  tenant_id: string
  organization_id: string | null
}

export const PERSON_SELECT = "id, email, full_name, role, tenant_id, organization_id"

export async function loadPerson(db: SupabaseClient, id: string): Promise<Person | null> {
  const { data } = await db.from("users").select(PERSON_SELECT).eq("id", id).maybeSingle()
  return (data as Person | null) ?? null
}

export type Tenant = { id: string; name: string; slug: string; status: "active" | "suspended" }

export type Actor = { db: SupabaseClient; me: Person; tenant: Tenant }

/**
 * The caller, with their profile and tenant — or the error Response to return.
 *
 *   const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
 *   if (ctx instanceof Response) return ctx
 *
 * Refuses people without a profile, and everyone but super admins while their
 * tenant is suspended.
 */
export async function requireActor(
  req: Request,
  opts: { roles?: readonly AppRole[] } = {}
): Promise<Actor | Response> {
  const authUser = await getRequestUser(req)
  if (!authUser) return jsonError("Unauthorized", 401)

  const db = serviceClient()
  const me = await loadPerson(db, authUser.id)
  if (!me || !me.tenant_id) return jsonError("Your account is not set up. Ask your administrator.", 403)

  const { data: tenant } = await db
    .from("tenants")
    .select("id, name, slug, status")
    .eq("id", me.tenant_id)
    .maybeSingle()
  if (!tenant) return jsonError("Your account is not set up. Ask your administrator.", 403)
  if (tenant.status !== "active" && me.role !== "superadmin") {
    return jsonError("Your organisation's access is suspended. Contact your provider.", 403)
  }

  if (opts.roles && !opts.roles.includes(me.role)) return jsonError("You don't have permission to do that", 403)

  return { db, me, tenant: tenant as Tenant }
}

/** Whether `me` may act on data of `tenantId`: same tenant, or a super admin. */
export function inTenant(me: Pick<Person, "role" | "tenant_id">, tenantId: string | null | undefined): boolean {
  if (me.role === "superadmin") return true
  return !!tenantId && me.tenant_id === tenantId
}

/** Whether an IT team member works the given ticket's tenant. */
export function staffCoversTicket(
  staff: Pick<Person, "role" | "tenant_id">,
  ticket: { tenant_id: string | null | undefined }
): boolean {
  return isStaffRole(staff.role) && inTenant(staff, ticket.tenant_id)
}

/** Admin of that tenant, or a super admin. */
export function canAdministerTenant(me: Pick<Person, "role" | "tenant_id">, tenantId: string): boolean {
  if (me.role === "superadmin") return true
  return me.role === "admin" && me.tenant_id === tenantId
}

/**
 * The tenant a request acts in: the caller's own, or — for a super admin only —
 * the `tenant_id` they name. Returns null when a non-super-admin names another.
 */
export function targetTenant(me: Person, requested: unknown): string | null {
  const asked = typeof requested === "string" && requested ? requested : null
  if (!asked || asked === me.tenant_id) return me.tenant_id
  return me.role === "superadmin" ? asked : null
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

/** Trimmed string, or null when empty; cut to `max` characters. */
export function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  return v ? v.slice(0, max) : null
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
