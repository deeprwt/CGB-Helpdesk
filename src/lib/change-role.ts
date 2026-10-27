import { supabase } from "@/lib/supabaseClient"

/**
 * Asks the server to change a user's role (see /api/user/role).
 * Throws with the server's message when the change is refused or fails.
 */
export async function changeUserRole(targetUserId: string, role: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new Error("You must be logged in")

  const res = await fetch("/api/user/role", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ target_user_id: targetUserId, role }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Failed to change role")
  return data.role as string
}
