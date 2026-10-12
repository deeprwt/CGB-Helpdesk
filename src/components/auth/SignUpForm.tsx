"use client"

import * as React from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { ChevronLeft, Eye, EyeOff, Loader2, Lock, Mail, User, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"

const inputClass =
  "h-12 rounded-lg border-gray-300 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus-visible:border-brand-400 focus-visible:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"

const leadingIconClass =
  "pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"

export default function SignUpForm() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [agree, setAgree] = React.useState(false)

  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!agree) {
      toast.error("Please accept Terms and Conditions")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          first_name: firstName,
          last_name: lastName,
        }),
      })

      const data = await res.json()
      setLoading(false)

      if (!res.ok) {
        toast.error(data.error ?? "Signup failed")
        return
      }

      toast.success("Account created! Please check your email to verify your account.")
      localStorage.setItem("signup-success", "true")
      window.location.href = "/signin"
    } catch {
      setLoading(false)
      toast.error("Something went wrong. Please try again.")
    }
  }

  async function signUpWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google" })
  }

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
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/25">
            <UserPlus className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Sign Up
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter your email and password to sign up!
          </p>
        </div>

        {/* <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
          <Button type="button" variant="outline" className="h-12" onClick={signUpWithGoogle}>
            Sign up with Google
          </Button>
          <Button type="button" variant="outline" className="h-12">
            Sign up with X
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
            <FieldGroup className="sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="signup-first-name" required>
                  First Name
                </FieldLabel>
                <div className="relative">
                  <User className={leadingIconClass} />
                  <Input
                    id="signup-first-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter your first name"
                    className={inputClass}
                    required
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="signup-last-name" required>
                  Last Name
                </FieldLabel>
                <div className="relative">
                  <User className={leadingIconClass} />
                  <Input
                    id="signup-last-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter your last name"
                    className={inputClass}
                    required
                  />
                </div>
              </Field>
            </FieldGroup>

            <Field>
              <FieldLabel htmlFor="signup-email" required>
                Email
              </FieldLabel>
              <div className="relative">
                <Mail className={leadingIconClass} />
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className={inputClass}
                  required
                />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="signup-password" required>
                Password
              </FieldLabel>
              <div className="relative">
                <Lock className={leadingIconClass} />
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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

            <div className="flex items-start gap-3">
              <Checkbox
                id="signup-agree"
                checked={agree}
                onCheckedChange={(v) => setAgree(Boolean(v))}
                className="mt-0.5"
              />
              <Label
                htmlFor="signup-agree"
                className="mb-0 block cursor-pointer font-normal leading-relaxed text-gray-500 dark:text-gray-400"
              >
                By creating an account you agree to our{" "}
                <span className="font-medium text-gray-800 dark:text-white">
                  Terms & Conditions
                </span>{" "}
                and{" "}
                <span className="font-medium text-gray-800 dark:text-white">
                  Privacy Policy
                </span>
              </Label>
            </div>

            <Button
              type="submit"
              className="h-12 w-full font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Creating account...
                </>
              ) : (
                "Sign Up"
              )}
            </Button>
          </FieldGroup>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Button
            asChild
            variant="link"
            className="h-auto p-0 font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Link href="/signin">Sign In</Link>
          </Button>
        </p>
      </div>
    </div>
  )
}
