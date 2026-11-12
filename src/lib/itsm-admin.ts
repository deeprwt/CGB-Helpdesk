import type { SupabaseClient } from "@supabase/supabase-js"
import { canAdministerTenant, jsonError, requireActor, targetTenant, type Actor } from "@/lib/ticket-server"
import { TICKET_TYPES } from "@/lib/itsm"

/**
 * For the ITSM settings routes: the signed-in tenant admin (or super admin) and
 * the tenant they are configuring (`tenant_id` in the body or query; super admin only
 * for other tenants). Returns a Response on refusal.
 */
export async function requireTenantAdmin(
  req: Request,
  requestedTenant: unknown
): Promise<(Actor & { tenantId: string }) | Response> {
  const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
  if (ctx instanceof Response) return ctx
  const tenantId = targetTenant(ctx.me, requestedTenant)
  if (!tenantId || !canAdministerTenant(ctx.me, tenantId)) return jsonError("Organisation not found", 404)
  if (tenantId !== ctx.me.tenant_id && !(await tenantExists(ctx.db, tenantId))) {
    return jsonError("Organisation not found", 404)
  }
  return { ...ctx, tenantId }
}

/** `ticket_types`: null/empty/all = every type; otherwise a list of known types. false = invalid. */
export function parseTicketTypes(v: unknown): string[] | null | false {
  if (v === undefined || v === null) return null
  if (!Array.isArray(v)) return false
  const list = [...new Set(v)]
  if (!list.every((t) => (TICKET_TYPES as readonly string[]).includes(t as string))) return false
  return list.length === 0 || list.length === TICKET_TYPES.length ? null : (list as string[])
}

async function tenantExists(db: SupabaseClient, id: string) {
  const { data } = await db.from("tenants").select("id").eq("id", id).maybeSingle()
  return !!data
}
