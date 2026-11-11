import { NextResponse } from "next/server"
import { canAdministerTenant, jsonError, requireActor, text, UUID_RE } from "@/lib/ticket-server"
import { cleanDomain } from "@/lib/companies"

export const runtime = "nodejs"

async function load(req: Request, params: Promise<{ id: string }>) {
  const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError("Company not found", 404)
  const { data: company } = await ctx.db
    .from("organizations")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle()
  if (!company || !canAdministerTenant(ctx.me, company.tenant_id)) return jsonError("Company not found", 404)
  return { ...ctx, company }
}

/** PATCH /api/companies/:id  { name?, domain?, status?: "active"|"inactive" } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await load(req, params)
    if (ctx instanceof Response) return ctx

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = text(body.name, 120)
      if (!name) return jsonError("A company name is required", 400)
      patch.name = name
    }
    if (body.domain !== undefined) {
      const domain = cleanDomain(body.domain)
      if (domain === false) return jsonError("That doesn't look like a domain (e.g. example.com)", 400)
      patch.domain = domain
    }
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "inactive") return jsonError("Invalid status", 400)
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return jsonError("Nothing to change", 400)

    const { data, error } = await ctx.db
      .from("organizations")
      .update(patch)
      .eq("id", ctx.company.id)
      .select("id, name, domain, status, tenant_id, created_at")
      .single()
    if (error) {
      if (error.code === "23505") return jsonError("A company with this name already exists", 409)
      throw error
    }
    return NextResponse.json({ company: data })
  } catch (err) {
    console.error("Company update failed:", err)
    return jsonError("Internal server error", 500)
  }
}

/** DELETE /api/companies/:id — people and assets keep existing, unlinked from it. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await load(req, params)
    if (ctx instanceof Response) return ctx

    const { error } = await ctx.db.from("organizations").delete().eq("id", ctx.company.id)
    if (error) {
      console.error("Company delete failed:", error)
      return jsonError("This company is still in use and can't be deleted", 409)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Company delete failed:", err)
    return jsonError("Internal server error", 500)
  }
}
