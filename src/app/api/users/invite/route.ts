import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { canAdministerTenant, EMAIL_RE, jsonError, requireActor, targetTenant, text } from "@/lib/ticket-server"
import { INVITE_ROLES, invitePerson, InviteError, resendInvite, type InviteRole } from "@/lib/invite"

export const runtime = "nodejs"

async function tenantRow(db: SupabaseClient, id: string) {
  const { data } = await db.from("tenants").select("id, name, slug, status").eq("id", id).maybeSingle()
  return data
}

/**
 * POST /api/users/invite  (tenant admin, or super admin)
 * { email, full_name, role: "user"|"engineer"|"admin", organization_id?, tenant_id? }
 * `tenant_id` is honoured for super admins only; admins invite into their own tenant.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? "").trim().toLowerCase()
    const fullName = text(body.full_name, 120)
    const role = String(body.role ?? "user") as InviteRole
    const organizationId = text(body.organization_id, 64)

    if (!EMAIL_RE.test(email)) return jsonError("Enter a valid email address", 400)
    if (!fullName) return jsonError("Enter the person's name", 400)
    if (!INVITE_ROLES.includes(role)) return jsonError("Choose User, Engineer or Admin", 400)

    const tenantId = targetTenant(me, body.tenant_id)
    if (!tenantId || !canAdministerTenant(me, tenantId)) return jsonError("Organisation not found", 404)
    const tenant = await tenantRow(db, tenantId)
    if (!tenant) return jsonError("Organisation not found", 404)

    const result = await invitePerson(db, { email, fullName, role, tenant, organizationId, inviter: me })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof InviteError) return jsonError(err.message, err.status)
    console.error("Invite failed:", err)
    return jsonError("Internal server error", 500)
  }
}

/**
 * PUT /api/users/invite  { user_id }
 * Sends a fresh "set your password" link to a member who never signed in.
 */
export async function PUT(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const userId = text(body.user_id, 64)
    if (!userId) return jsonError("Missing user_id", 400)

    const { data: person } = await db.from("users").select("tenant_id").eq("id", userId).maybeSingle()
    if (!person || !canAdministerTenant(me, person.tenant_id)) return jsonError("Member not found", 404)
    const tenant = await tenantRow(db, person.tenant_id)
    if (!tenant) return jsonError("Member not found", 404)

    await resendInvite(db, { userId, tenant, inviter: me })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof InviteError) return jsonError(err.message, err.status)
    console.error("Resend invite failed:", err)
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
