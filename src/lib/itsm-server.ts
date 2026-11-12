import type { SupabaseClient } from "@supabase/supabase-js"
import {
  addSlaMinutes,
  isLevel,
  isPriority,
  pickPolicy,
  priorityFromMatrix,
  slaMinutesBetween,
  type Level,
  type MatrixCell,
  type Priority,
  type SlaPolicy,
  type TicketType,
  type WorkCalendar,
} from "@/lib/itsm"

/** Today's behaviour, used when a tenant has no policy for a priority. */
export const FALLBACK_POLICY: Omit<SlaPolicy, "priority"> = {
  ticket_type: null,
  response_minutes: 15,
  resolution_minutes: 360,
  business_hours: false,
}

export type CategoryRow = {
  id: string
  parent_id: string | null
  name: string
  ticket_types: TicketType[] | null
  sort_order: number
  is_active: boolean
}

export type ItsmConfig = {
  categories: CategoryRow[]
  matrix: MatrixCell[]
  policies: SlaPolicy[]
  calendar: WorkCalendar
}

const DEFAULT_CALENDAR: WorkCalendar = {
  timezone: "Asia/Kolkata",
  work_days: [1, 2, 3, 4, 5],
  work_start: "09:00",
  work_end: "18:00",
  holidays: [],
}

/** A tenant's categories, priority matrix, SLA policies and working calendar. */
export async function loadItsmConfig(db: SupabaseClient, tenantId: string): Promise<ItsmConfig> {
  const [cats, matrix, policies, settings] = await Promise.all([
    db
      .from("ticket_categories")
      .select("id, parent_id, name, ticket_types, sort_order, is_active")
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name"),
    db.from("priority_matrix").select("impact, urgency, priority").eq("tenant_id", tenantId),
    db
      .from("sla_policies")
      .select("id, ticket_type, priority, response_minutes, resolution_minutes, business_hours")
      .eq("tenant_id", tenantId),
    db
      .from("tenant_settings")
      .select("timezone, work_days, work_start, work_end, holidays")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ])
  for (const r of [cats, matrix, policies, settings]) if (r.error) throw r.error

  return {
    categories: (cats.data ?? []) as CategoryRow[],
    matrix: (matrix.data ?? []) as MatrixCell[],
    policies: (policies.data ?? []) as SlaPolicy[],
    calendar: settings.data ? (settings.data as WorkCalendar) : DEFAULT_CALENDAR,
  }
}

/** Fills in categories, matrix, SLA policies and settings for a new tenant. */
export async function seedTenantDefaults(db: SupabaseClient, tenantId: string) {
  const { error } = await db.rpc("seed_tenant_itsm_defaults", { _tenant: tenantId })
  if (error) throw error
}

/**
 * Checks a category / sub-category pair against the tenant's active categories.
 * Returns the canonical names, or an error message.
 */
export function checkCategory(
  config: ItsmConfig,
  type: TicketType,
  category: string | null,
  subCategory: string | null
): { category: string | null; subCategory: string | null } | { error: string } {
  if (!category) return subCategory ? { error: "Choose a category first" } : { category: null, subCategory: null }
  const offered = (c: CategoryRow) => c.is_active && (!c.ticket_types || c.ticket_types.includes(type))
  const parent = config.categories.find(
    (c) => !c.parent_id && offered(c) && c.name.toLowerCase() === category.toLowerCase()
  )
  if (!parent) return { error: "That category is not available" }
  if (!subCategory) return { category: parent.name, subCategory: null }
  const sub = config.categories.find(
    (c) => c.parent_id === parent.id && c.is_active && c.name.toLowerCase() === subCategory.toLowerCase()
  )
  if (!sub) return { error: "That sub category is not in the category you chose" }
  return { category: parent.name, subCategory: sub.name }
}

/**
 * Priority from impact and urgency (via the matrix). Staff may override it;
 * without impact/urgency a given priority is kept (older clients send only that).
 */
export function resolvePriority(
  config: ItsmConfig,
  input: { impact?: unknown; urgency?: unknown; priority?: unknown },
  allowOverride: boolean
): { impact: Level | null; urgency: Level | null; priority: Priority } {
  const impact = isLevel(input.impact) ? input.impact : null
  const urgency = isLevel(input.urgency) ? input.urgency : null
  const given = isPriority(input.priority) ? input.priority : null
  if (impact && urgency) {
    const fromMatrix = priorityFromMatrix(config.matrix, impact, urgency)
    return { impact, urgency, priority: allowOverride && given ? given : fromMatrix }
  }
  return { impact, urgency, priority: given ?? "medium" }
}

export function policyFor(config: ItsmConfig, type: TicketType, priority: Priority): SlaPolicy {
  return pickPolicy(config.policies, type, priority) ?? { ...FALLBACK_POLICY, priority }
}

/** The calendar a policy runs on: business hours, or around the clock (null). */
export function clockFor(config: ItsmConfig, policy: { business_hours: boolean }): WorkCalendar | null {
  return policy.business_hours ? config.calendar : null
}

/** Response and resolution deadlines for a ticket raised (or re-classified) at `from`. */
export function slaDeadlines(config: ItsmConfig, type: TicketType, priority: Priority, from: Date) {
  const policy = policyFor(config, type, priority)
  const clock = clockFor(config, policy)
  return {
    policy,
    sla_business_hours: policy.business_hours,
    sla_response_at: addSlaMinutes(from, policy.response_minutes, clock).toISOString(),
    sla_resolution_at: addSlaMinutes(from, policy.resolution_minutes, clock).toISOString(),
  }
}

/**
 * New resolution deadline after a hold: the SLA time that was left when the
 * hold started is given back from now. An already-missed deadline stays missed.
 */
export function deadlineAfterHold(
  config: ItsmConfig,
  ticket: { sla_resolution_at: string | null; hold_started_at: string | null; sla_business_hours?: boolean | null },
  now: Date
): string | null {
  if (!ticket.sla_resolution_at || !ticket.hold_started_at) return ticket.sla_resolution_at
  const deadline = new Date(ticket.sla_resolution_at)
  const holdStart = new Date(ticket.hold_started_at)
  if (deadline <= holdStart) return ticket.sla_resolution_at
  const clock = ticket.sla_business_hours ? config.calendar : null
  const left = slaMinutesBetween(holdStart, deadline, clock)
  return addSlaMinutes(now, left, clock).toISOString()
}
