import { NextResponse } from "next/server"
import { EMAIL_RE, jsonError, requireActor, text } from "@/lib/ticket-server"
import { invitePerson, InviteError } from "@/lib/invite"
import { fetchAllRows } from "@/lib/fetch-all-rows"

export const runtime = "nodejs"

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/

/**
 * GET /api/admin/tenants  (super admin)
 * Every tenant with its member and ticket counts.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db } = ctx

    const { data: tenants, error } = await db
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .order("name")
    if (error) throw error

    const { data: members } = await fetchAllRows<{ tenant_id: string; role: string }>((from, to) =>
      db.from("users").select("tenant_id, role, id").order("id").range(from, to)
    )

    const rows = await Promise.all(
      (tenants ?? []).map(async (t) => {
        const mine = members.filter((m) => m.tenant_id === t.id)
        const [{ count: tickets }, { count: openTickets }] = await Promise.all([
          db.from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
          db
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", t.id)
            .neq("status", "closed"),
        ])
        return {
          ...t,
          members: mine.length,
          admins: mine.filter((m) => m.role === "admin").length,
          engineers: mine.filter((m) => m.role === "engineer").length,
          tickets: tickets ?? 0,
          open_tickets: openTickets ?? 0,
        }
      })
    )

    return NextResponse.json({ tenants: rows })
  } catch (err) {
    console.error("Tenant list failed:", err)
    return jsonError("Internal server error", 500)
  }
}

/**
 * POST /api/admin/tenants  (super admin)
 * { name, slug, admin_email, admin_name }
 * Creates the tenant and invites its first admin.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const name = text(body.name, 120)
    const slug = String(body.slug ?? "").trim().toLowerCase()
    const adminEmail = String(body.admin_email ?? "").trim().toLowerCase()
    const adminName = text(body.admin_name, 120)

    if (!name) return jsonError("A tenant name is required", 400)
    if (!SLUG_RE.test(slug)) {
      return jsonError("The short name may use lowercase letters, numbers and dashes (2–63 characters)", 400)
    }
    if (!EMAIL_RE.test(adminEmail) || !adminName) {
      return jsonError("The first admin's name and a valid email are required", 400)
    }

    const { data: tenant, error } = await db
      .from("tenants")
      .insert({ name, slug, status: "active", created_by: me.id })
      .select("id, name, slug, status, created_at")
      .single()
    if (error) {
      if (error.code === "23505") return jsonError("That short name is already taken", 409)
      throw error
    }

    try {
      const invited = await invitePerson(db, {
        email: adminEmail,
        fullName: adminName,
        role: "admin",
        tenant,
        inviter: me,
      })
      return NextResponse.json({ tenant, admin: invited.user, emailed: invited.emailed, emailError: invited.emailError })
    } catch (err) {
      // No admin, no tenant: undo so the super admin can simply try again
      await db.from("tenants").delete().eq("id", tenant.id)
      if (err instanceof InviteError) return jsonError(err.message, err.status)
      throw err
    }
  } catch (err) {
    console.error("Tenant create failed:", err)
    return jsonError("Internal server error", 500)
  }
}
