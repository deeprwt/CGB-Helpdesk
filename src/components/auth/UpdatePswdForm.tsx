"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import {
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

const inputClass =
  "h-12 rounded-lg border-gray-300 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus-visible:border-brand-400 focus-visible:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"

const leadingIconClass =
  "pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"

function BackToSignIn() {
  return (
    <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <Link href="/signin">
          <ChevronLeft />
          Back to sign in
        </Link>
      </Button>
    </div>
  )
}

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
      <div className="flex w-full flex-1 flex-col lg:w-1/2">
        <BackToSignIn />

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-10">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            This password reset link is invalid or expired.
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Request a new reset link from the sign in page.
          </p>
          <Button asChild className="mt-6 h-12 w-full font-semibold">
            <Link href="/signin">Go to Sign In</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (sessionValid === null) {
    return null
  }

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto no-scrollbar lg:w-1/2">
      <BackToSignIn />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-10">
        <div className="mb-8">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/25">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Update Password
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-password" required>
                New Password
              </FieldLabel>
              <div className="relative">
                <Lock className={leadingIconClass} />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
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

            <Field>
              <FieldLabel htmlFor="confirm-password" required>
                Confirm Password
              </FieldLabel>
              <div className="relative">
                <LockKeyhole className={leadingIconClass} />
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className={inputClass}
                  required
                />
              </div>
            </Field>

            <Button
              type="submit"
              className="h-12 w-full font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Updating password...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </FieldGroup>
        </form>
      </div>
    </div>
  )
}
