import { NextResponse } from "next/server"
import { jsonError, text, UUID_RE } from "@/lib/ticket-server"
import { parseTicketTypes, requireTenantAdmin } from "@/lib/itsm-admin"

export const runtime = "nodejs"

/**
 * POST /api/admin/itsm/categories  (tenant admin, or super admin)
 * { name, parent_id?, ticket_types?, sort_order?, tenant_id? }
 * A category without parent_id is top level; with one it is a sub-category.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ctx = await requireTenantAdmin(req, body.tenant_id)
    if (ctx instanceof Response) return ctx
    const { db, tenantId } = ctx

    const name = text(body.name, 100)
    if (!name) return jsonError("A name is required", 400)
    const types = parseTicketTypes(body.ticket_types)
    if (types === false) return jsonError("Unknown record type in ticket_types", 400)

    let parentId: string | null = null
    if (body.parent_id) {
      if (!UUID_RE.test(body.parent_id)) return jsonError("Parent category not found", 404)
      const { data: parent } = await db
        .from("ticket_categories")
        .select("id, tenant_id, parent_id")
        .eq("id", body.parent_id)
        .maybeSingle()
      if (!parent || parent.tenant_id !== tenantId) return jsonError("Parent category not found", 404)
      if (parent.parent_id) return jsonError("Sub-categories cannot have their own sub-categories", 400)
      parentId = parent.id
    }

    let sortOrder = Number.isInteger(body.sort_order) ? body.sort_order : null
    if (sortOrder === null) {
      let q = db.from("ticket_categories").select("sort_order").eq("tenant_id", tenantId)
      q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null)
      const { data: last } = await q.order("sort_order", { ascending: false }).limit(1)
      sortOrder = (last?.[0]?.sort_order ?? 0) + 1
    }

    const { data, error } = await db
      .from("ticket_categories")
      .insert({
        tenant_id: tenantId,
        parent_id: parentId,
        name,
        ticket_types: parentId ? null : types,
        sort_order: sortOrder,
      })
      .select("id, parent_id, name, ticket_types, sort_order, is_active")
      .single()
    if (error) {
      if (error.code === "23505") return jsonError("A category with this name already exists here", 409)
      throw error
    }
    return NextResponse.json({ category: data })
  } catch (err) {
    console.error("Category create failed:", err)
    return jsonError("Internal server error", 500)
  }
}
