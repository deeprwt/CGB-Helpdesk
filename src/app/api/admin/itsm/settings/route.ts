import { NextResponse } from "next/server"
import { jsonError } from "@/lib/ticket-server"
import { requireTenantAdmin } from "@/lib/itsm-admin"
import { isValidTimeZone } from "@/lib/itsm"

export const runtime = "nodejs"

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * PUT /api/admin/itsm/settings  (tenant admin, or super admin)
 * { tenant_id?, timezone, work_days: [0..6], work_start: "HH:MM", work_end: "HH:MM", holidays: ["YYYY-MM-DD"] }
 * The working calendar used by SLA policies set to "business hours".
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ctx = await requireTenantAdmin(req, body.tenant_id)
    if (ctx instanceof Response) return ctx
    const { db, tenantId } = ctx

    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : ""
    if (!timezone || !isValidTimeZone(timezone)) return jsonError("Choose a valid time zone (e.g. Asia/Kolkata)", 400)

    const days = Array.isArray(body.work_days) ? [...new Set(body.work_days)] : []
    if (!days.length || !days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
      return jsonError("Pick at least one working day", 400)
    }

    const start = String(body.work_start ?? "")
    const end = String(body.work_end ?? "")
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return jsonError("Working hours must look like 09:00", 400)
    if (end <= start) return jsonError("The working day must end after it starts", 400)

    const holidays = Array.isArray(body.holidays) ? [...new Set(body.holidays)] : []
    if (holidays.length > 366) return jsonError("Too many holidays", 400)
    for (const h of holidays) {
      if (typeof h !== "string" || !DATE_RE.test(h) || Number.isNaN(new Date(`${h}T00:00:00Z`).getTime())) {
        return jsonError(`Not a date: ${String(h)}`, 400)
      }
    }

    const { error } = await db.from("tenant_settings").upsert(
      {
        tenant_id: tenantId,
        timezone,
        work_days: (days as number[]).sort(),
        work_start: start,
        work_end: end,
        holidays: (holidays as string[]).sort(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    )
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Business hours save failed:", err)
    return jsonError("Internal server error", 500)
  }
}
