import * as React from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export type PageHeaderCrumb = { label: string; href?: string }

export type PageHeaderMetaItem = {
  label: React.ReactNode
  /** Tailwind bg class for the leading dot, e.g. "bg-emerald-400" */
  dot?: string
}

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned buttons */
  actions?: React.ReactNode
  /** "simple" = plain title row; "hero" = gradient banner (dashboard / detail pages) */
  variant?: "simple" | "hero"
  /** Small pill above the title (hero variant) */
  eyebrow?: string
  eyebrowIcon?: LucideIcon
  /** Dot-separated facts under the description (hero variant) */
  meta?: PageHeaderMetaItem[]
  breadcrumbs?: PageHeaderCrumb[]
  /** Extra content under the header text (hero variant), e.g. an avatar row */
  children?: React.ReactNode
  className?: string
}

function Crumbs({ items }: { items: PageHeaderCrumb[] }) {
  return (
    <Breadcrumb className="mb-2">
      <BreadcrumbList className="text-xs sm:gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <React.Fragment key={`${c.label}-${i}`}>
              <BreadcrumbItem>
                {last || !c.href ? (
                  <BreadcrumbPage className="text-gray-600 dark:text-gray-300">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  variant = "simple",
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  meta,
  breadcrumbs,
  children,
  className,
}: PageHeaderProps) {
  if (variant === "hero") {
    return (
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 p-5 sm:p-6",
          "dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10",
          className
        )}
      >
        {/* Decorative glow blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {breadcrumbs && breadcrumbs.length > 0 && <Crumbs items={breadcrumbs} />}
            {eyebrow && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900/80 dark:text-indigo-300 dark:ring-indigo-500/20">
                {EyebrowIcon && <EyebrowIcon className="h-3 w-3" />}
                {eyebrow}
              </span>
            )}
            <h1 className="mt-2 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl dark:text-white">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{description}</p>
            )}
            {meta && meta.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                {meta.map((m, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span
                      className={cn("inline-block h-1.5 w-1.5 rounded-full", m.dot ?? "bg-indigo-400")}
                    />
                    {m.label}
                  </span>
                ))}
              </div>
            )}
            {children}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </section>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && <Crumbs items={breadcrumbs} />}
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
