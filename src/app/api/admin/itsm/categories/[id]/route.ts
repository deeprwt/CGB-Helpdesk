import { NextResponse } from "next/server"
import { canAdministerTenant, jsonError, requireActor, text, UUID_RE } from "@/lib/ticket-server"
import { parseTicketTypes } from "@/lib/itsm-admin"

export const runtime = "nodejs"

async function load(req: Request, params: Promise<{ id: string }>) {
  const ctx = await requireActor(req, { roles: ["admin", "superadmin"] })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError("Category not found", 404)
  const { data: category } = await ctx.db
    .from("ticket_categories")
    .select("id, tenant_id, parent_id, name")
    .eq("id", id)
    .maybeSingle()
  if (!category || !canAdministerTenant(ctx.me, category.tenant_id)) return jsonError("Category not found", 404)
  return { ...ctx, category }
}

/**
 * PATCH /api/admin/itsm/categories/:id  { name?, is_active?, sort_order?, ticket_types? }
 * Renaming does not change tickets already filed under the old name.
 * Deactivating hides it from new tickets but keeps it on existing ones.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await load(req, params)
    if (ctx instanceof Response) return ctx
    const { db, category } = ctx

    const body = await req.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if ("name" in body) {
      const name = text(body.name, 100)
      if (!name) return jsonError("A name is required", 400)
      patch.name = name
    }
    if ("is_active" in body) patch.is_active = body.is_active === true
    if ("sort_order" in body) {
      if (!Number.isInteger(body.sort_order)) return jsonError("sort_order must be a whole number", 400)
      patch.sort_order = body.sort_order
    }
    if ("ticket_types" in body) {
      if (category.parent_id) return jsonError("Record types are set on the top-level category", 400)
      const types = parseTicketTypes(body.ticket_types)
      if (types === false) return jsonError("Unknown record type in ticket_types", 400)
      patch.ticket_types = types
    }
    if (Object.keys(patch).length === 0) return jsonError("Nothing to change", 400)

    const { data, error } = await db
      .from("ticket_categories")
      .update(patch)
      .eq("id", category.id)
      .select("id, parent_id, name, ticket_types, sort_order, is_active")
      .single()
    if (error) {
      if (error.code === "23505") return jsonError("A category with this name already exists here", 409)
      throw error
    }
    return NextResponse.json({ category: data })
  } catch (err) {
    console.error("Category update failed:", err)
    return jsonError("Internal server error", 500)
  }
}

/**
 * DELETE /api/admin/itsm/categories/:id
 * Removes it (and its sub-categories) from the list. Tickets keep the name they were filed under.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await load(req, params)
    if (ctx instanceof Response) return ctx
    const { error } = await ctx.db.from("ticket_categories").delete().eq("id", ctx.category.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Category delete failed:", err)
    return jsonError("Internal server error", 500)
  }
}
