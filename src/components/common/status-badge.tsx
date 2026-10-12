import * as React from "react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export type BadgeTone =
  | "gray"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "green"
  | "emerald"
  | "amber"
  | "yellow"
  | "orange"
  | "red"
  | "rose"
  | "sky"

const TONE_CLASSES: Record<BadgeTone, { badge: string; dot: string }> = {
  gray: { badge: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10", dot: "bg-gray-400" },
  blue: { badge: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20", dot: "bg-blue-500" },
  indigo: { badge: "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20", dot: "bg-indigo-500" },
  violet: { badge: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20", dot: "bg-violet-500" },
  purple: { badge: "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20", dot: "bg-purple-500" },
  green: { badge: "bg-green-50 text-green-700 ring-green-100 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/20", dot: "bg-green-500" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20", dot: "bg-emerald-500" },
  amber: { badge: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20", dot: "bg-amber-500" },
  yellow: { badge: "bg-yellow-50 text-yellow-700 ring-yellow-100 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-500/20", dot: "bg-yellow-500" },
  orange: { badge: "bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20", dot: "bg-orange-500" },
  red: { badge: "bg-red-50 text-red-700 ring-red-100 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20", dot: "bg-red-500" },
  rose: { badge: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20", dot: "bg-rose-500" },
  sky: { badge: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20", dot: "bg-sky-500" },
}

interface StatusBadgeProps extends React.ComponentProps<typeof Badge> {
  tone?: BadgeTone
  /** Leading coloured dot */
  dot?: boolean
}

/** Soft, ring-outlined pill used for statuses, roles, priorities and tags. */
export function StatusBadge({ tone = "gray", dot = false, className, children, ...props }: StatusBadgeProps) {
  const t = TONE_CLASSES[tone]
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full border-0 px-2.5 py-0.5 font-medium ring-1 ring-inset", t.badge, className)}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {children}
    </Badge>
  )
}
