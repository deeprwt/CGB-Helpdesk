import { supabase } from "@/lib/supabaseClient"

export type NotificationType =
  | "message"
  | "acquired"
  | "closed"
  | "hold"
  | "status_changed"

/**
 * Sends a notification via the /api/notifications/create route.
 * Uses the current user's session token to authenticate.
 * Silently skips if the recipient is the same as the actor.
 */
export async function sendNotification(params: {
  user_id: string      // recipient
  actor_id: string     // who performed the action
  ticket_id: string
  type: NotificationType
  message: string      // human-readable, e.g. "closed your ticket #ABC1234"
}): Promise<void> {
  if (!params.user_id || params.user_id === params.actor_id) return

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return

    await fetch("/api/notifications/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    })
  } catch {
    // Non-blocking — notification failure should never break the main action
  }
}
