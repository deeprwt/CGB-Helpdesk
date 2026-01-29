"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { ChevronLeft, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function UpdatePswdForm() {
  const router = useRouter()

  const [showPassword, setShowPassword] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [sessionValid, setSessionValid] = React.useState<boolean | null>(null)

  /**
   * Check recovery session on page load
   */
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error("Invalid or expired reset link")
        setSessionValid(false)
        return
      }
      setSessionValid(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("Password updated successfully")
    await supabase.auth.signOut()
    router.replace("/signin")
  }

  if (sessionValid === false) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="mb-4 text-sm text-gray-500">
            This password reset link is invalid or expired.
          </p>
          <Link
            href="/signin"
            className="text-sm text-brand-500 hover:text-brand-600"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (sessionValid === null) {
    return null
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to sign in
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-6">
          <h1 className="mb-2 font-semibold text-gray-800 dark:text-white text-xl">
            Update Password
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>New Password *</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
              <span
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                {showPassword ? <Eye /> : <EyeOff />}
              </span>
            </div>
          </div>

          <div>
            <Label>Confirm Password *</Label>
            <Input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
            />
          </div>

          <Button className="w-full" disabled={loading}>
            {loading ? "Updating password..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  )
}
