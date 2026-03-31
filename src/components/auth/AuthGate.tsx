"use client"

import { useEffect, useState, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

const PUBLIC_ROUTES = ["/signin", "/signup", "/reset-password", "/update-password", "/verify-email"]

export default function AuthGate({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const [checking, setChecking] = useState(!isPublicRoute)
  const [removed, setRemoved] = useState(false)

  /** Sign out and redirect to login */
  const forceLogout = useCallback(async () => {
    setRemoved(true)
    await supabase.auth.signOut().catch(() => {})
    // Small delay so user sees the message
    setTimeout(() => {
      window.location.href = "/signin"
    }, 3000)
  }, [])

  /** Check if the user still exists in the users table */
  const verifyUserExists = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle()

      if (error || !data) {
        forceLogout()
        return false
      }
      return true
    },
    [forceLogout]
  )

  useEffect(() => {
    if (isPublicRoute) return

    let isMounted = true

    // Initial session + user existence check
    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return

      if (!data.session) {
        router.replace("/signin")
        return
      }

      // Verify user still exists in DB
      const exists = await verifyUserExists(data.session.user.id)
      if (!isMounted) return

      if (exists) {
        setChecking(false)

        // Subscribe to real-time DELETE on this user's row
        const channel = supabase
          .channel(`user-deletion-${data.session.user.id}`)
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "users",
              filter: `id=eq.${data.session.user.id}`,
            },
            () => {
              forceLogout()
            }
          )
          .subscribe()

        // Also poll every 60s as a fallback (real-time can drop)
        const interval = setInterval(async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (session) {
            verifyUserExists(session.user.id)
          }
        }, 60000)

        // Cleanup
        return () => {
          channel.unsubscribe()
          clearInterval(interval)
        }
      }
    })

    // Auth state change listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !removed) {
        router.replace("/signin")
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [isPublicRoute, router, verifyUserExists, forceLogout, removed])

  // Show removal message
  if (removed) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="mx-4 max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-xl dark:border-red-800 dark:bg-red-950/30">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
            <svg
              className="h-7 w-7 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-red-800 dark:text-red-300">
            Account Removed
          </h2>
          <p className="text-sm text-red-700 dark:text-red-400">
            Your account has been removed. Please contact your team.
          </p>
          <p className="mt-3 text-xs text-red-500 dark:text-red-500">
            Redirecting to login...
          </p>
        </div>
      </div>
    )
  }

  // Prevent flash while checking auth
  if (!isPublicRoute && checking) return null

  return <>{children}</>
}
