"use client"

import { Suspense, useEffect, useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  CheckCircle2,
  Clock,
  Loader2,
  MailCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Status = "loading" | "success" | "already_verified" | "expired" | "error"

type Tone = "indigo" | "emerald" | "sky" | "amber" | "red"

const TONE_CHIP: Record<Tone, string> = {
  indigo:
    "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20",
  emerald:
    "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
  sky: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20",
  amber:
    "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
  red: "bg-red-50 text-red-600 ring-red-100 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20",
}

// useSearchParams() needs a Suspense boundary so the page can be prerendered
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailShell><VerifyingState /></VerifyEmailShell>}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center px-0 sm:px-6 lg:w-1/2">
      {children}
    </div>
  )
}

function StatusCard({
  icon: Icon,
  tone,
  title,
  description,
  spin,
  action,
}: {
  icon: LucideIcon
  tone: Tone
  title: ReactNode
  description: ReactNode
  spin?: boolean
  action?: ReactNode
}) {
  return (
    <Card className="w-full max-w-md gap-0 py-8">
      <CardHeader className="justify-items-center gap-0 text-center">
        <span
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl ring-1",
            TONE_CHIP[tone]
          )}
        >
          <Icon className={cn("h-8 w-8", spin && "animate-spin")} />
        </span>
        <CardTitle className="mt-5 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {title}
        </CardTitle>
        <CardDescription className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {description}
        </CardDescription>
      </CardHeader>
      {action && <CardFooter className="mt-6">{action}</CardFooter>}
    </Card>
  )
}

function VerifyingState() {
  return (
    <StatusCard
      icon={Loader2}
      spin
      tone="indigo"
      title="Verifying your email..."
      description="Please wait while we verify your email address."
    />
  )
}

function VerifyEmailContent() {
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
    <VerifyEmailShell>
      {status === "loading" && <VerifyingState />}

      {status === "success" && (
        <StatusCard
          icon={MailCheck}
          tone="emerald"
          title="Email Verified!"
          description={message}
          action={
            <Button asChild variant="gradient" className="w-full">
              <Link href="/signin">Go to Sign In</Link>
            </Button>
          }
        />
      )}

      {status === "already_verified" && (
        <StatusCard
          icon={CheckCircle2}
          tone="sky"
          title="Already Verified"
          description={message}
          action={
            <Button asChild variant="gradient" className="w-full">
              <Link href="/signin">Go to Sign In</Link>
            </Button>
          }
        />
      )}

      {status === "expired" && (
        <StatusCard
          icon={Clock}
          tone="amber"
          title="Link Expired"
          description={message}
          action={
            <Button asChild variant="outline" className="w-full">
              <Link href="/signin">Go to Sign In to Resend</Link>
            </Button>
          }
        />
      )}

      {status === "error" && (
        <StatusCard
          icon={XCircle}
          tone="red"
          title="Verification Failed"
          description={message}
          action={
            <Button asChild variant="outline" className="w-full">
              <Link href="/signin">Go to Sign In</Link>
            </Button>
          }
        />
      )}
    </VerifyEmailShell>
  )
}
