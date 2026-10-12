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
 * Pages through the table because Supabase caps a single response (1000 rows by default).
 */
export async function fetchExistingAssetCodes(): Promise<Map<string, string>> {
  const PAGE = 1000
  const codes = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("assets")
      .select("asset_code")
      .order("asset_code", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data ?? []) {
      const key = assetCodeKey(row.asset_code)
      if (key && !codes.has(key)) codes.set(key, row.asset_code)
    }
    if (!data || data.length < PAGE) break
  }
  return codes
}

/** Returns the asset already using `code` (case-insensitive), ignoring `excludeId`. */
export async function findAssetByCode(code: string, excludeId?: string) {
  let query = supabase
    .from("assets")
    .select("id, asset_code")
    .ilike("asset_code", escapeLike(code.trim()))
    .limit(1)
  if (excludeId) query = query.neq("id", excludeId)
  const { data, error } = await query
  if (error) throw error
  return data?.[0] ?? null
}

/** Postgres unique-violation code, returned if the database enforces unique asset codes. */
export const UNIQUE_VIOLATION = "23505"
