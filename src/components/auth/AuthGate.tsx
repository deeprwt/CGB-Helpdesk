"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

const PUBLIC_ROUTES = ["/signin", "/signup", "/reset-password"]

export default function AuthGate({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const [checking, setChecking] = useState(!isPublicRoute)

  useEffect(() => {
    // ✅ Do nothing for public routes
    if (isPublicRoute) return

    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return

      if (!data.session) {
        router.replace("/signin")
      } else {
        setChecking(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/signin")
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [isPublicRoute, router])

  // ✅ Prevent flash while checking auth
  if (!isPublicRoute && checking) return null

  return <>{children}</>
}
