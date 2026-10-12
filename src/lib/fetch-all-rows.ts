import type { PostgrestError } from "@supabase/supabase-js"

/**
 * Supabase caps every request at the project's "Max rows" setting
 * (1000 by default), so a plain `.select()` silently truncates.
 * This pages through with `.range()` until an empty page comes back.
 *
 * The query MUST have a stable, unique order (e.g. end with `.order("id")`),
 * otherwise rows can repeat or be skipped between pages.
 *
 * Usage:
 *   const { data, error } = await fetchAllRows((from, to) =>
 *     supabase.from("assets").select("*").order("id").range(from, to)
 *   )
 */
export async function fetchAllRows<T>(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = []

  for (let from = 0; ; ) {
    const { data, error } = await query(from, from + pageSize - 1)
    if (error) return { data: rows, error }
    if (!data || data.length === 0) return { data: rows, error: null }

    rows.push(...data)
    // Advance by what actually came back, in case the server cap is lower
    from += data.length
  }
}
