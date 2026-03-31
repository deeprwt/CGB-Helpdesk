"use client"

import * as React from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { ChevronLeft, Eye, EyeOff } from "lucide-react"
// import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export default function SignInForm() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [remember, setRemember] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = React.useState(false)
  const [forgotEmail, setForgotEmail] = React.useState("")
  const [forgotLoading, setForgotLoading] = React.useState(false)

  // Verification state
  const [needsVerification, setNeedsVerification] = React.useState(false)
  const [resending, setResending] = React.useState(false)

  async function handleForgotPassword() {
    if (!forgotEmail) {
      toast.error("Please enter your email")
      return
    }

    setForgotLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    setForgotLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("Password reset link sent to your email")
    setForgotOpen(false)
    setForgotEmail("")
  }

  async function handleResendVerification() {
    setResending(true)

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (data.already_verified) {
        setNeedsVerification(false)
        setError(null)
        toast.success("Your email is already verified. Please sign in.")
        return
      }

      toast.success("Verification email sent! Please check your inbox.")
    } catch {
      toast.error("Failed to resend verification email")
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNeedsVerification(false)

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    // Check if user is verified
    if (signInData.user) {
      const { data: userData } = await supabase
        .from("users")
        .select("is_verified")
        .eq("id", signInData.user.id)
        .single()

      if (userData && userData.is_verified === false) {
        // Sign out immediately — unverified users cannot access the app
        await supabase.auth.signOut()
        setNeedsVerification(true)
        setError(null)
        setLoading(false)
        return
      }
    }

    setLoading(false)
    toast.success("Login Successfully")

    setTimeout(() => {
      window.location.href = "/"
    }, 800)
  }

  // async function signInWithGoogle() {
  //   await supabase.auth.signInWithOAuth({ provider: "google" })
  // }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to dashboard
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
            Sign In
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your email and password to sign in!
          </p>
        </div>
{/*
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
          <Button variant="secondary" className="gap-3 py-3" onClick={signInWithGoogle}>
            Sign in with Google
          </Button>
          <Button variant="secondary" className="gap-3 py-3">
            Sign in with X
          </Button>
        </div>

        <div className="relative py-3 sm:py-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="p-2 text-gray-400 bg-white dark:bg-gray-900 sm:px-5 sm:py-2">
              Or
            </span>
          </div>
        </div> */}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              placeholder="info@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Password *</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span
                onClick={() => setShowPassword((v) => !v)}
                className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
              >
                {showPassword ? <Eye /> : <EyeOff />}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
              <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                Keep me logged in
              </span>
            </div>
            <Button
              type="button"
              onClick={() => setForgotOpen(true)}
              variant="link"
            >
              Forgot password?
            </Button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Verification required banner */}
          {needsVerification && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <span className="text-xl">📧</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Please verify your email before logging in.
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Check your inbox for a verification link. If you didn&apos;t
                    receive it, click below to resend.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                    onClick={handleResendVerification}
                    disabled={resending}
                  >
                    {resending ? "Sending..." : "Resend Verification Email"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button className="w-full" size="sm" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-5">
          <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-brand-500 hover:text-brand-600">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md p-6 bg-white rounded-lg dark:bg-gray-900">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white">
              Reset Password
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="info@gmail.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setForgotOpen(false)}
                  disabled={forgotLoading}
                >
                  Cancel
                </Button>
                <Button onClick={handleForgotPassword} disabled={forgotLoading}>
                  {forgotLoading ? "Sending..." : "Send Link"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
