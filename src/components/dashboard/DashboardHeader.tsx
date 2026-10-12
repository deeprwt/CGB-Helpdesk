"use client"

import * as React from "react"
import Link from "next/link"
import { LifeBuoy, Plus, Ticket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { getInitials, roleLabel, useCurrentUser } from "@/hooks/useCurrentUser"

type Greeting = { greeting: string; emoji: string; subtitle: string }

function getGreeting(hour: number | null): Greeting {
  if (hour === null) {
    return { greeting: "Welcome back", emoji: "👋", subtitle: "Here's what's happening with your tickets." }
  }
  if (hour < 5) {
    return { greeting: "Working late", emoji: "🌙", subtitle: "Here's your helpdesk snapshot — don't forget to rest." }
  }
  if (hour < 12) {
    return { greeting: "Good morning", emoji: "☀️", subtitle: "Here's what's happening with your tickets today." }
  }
  if (hour < 17) {
    return { greeting: "Good afternoon", emoji: "🌤️", subtitle: "Here's where your tickets stand this afternoon." }
  }
  if (hour < 21) {
    return { greeting: "Good evening", emoji: "🌆", subtitle: "Here's a recap of today's support activity." }
  }
  return { greeting: "Good night", emoji: "✨", subtitle: "Here's your end-of-day ticket snapshot." }
}

/* Clock read through useSyncExternalStore so the server render (no clock) and the
   client render never disagree during hydration; it re-reads once a minute. */
function subscribeToClock(onChange: () => void) {
  const t = setInterval(onChange, 60_000)
  return () => clearInterval(t)
}
const readHour = () => new Date().getHours()
const readToday = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
const readNothing = () => null

export default function DashboardHeader() {
  const { user, loading } = useCurrentUser()
  const hour = React.useSyncExternalStore(subscribeToClock, readHour, readNothing)
  const today = React.useSyncExternalStore(subscribeToClock, readToday, readNothing)

  const info = getGreeting(hour)
  const firstName = user?.full_name?.split(" ")[0] || "there"

  return (
    <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
      {/* Decorative glow blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: avatar + greeting */}
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 shadow-md ring-4 ring-white sm:h-14 sm:w-14 dark:ring-gray-900">
              <AvatarImage src={user?.avatar_url ?? undefined} alt={user?.full_name ?? "Your avatar"} />
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-semibold text-white sm:text-base">
                {loading ? "" : getInitials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
            <span
              aria-label="Online"
              className="absolute bottom-0.5 right-0.5 flex h-3 w-3 items-center justify-center"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900" />
            </span>
          </div>

          <div className="min-w-0">
            {/* Eyebrow: date + role pill */}
            <div className="flex min-h-[18px] flex-wrap items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {today && <span>{today}</span>}
              {user && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/70 dark:text-indigo-300 dark:ring-indigo-500/30">
                  <LifeBuoy className="h-2.5 w-2.5" />
                  {roleLabel(user.role)}
                </span>
              )}
            </div>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-white">
              {info.greeting},{" "}
              {loading ? (
                <Skeleton className="inline-block h-7 w-24 align-middle" />
              ) : (
                <span className="animate-gradient-x bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-indigo-400">
                  {firstName}
                </span>
              )}{" "}
              <span className="animate-wave inline-block origin-[70%_70%]">{info.emoji}</span>
            </h1>

            <p className="mt-0.5 text-sm text-gray-500 sm:text-[15px] dark:text-gray-400">
              {info.subtitle}
            </p>
          </div>
        </div>

        {/* Right: CTAs */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="rounded-xl bg-white/80 font-semibold text-gray-700 dark:bg-gray-900/60 dark:text-gray-200"
          >
            <Link href="/ticket">
              <Ticket className="h-4 w-4" />
              View Tickets
            </Link>
          </Button>
          <Button
            asChild
            variant="gradient"
            className="group relative overflow-hidden rounded-xl px-5 font-semibold"
          >
            <Link href="/create-ticket">
              {/* shimmer sweep */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              <span>New Ticket</span>
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
