"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

type Status = "loading" | "success" | "already_verified" | "expired" | "error"

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const uid = searchParams.get("uid")

  const [status, setStatus] = useState<Status>("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!token || !uid) {
      setStatus("error")
      setMessage("Invalid verification link. Missing token or user ID.")
      return
    }

    fetch(`/api/auth/verify-email?token=${token}&uid=${uid}`)
      .then(async (res) => {
        const data = await res.json()

        if (res.ok) {
          if (data.already_verified) {
            setStatus("already_verified")
          } else {
            setStatus("success")
          }
          setMessage(data.message)
        } else if (res.status === 410) {
          setStatus("expired")
          setMessage(data.error)
        } else {
          setStatus("error")
          setMessage(data.error ?? "Verification failed")
        }
      })
      .catch(() => {
        setStatus("error")
        setMessage("Something went wrong. Please try again.")
      })
  }, [token, uid])

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-16 w-16 text-blue-500 animate-spin mx-auto" />
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white">
              Verifying your email...
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Please wait while we verify your email address.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Email Verified!
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {message}
            </p>
            <Link href="/signin">
              <Button className="mt-4 w-full">Go to Sign In</Button>
            </Link>
          </div>
        )}

        {status === "already_verified" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <CheckCircle2 className="h-10 w-10 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Already Verified
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {message}
            </p>
            <Link href="/signin">
              <Button className="mt-4 w-full">Go to Sign In</Button>
            </Link>
          </div>
        )}

        {status === "expired" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Link Expired
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {message}
            </p>
            <Link href="/signin">
              <Button className="mt-4 w-full" variant="outline">
                Go to Sign In to Resend
              </Button>
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              Verification Failed
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {message}
            </p>
            <Link href="/signin">
              <Button className="mt-4 w-full" variant="outline">
                Go to Sign In
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
