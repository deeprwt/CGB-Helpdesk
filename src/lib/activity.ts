import { supabase } from "@/lib/supabaseClient"

export type ActivityAction =
  | "created"
  | "acquired"
  | "closed"
  | "hold"
  | "reopened"
  | "reassigned"
  | "sla_response_breach"
  | "sla_resolution_breach"

/**
 * Logs a ticket activity via the API route.
 * Non-blocking — failures are silently caught.
 */
export async function logActivity(params: {
  ticket_id: string
  actor_id: string
  action: ActivityAction
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return

    await fetch("/api/activity/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    })
  } catch {
    // Non-blocking
  }
}
