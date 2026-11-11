import { supabase } from "@/lib/supabaseClient"

/**
 * Asset codes are compared ignoring surrounding spaces and letter case,
 * so "lap-001 " and "LAP-001" count as the same code.
 */
export function assetCodeKey(code: unknown): string {
  return String(code ?? "").trim().toUpperCase()
}

/** Escape LIKE wildcards so `_` / `%` in a code are matched literally. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * Every asset code the current user can see, keyed by `assetCodeKey`.
 * Codes are unique per tenant: pass `tenantId` to check against one tenant
 * (a super admin can read every tenant's assets). RLS already limits everyone else.
 * Pages through the table because Supabase caps a single response (1000 rows by default).
 */
export async function fetchExistingAssetCodes(tenantId?: string | null): Promise<Map<string, string>> {
  const PAGE = 1000
  const codes = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("assets")
      .select("asset_code")
      .order("asset_code", { ascending: true })
      .order("id")
      .range(from, from + PAGE - 1)
    if (tenantId) query = query.eq("tenant_id", tenantId)
    const { data, error } = await query
    if (error) throw error
    for (const row of data ?? []) {
      const key = assetCodeKey(row.asset_code)
      if (key && !codes.has(key)) codes.set(key, row.asset_code)
    }
    if (!data || data.length < PAGE) break
  }
  return codes
}

/**
 * Returns the asset already using `code` (case-insensitive), ignoring `excludeId`.
 * Pass `tenantId` to look in that tenant only (codes are unique per tenant).
 * This is only a friendly pre-check; the API enforces uniqueness (409 "duplicate_code").
 */
export async function findAssetByCode(code: string, excludeId?: string, tenantId?: string | null) {
  let query = supabase
    .from("assets")
    .select("id, asset_code")
    .ilike("asset_code", escapeLike(code.trim()))
    .limit(1)
  if (excludeId) query = query.neq("id", excludeId)
  if (tenantId) query = query.eq("tenant_id", tenantId)
  const { data, error } = await query
  if (error) throw error
  return data?.[0] ?? null
}

/** Error code the asset API returns (with HTTP 409) when an asset code is already taken. */
export const DUPLICATE_CODE = "duplicate_code"
