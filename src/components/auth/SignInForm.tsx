"use client"

import * as React from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import {
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MailWarning,
} from "lucide-react"
// import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

const inputClass =
  "h-12 rounded-lg border-gray-300 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"

const leadingIconClass =
  "pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"

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
    <div className="flex w-full flex-1 flex-col overflow-y-auto no-scrollbar lg:w-1/2">
      <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <Link href="/">
            <ChevronLeft />
            Back to dashboard
          </Link>
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-10">
        <div className="mb-8">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/25">
            <LogIn className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Sign In
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter your email and password to sign in!
          </p>
        </div>
        {/*
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
          <Button type="button" variant="outline" className="h-12" onClick={signInWithGoogle}>
            Sign in with Google
          </Button>
          <Button type="button" variant="outline" className="h-12">
            Sign in with X
          </Button>
        </div>

        <div className="relative py-3 sm:py-5">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-gray-400 dark:bg-gray-900">
            Or
          </span>
        </div> */}

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signin-email" required>
                Email
              </FieldLabel>
              <div className="relative">
                <Mail className={leadingIconClass} />
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="info@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="signin-password" required>
                Password
              </FieldLabel>
              <div className="relative">
                <Lock className={leadingIconClass} />
                <Input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </Button>
              </div>
            </Field>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="signin-remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                />
                <Label
                  htmlFor="signin-remember"
                  className="mb-0 cursor-pointer font-normal text-gray-700 dark:text-gray-400"
                >
                  Keep me logged in
                </Label>
              </div>
              <Button
                type="button"
                variant="link"
                onClick={() => setForgotOpen(true)}
                className="h-auto p-0 font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Forgot password?
              </Button>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              >
                {error}
              </div>
            )}

            {/* Verification required banner */}
            {needsVerification && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20">
                    <MailWarning className="h-4 w-4" />
                  </span>
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
                      className="mt-3 border-amber-300 bg-transparent text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-700 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-900/40"
                      onClick={handleResendVerification}
                      disabled={resending}
                    >
                      {resending && <Loader2 className="animate-spin" />}
                      {resending ? "Sending..." : "Resend Verification Email"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="gradient"
              className="h-12 w-full font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t have an account?{" "}
          <Button
            asChild
            variant="link"
            className="h-auto p-0 font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <Link href="/signup">Sign Up</Link>
          </Button>
        </p>
      </div>

      <Dialog
        open={forgotOpen}
        onOpenChange={(open) => {
          // Mirror the old modal: it couldn't be dismissed while the request was in flight
          if (!forgotLoading) setForgotOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <span className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 sm:mx-0 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
              <KeyRound className="h-5 w-5" />
            </span>
            <DialogTitle className="text-gray-900 dark:text-white">Reset Password</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Enter your email and we&apos;ll send you a reset link.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
            <div className="relative">
              <Mail className={leadingIconClass} />
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="info@gmail.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className={inputClass}
              />
            </div>
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForgotOpen(false)}
              disabled={forgotLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="gradient"
              onClick={handleForgotPassword}
              disabled={forgotLoading}
            >
              {forgotLoading && <Loader2 className="animate-spin" />}
              {forgotLoading ? "Sending..." : "Send Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
