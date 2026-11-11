import { text } from "@/lib/ticket-server"

/**
 * Optional email domain for a client company, kept as information only (never
 * used for access). Returns null when empty, false when it is not a domain.
 */
export function cleanDomain(value: unknown): string | null | false {
  const d = text(value, 253)?.toLowerCase().replace(/^@/, "") ?? null
  if (d === null) return null
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : false
}
