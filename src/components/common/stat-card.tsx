import * as React from "react"
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export type StatTone = "indigo" | "emerald" | "amber" | "violet" | "rose" | "sky" | "orange" | "gray"

const TONES: Record<StatTone, { chip: string; icon: string; bar: string; ring: string }> = {
  indigo: {
    chip: "bg-brand-50 ring-brand-100 dark:bg-brand-500/15 dark:ring-brand-500/20",
    icon: "text-brand-600 dark:text-brand-300",
    bar: "bg-gradient-to-r from-brand-400 to-brand-600",
    ring: "group-hover:ring-brand-200/60 dark:group-hover:ring-brand-500/30",
  },
  emerald: {
    chip: "bg-emerald-50 ring-emerald-100 dark:bg-emerald-500/15 dark:ring-emerald-500/20",
    icon: "text-emerald-600 dark:text-emerald-300",
    bar: "bg-gradient-to-r from-emerald-400 to-green-500",
    ring: "group-hover:ring-emerald-200/60 dark:group-hover:ring-emerald-500/30",
  },
  amber: {
    chip: "bg-amber-50 ring-amber-100 dark:bg-amber-500/15 dark:ring-amber-500/20",
    icon: "text-amber-600 dark:text-amber-300",
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
    ring: "group-hover:ring-amber-200/60 dark:group-hover:ring-amber-500/30",
  },
  violet: {
    chip: "bg-violet-50 ring-violet-100 dark:bg-violet-500/15 dark:ring-violet-500/20",
    icon: "text-violet-600 dark:text-violet-300",
    bar: "bg-gradient-to-r from-violet-400 to-purple-500",
    ring: "group-hover:ring-violet-200/60 dark:group-hover:ring-violet-500/30",
  },
  rose: {
    chip: "bg-rose-50 ring-rose-100 dark:bg-rose-500/15 dark:ring-rose-500/20",
    icon: "text-rose-600 dark:text-rose-300",
    bar: "bg-gradient-to-r from-rose-400 to-red-500",
    ring: "group-hover:ring-rose-200/60 dark:group-hover:ring-rose-500/30",
  },
  sky: {
    chip: "bg-sky-50 ring-sky-100 dark:bg-sky-500/15 dark:ring-sky-500/20",
    icon: "text-sky-600 dark:text-sky-300",
    bar: "bg-gradient-to-r from-sky-400 to-blue-500",
    ring: "group-hover:ring-sky-200/60 dark:group-hover:ring-sky-500/30",
  },
  orange: {
    chip: "bg-orange-50 ring-orange-100 dark:bg-orange-500/15 dark:ring-orange-500/20",
    icon: "text-orange-600 dark:text-orange-300",
    bar: "bg-gradient-to-r from-orange-400 to-orange-600",
    ring: "group-hover:ring-orange-200/60 dark:group-hover:ring-orange-500/30",
  },
  gray: {
    chip: "bg-gray-100 ring-gray-200 dark:bg-white/5 dark:ring-white/10",
    icon: "text-gray-600 dark:text-gray-300",
    bar: "bg-gradient-to-r from-gray-300 to-gray-400",
    ring: "group-hover:ring-gray-200/60 dark:group-hover:ring-white/10",
  },
}

/** Rotating palette so a row of stat cards reads as a rhythm, not N identical boxes. */
export const STAT_TONE_CYCLE: StatTone[] = ["indigo", "emerald", "amber", "violet", "rose", "sky"]

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  tone?: StatTone
  /** Percent change; renders a trend pill */
  trend?: number
  /** Small muted text under the value */
  hint?: React.ReactNode
  /** Coloured strip along the top edge */
  accentBar?: boolean
  /** Makes the card a button (e.g. a filter tab) */
  onClick?: () => void
  active?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "indigo",
  trend,
  hint,
  accentBar = false,
  onClick,
  active = false,
  className,
}: StatCardProps) {
  const t = TONES[tone]
  const Comp: React.ElementType = onClick ? "button" : "div"

  const trendUp = trend !== undefined && trend > 0
  const trendDown = trend !== undefined && trend < 0
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus
  const trendColor = trendUp
    ? "text-emerald-600 bg-emerald-50 ring-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15 dark:ring-emerald-500/30"
    : trendDown
      ? "text-rose-600 bg-rose-50 ring-rose-100 dark:text-rose-300 dark:bg-rose-500/15 dark:ring-rose-500/30"
      : "text-gray-600 bg-gray-50 ring-gray-100 dark:text-gray-300 dark:bg-white/5 dark:ring-white/10"

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-sm ring-1 ring-transparent transition-all duration-300 ease-out",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gray-200/60 dark:bg-gray-900/40 dark:shadow-black/20",
        active
          ? "border-brand-300 ring-brand-200 dark:border-brand-500/40 dark:ring-brand-500/20"
          : cn("border-gray-200/70 dark:border-white/10", t.ring),
        className
      )}
    >
      {accentBar && <div className={cn("absolute inset-x-0 top-0 h-1", t.bar)} />}

      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1", t.chip)}>
            <Icon className={cn("h-4 w-4", t.icon)} />
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-600 dark:text-gray-300">
          {label}
        </p>
        {active && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            Active
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-bold leading-none tracking-tight text-gray-900 tabular-nums dark:text-white">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {trend !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
              trendColor
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {trendUp ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </Comp>
  )
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900/40",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mt-4 h-8 w-16" />
    </div>
  )
}
