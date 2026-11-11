// Server-only: validating and saving assets for the /api/assets routes.

import type { SupabaseClient } from "@supabase/supabase-js"
import { text, UUID_RE } from "@/lib/ticket-server"

export const ASSET_STATUSES = ["in_use", "spare", "retired"] as const
export const DETAIL_KEYS = ["serial_no", "cpu", "ram", "storage", "os_name", "mac_address", "vendor"] as const

export class AssetError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function date(value: unknown): string | null {
  const v = text(value, 10)
  if (!v) return null
  if (!DATE_RE.test(v)) throw new AssetError(400, `"${v}" is not a date (use YYYY-MM-DD)`)
  return v
}

/** Fields of the `assets` row from a request body (only those present when `partial`). */
export function assetFields(input: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {}
  const has = (k: string) => input[k] !== undefined

  if (!partial || has("asset_code")) {
    const code = text(input.asset_code, 64)
    if (!code) throw new AssetError(400, "An asset code is required")
    out.asset_code = code
  }
  if (!partial || has("asset_type")) out.asset_type = text(input.asset_type, 100)
  if (!partial || has("model")) out.model = text(input.model, 200) ?? ""
  if (!partial || has("location")) out.location = text(input.location, 200)
  if (!partial || has("department")) out.department = text(input.department, 200) ?? ""
  if (!partial || has("purchase_date")) out.purchase_date = date(input.purchase_date)
  if (!partial || has("warranty_expiry")) out.warranty_expiry = date(input.warranty_expiry)
  if (!partial || has("status")) {
    const status = String(input.status ?? "in_use")
    if (!(ASSET_STATUSES as readonly string[]).includes(status)) {
      throw new AssetError(400, "Status must be in_use, spare or retired")
    }
    out.status = status
  }
  return out
}

/** Asset codes are unique per tenant, ignoring case and surrounding spaces. */
export async function assertCodeFree(db: SupabaseClient, tenantId: string, code: string, exceptId?: string) {
  let q = db
    .from("assets")
    .select("id, asset_code")
    .eq("tenant_id", tenantId)
    .ilike("asset_code", code.trim().replace(/[\\%_]/g, (c) => `\\${c}`))
    .limit(1)
  if (exceptId) q = q.neq("id", exceptId)
  const { data } = await q
  if (data?.length) {
    throw new AssetError(409, `Asset code ${data[0].asset_code} is already used by another asset`, "duplicate_code")
  }
}

/** The client company to file the asset under: by id, or (imports) by name. */
export async function resolveCompany(
  db: SupabaseClient,
  tenantId: string,
  input: Record<string, unknown>
): Promise<string | null | undefined> {
  if (input.organization_id !== undefined) {
    const id = text(input.organization_id, 64)
    if (!id) return null
    if (!UUID_RE.test(id)) throw new AssetError(400, "Company not found")
    const { data } = await db.from("organizations").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle()
    if (!data) throw new AssetError(400, "Company not found")
    return id
  }
  const name = text(input.company_name, 120)
  if (!name) return undefined
  const { data } = await db
    .from("organizations")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`))
    .limit(1)
  if (!data?.length) throw new AssetError(400, `No company called "${name}"`)
  return data[0].id
}

/** The person to assign it to: by id, or (imports) by email. Must be in the tenant. */
export async function resolveAssignee(
  db: SupabaseClient,
  tenantId: string,
  input: Record<string, unknown>
): Promise<string | null | undefined> {
  if (input.assigned_user_id !== undefined) {
    const id = text(input.assigned_user_id, 64)
    if (!id) return null
    const { data } = await db.from("users").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle()
    if (!data) throw new AssetError(400, "The person to assign to was not found")
    return id
  }
  const email = text(input.assigned_user_email, 254)?.toLowerCase()
  if (!email) return undefined
  const { data } = await db.from("users").select("id").eq("email", email).eq("tenant_id", tenantId).maybeSingle()
  if (!data) throw new AssetError(400, `No member with the email ${email}`)
  return data.id
}

/** Replaces the asset's detail rows with the given values (empty ones dropped). */
export async function saveDetails(
  db: SupabaseClient,
  tenantId: string,
  assetId: string,
  details: unknown,
  replace: boolean
) {
  if (!details || typeof details !== "object") return
  const values = details as Record<string, unknown>
  const rows = DETAIL_KEYS.map((key) => ({ key, value: text(values[key], 200) }))
    .filter((r) => r.value)
    .map((r) => ({ tenant_id: tenantId, asset_id: assetId, key: r.key, value: r.value }))

  if (replace) {
    const { error } = await db.from("asset_details").delete().eq("asset_id", assetId)
    if (error) throw error
  }
  if (rows.length) {
    const { error } = await db.from("asset_details").insert(rows)
    if (error) throw error
  }
}

/**
 * Assigns the asset to `userId` (null: nobody). The previous holder's
 * assignment is closed with `returned_at`, so the history is kept.
 */
export async function saveAssignment(
  db: SupabaseClient,
  tenantId: string,
  assetId: string,
  userId: string | null,
  assignedBy: string
) {
  const { data: open } = await db
    .from("asset_assignments")
    .select("id, user_id")
    .eq("asset_id", assetId)
    .is("returned_at", null)

  if (userId && open?.length === 1 && open[0].user_id === userId) return

  if (open?.length) {
    const { error } = await db
      .from("asset_assignments")
      .update({ returned_at: new Date().toISOString() })
      .in("id", open.map((a) => a.id))
    if (error) throw error
  }

  if (userId) {
    const { error } = await db.from("asset_assignments").insert({
      tenant_id: tenantId,
      asset_id: assetId,
      user_id: userId,
      assigned_by: assignedBy,
    })
    if (error) throw error
  }
}

/** Deletes assets (and their details and assignments) of one tenant, or any for a super admin. */
export async function deleteAssets(db: SupabaseClient, ids: string[], tenantId: string | null) {
  let q = db.from("assets").select("id").in("id", ids)
  if (tenantId) q = q.eq("tenant_id", tenantId)
  const { data: found, error: findError } = await q
  if (findError) throw findError
  const ok = (found ?? []).map((a) => a.id)
  if (!ok.length) return 0

  for (const table of ["asset_assignments", "asset_details"]) {
    const { error } = await db.from(table).delete().in("asset_id", ok)
    if (error) throw error
  }
  const { error } = await db.from("assets").delete().in("id", ok)
  if (error) {
    throw new AssetError(409, "Some of these assets are linked to tickets and can't be deleted. Retire them instead.")
  }
  return ok.length
}
