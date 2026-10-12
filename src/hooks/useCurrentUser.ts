"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"

export type AppRole = "user" | "engineer" | "admin" | "superadmin"

export type CurrentUser = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  role: AppRole
}

/** Signed-in user's profile row (from `users`), kept in sync with auth state changes. */
export function useCurrentUser() {
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    const load = async (userId: string) => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email, avatar_url, role")
        .eq("id", userId)
        .single()
      if (cancelled) return
      setUser(data ? { ...data, role: (data.role as AppRole) ?? "user" } : null)
      setLoading(false)
    }

    // Immediate fetch — covers Strict Mode double-mount where INITIAL_SESSION is missed
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) load(authUser.id)
      else if (!cancelled) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) load(session.user.id)
      else if (!cancelled) {
        setUser(null)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}

export function getInitials(name?: string | null) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function roleLabel(role?: string | null) {
  if (!role) return ""
  return role === "superadmin" ? "Super Admin" : role.charAt(0).toUpperCase() + role.slice(1)
}
