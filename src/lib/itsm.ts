/**
 * ITSM vocabulary and SLA clock maths. Safe to import in the browser and on the server.
 */

/* ── Record types ─────────────────────────────────────────────────────────── */

export const TICKET_TYPES = ["incident", "service_request", "problem", "change"] as const
export type TicketType = (typeof TICKET_TYPES)[number]

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  incident: "Incident",
  service_request: "Service Request",
  problem: "Problem",
  change: "Change",
}

export const TICKET_TYPE_PREFIX: Record<TicketType, string> = {
  incident: "INC",
  service_request: "REQ",
  problem: "PRB",
  change: "CHG",
}

/** What a requester (non-staff) may raise. Problems and changes are raised by the IT team. */
export const REQUESTER_TICKET_TYPES: readonly TicketType[] = ["incident", "service_request"]

export function isTicketType(v: unknown): v is TicketType {
  return typeof v === "string" && (TICKET_TYPES as readonly string[]).includes(v)
}

/* ── Classification ───────────────────────────────────────────────────────── */

export const LEVELS = ["low", "medium", "high"] as const
export type Level = (typeof LEVELS)[number]

export const PRIORITIES = ["low", "medium", "high", "critical"] as const
export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "P1 · Critical",
  high: "P2 · High",
  medium: "P3 · Medium",
  low: "P4 · Low",
}

export const IMPACT_LABELS: Record<Level, string> = {
  high: "High: many people or a whole site",
  medium: "Medium: a team or department",
  low: "Low: one person",
}

export const URGENCY_LABELS: Record<Level, string> = {
  high: "High: work has stopped",
  medium: "Medium: work is slowed down",
  low: "Low: can wait",
}

export const CHANGE_TYPES = ["standard", "normal", "emergency"] as const
export type ChangeType = (typeof CHANGE_TYPES)[number]

export const LINK_TYPES = ["related", "caused_by", "duplicate_of", "implements"] as const
export type LinkType = (typeof LINK_TYPES)[number]

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  related: "Related to",
  caused_by: "Caused by",
  duplicate_of: "Duplicate of",
  implements: "Implemented by change",
}

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v)
}
export function isPriority(v: unknown): v is Priority {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v)
}

export type MatrixCell = { impact: Level; urgency: Level; priority: Priority }

/** Priority from the tenant's matrix; the ITIL default when a cell is missing. */
export function priorityFromMatrix(matrix: MatrixCell[], impact: Level, urgency: Level): Priority {
  const cell = matrix.find((c) => c.impact === impact && c.urgency === urgency)
  if (cell) return cell.priority
  const score = LEVELS.indexOf(impact) + LEVELS.indexOf(urgency) // 0..4
  return (["low", "low", "medium", "high", "critical"] as const)[score]
}

/** Short display reference for a ticket: its number, or the old id stub for rows without one. */
export function ticketRef(t: { number?: string | null; id: string }): string {
  return t.number || `#${t.id.slice(0, 8).toUpperCase()}`
}

/* ── SLA policies and the business-hours clock ────────────────────────────── */

export type SlaPolicy = {
  id?: string
  ticket_type: TicketType | null
  priority: Priority
  response_minutes: number
  resolution_minutes: number
  business_hours: boolean
}

/** The tenant's working calendar. */
export type WorkCalendar = {
  timezone: string
  /** 0 = Sunday … 6 = Saturday */
  work_days: number[]
  /** "HH:MM" or "HH:MM:SS" */
  work_start: string
  work_end: string
  /** "YYYY-MM-DD" in the tenant's time zone */
  holidays: string[]
}

/** The policy for a ticket: one for its type, else the tenant default (no type). */
export function pickPolicy(policies: SlaPolicy[], type: TicketType, priority: Priority): SlaPolicy | null {
  return (
    policies.find((p) => p.ticket_type === type && p.priority === priority) ??
    policies.find((p) => p.ticket_type === null && p.priority === priority) ??
    null
  )
}

