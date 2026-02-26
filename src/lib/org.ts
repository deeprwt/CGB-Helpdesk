import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Extracts the organisation domain from an email address.
 * e.g. "user@cgbindia.com" → "cgbindia.com"
 */
export function extractOrgDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? ""
}

/**
 * Returns the IDs of every user whose email belongs to `domain`.
 * Used for client-side multi-tenant filtering when Supabase RLS
 * is not yet enforcing org isolation at the DB level.
 *
 * Returns an empty array on failure so callers can handle it safely.
 */
export async function getOrgUserIds(
  supabase: SupabaseClient,
  domain: string
): Promise<string[]> {
  if (!domain) return []

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("email", `%@${domain}`)

  if (error) return []
  return (data ?? []).map((u: { id: string }) => u.id)
}
