import { NextResponse } from "next/server"
import { canAdministerTenant, jsonError, requireActor, targetTenant, text } from "@/lib/ticket-server"
import { cleanDomain } from "@/lib/companies"

export const runtime = "nodejs"

/**
 * POST /api/companies  (tenant admin, or super admin)
 * { name, domain?, tenant_id? }
 * Client companies are labels inside a tenant for grouping people and assets.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
    if (ctx instanceof Response) return ctx
    const { db, me } = ctx

    const body = await req.json().catch(() => ({}))
    const name = text(body.name, 120)
    const domain = cleanDomain(body.domain)
    if (!name) return jsonError("A company name is required", 400)
    if (domain === false) return jsonError("That doesn't look like a domain (e.g. example.com)", 400)

    const tenantId = targetTenant(me, body.tenant_id)
    if (!tenantId || !canAdministerTenant(me, tenantId)) return jsonError("Organisation not found", 404)
    if (tenantId !== me.tenant_id) {
      const { data: t } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle()
      if (!t) return jsonError("Organisation not found", 404)
    }

    const { data, error } = await db
      .from("organizations")
      .insert({ tenant_id: tenantId, name, domain, status: "active" })
      .select("id, name, domain, status, tenant_id, created_at")
      .single()
    if (error) {
      if (error.code === "23505") return jsonError("A company with this name already exists", 409)
      throw error
    }

    return NextResponse.json({ company: data })
  } catch (err) {
    console.error("Company create failed:", err)
    return jsonError("Internal server error", 500)
  }
}