const MINUTE = 60_000
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
    formatters.set(tz, f)
  }
  return f
}

/** Wall-clock parts of an instant in a time zone. */
function zoned(ms: number, tz: string) {
  const parts: Record<string, string> = {}
  for (const p of formatter(tz).formatToParts(new Date(ms))) parts[p.type] = p.value
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    mi: Number(parts.minute),
    s: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  }
}

/** How far the zone is ahead of UTC at an instant, in ms. */
function offsetAt(ms: number, tz: string) {
  const z = zoned(ms, tz)
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s) - Math.floor(ms / 1000) * 1000
}

/** The instant a wall-clock time happens in a time zone. */
function wallToInstant(y: number, m: number, d: number, h: number, mi: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = guess - offsetAt(guess, tz)
  return guess - offsetAt(first, tz)
}

function hm(v: string) {
  const [h, m] = v.split(":").map(Number)
  return { h: h || 0, m: m || 0 }
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** Working windows [start, end) as instants, one per day from the day containing `fromMs`. */
function* workWindows(fromMs: number, cal: WorkCalendar) {
  const tz = isValidTimeZone(cal.timezone) ? cal.timezone : "UTC"
  const start = hm(cal.work_start)
  const end = hm(cal.work_end)
  const days = new Set(cal.work_days)
  const holidays = new Set(cal.holidays)
  const first = zoned(fromMs, tz)
  // Walk calendar dates; Date.UTC normalises overflowing days into months/years.
  for (let i = 0; i < 3700; i++) {
    const day = new Date(Date.UTC(first.y, first.m - 1, first.d + i))
    const y = day.getUTCFullYear()
    const m = day.getUTCMonth() + 1
    const d = day.getUTCDate()
    if (!days.has(day.getUTCDay())) continue
    if (holidays.has(`${y}-${pad(m)}-${pad(d)}`)) continue
    yield {
      start: wallToInstant(y, m, d, start.h, start.m, tz),
      end: wallToInstant(y, m, d, end.h, end.m, tz),
    }
  }
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function hasWorkingTime(cal: WorkCalendar) {
  return cal.work_days.length > 0 && hm(cal.work_end).h * 60 + hm(cal.work_end).m > hm(cal.work_start).h * 60 + hm(cal.work_start).m
}

/**
 * The instant `minutes` of SLA time after `from`.
 * Without a calendar the clock runs around the clock; with one it only runs in working hours.
 */
export function addSlaMinutes(from: Date, minutes: number, cal: WorkCalendar | null): Date {
  const fromMs = from.getTime()
  if (!cal || !hasWorkingTime(cal)) return new Date(fromMs + minutes * MINUTE)
  let remaining = Math.max(0, minutes) * MINUTE
  for (const w of workWindows(fromMs, cal)) {
    const begin = Math.max(w.start, fromMs)
    if (begin >= w.end) continue
    const available = w.end - begin
    if (remaining <= available) return new Date(begin + remaining)
    remaining -= available
  }
  // Calendar with (almost) no working time: fall back to wall-clock time
  return new Date(fromMs + minutes * MINUTE)
}

/** SLA minutes that pass between two instants (0 if `to` is not after `from`). */
export function slaMinutesBetween(from: Date, to: Date, cal: WorkCalendar | null): number {
  const a = from.getTime()
  const b = to.getTime()
  if (b <= a) return 0
  if (!cal || !hasWorkingTime(cal)) return (b - a) / MINUTE
  let total = 0
  for (const w of workWindows(a, cal)) {
    if (w.start >= b) break
    const s = Math.max(w.start, a)
    const e = Math.min(w.end, b)
    if (e > s) total += e - s
  }
  return total / MINUTE
}

/** "1 h 30 min", "2 d 4 h", "15 min". */
export function formatMinutes(total: number): string {
  const m = Math.round(total)
  if (m < 60) return `${m} min`
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  return [d && `${d} d`, h && `${h} h`, !d && mm && `${mm} min`].filter(Boolean).join(" ") || "0 min"
}
