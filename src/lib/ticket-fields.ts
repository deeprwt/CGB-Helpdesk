/** Parsing helpers for ticket fields shared by the create and update routes. */

/**
 * A change's planned window from two date strings. Both optional.
 * Send ISO strings with an offset (e.g. new Date(local).toISOString() in the browser):
 * a bare "YYYY-MM-DDTHH:MM" would be read in the server's time zone.
 */
export function plannedWindow(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
): { start: string | null; end: string | null } | { error: string } {
  const parse = (v: string | null | undefined) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const start = parse(startRaw)
  const end = parse(endRaw)
  if (start === undefined || end === undefined) return { error: "The planned start or end is not a valid date" }
  if (start && end && end <= start) return { error: "The planned end must be after the planned start" }
  return { start: start?.toISOString() ?? null, end: end?.toISOString() ?? null }
}
