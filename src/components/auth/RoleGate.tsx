"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

type Role = "user" | "engineer" | "admin"

export default function RoleGate({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let mounted = true

    const checkRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.replace("/signin")
        return
      }

      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single()

      if (!mounted) return

      if (error || !data || !allowedRoles.includes(data.role)) {
        router.replace("/")
        return
      }

      setChecking(false)
    }

    checkRole()

    return () => {
      mounted = false
    }
  }, [allowedRoles, router])

  if (checking) return null

  return <>{children}</>
}
