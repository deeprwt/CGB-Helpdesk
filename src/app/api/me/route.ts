import { NextResponse } from "next/server"
import { getRequestUser, loadPerson, serviceClient } from "@/lib/ticket-server"

export const runtime = "nodejs"

/**
 * GET /api/me
 * Whether the signed-in person can use the app:
 *   { status: "ok", role, tenant }
 *   { status: "suspended", tenant }   — their tenant is suspended (not for super admins)
 *   { status: "not_set_up" }          — no profile (removed, or never invited)
 * 401 when the session itself is invalid.
 */
export async function GET(req: Request) {
  const authUser = await getRequestUser(req)
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = serviceClient()
  const me = await loadPerson(db, authUser.id)
  if (!me?.tenant_id) return NextResponse.json({ status: "not_set_up" })

  const { data: tenant } = await db
    .from("tenants")
    .select("id, name, slug, status")
    .eq("id", me.tenant_id)
    .maybeSingle()
  if (!tenant) return NextResponse.json({ status: "not_set_up" })

  if (tenant.status !== "active" && me.role !== "superadmin") {
    return NextResponse.json({ status: "suspended", tenant: { name: tenant.name } })
  }
  return NextResponse.json({ status: "ok", role: me.role, tenant })
}
