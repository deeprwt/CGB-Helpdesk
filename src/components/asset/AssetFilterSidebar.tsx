"use client"

import * as React from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SearchInput } from "@/components/ui/search-input"
import { StatusBadge } from "@/components/common/status-badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/* ---------------- TYPES ---------------- */

export type FacetOption = {
  value: string
  label: string
  count: number
}

const VISIBLE_OPTIONS = 5
const SEARCHABLE_AFTER = 10

/* ---------------- PANEL ---------------- */

export function FilterPanel({
  activeCount,
  onClearAll,
  children,
  className,
}: {
  activeCount: number
  onClearAll: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <span className="flex items-center gap-2.5 text-sm font-semibold text-gray-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
            <SlidersHorizontal className="size-4" />
          </span>
          Filters
          {activeCount > 0 && (
            <StatusBadge tone="indigo" className="px-2 text-[11px]">
              {activeCount}
            </StatusBadge>
          )}
        </span>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-8 px-2.5 text-xs text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
          >
            Clear all
          </Button>
        )}
      </div>
      {children}
    </Card>
  )
}

/* ---------------- COLLAPSIBLE SECTION ---------------- */

export function FilterSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-gray-200 last:border-b-0 dark:border-white/10"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-between rounded-none px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-white/[0.03] [&[data-state=open]>svg]:rotate-180"
        >
          <span className="flex items-center gap-2">
            {title}
            {!!badge && (
              <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {badge}
              </span>
            )}
          </span>
          <ChevronDown className="size-4 text-gray-400 transition-transform duration-200 dark:text-gray-500" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/* ---------------- CHECKBOX FACET ---------------- */

export function FacetFilter({
  title,
  options,
  selected,
  onToggle,
  defaultOpen,
}: {
  title: string
  options: FacetOption[]
  selected: string[]
  onToggle: (value: string) => void
  defaultOpen?: boolean
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const idPrefix = React.useId()

  const visible = expanded
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : // Always keep checked options visible, even beyond the first few
      options.filter(
        (o, i) => i < VISIBLE_OPTIONS || selected.includes(o.value)
      )

  const hiddenCount = options.length - visible.length

  return (
    <FilterSection
      title={title}
      badge={selected.length}
      defaultOpen={defaultOpen}
    >
      {options.length === 0 && (
        <p className="py-1 text-sm text-gray-500 dark:text-gray-400">
          No options
        </p>
      )}

      {expanded && options.length > SEARCHABLE_AFTER && (
        <SearchInput
          size="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder={`Search ${title.toLowerCase()}`}
          wrapperClassName="mb-2"
        />
      )}

      <div
        className={cn(
          "-mx-2 flex flex-col",
          expanded && "max-h-64 overflow-y-auto pr-1"
        )}
      >
        {visible.map((o, i) => {
          const checked = selected.includes(o.value)
          const id = `${idPrefix}-${i}`
          return (
            <Label
              key={o.value}
              htmlFor={id}
              className={cn(
                "mb-0 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm leading-5 font-normal transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]",
                o.count === 0 && !checked && "opacity-50"
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => onToggle(o.value)}
                className="data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-500 data-[state=checked]:text-white dark:data-[state=checked]:border-indigo-500 dark:data-[state=checked]:bg-indigo-500"
              />
              <span
                className={cn(
                  "flex-1 truncate",
                  checked
                    ? "font-medium text-gray-900 dark:text-white"
                    : "text-gray-700 dark:text-gray-300"
                )}
                title={o.label}
              >
                {o.label}
              </span>
              <span
                className={cn(
                  "inline-flex min-w-[24px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
                  checked
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
                )}
              >
                {o.count.toLocaleString()}
              </span>
            </Label>
          )
        })}
        {expanded && visible.length === 0 && options.length > 0 && (
          <p className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
            No matches
          </p>
        )}
      </div>

      {(hiddenCount > 0 || expanded) && (
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setExpanded((v) => !v)
            setQuery("")
          }}
          className="mt-1 h-auto px-0 py-0.5 text-sm text-indigo-600 has-[>svg]:px-0 dark:text-indigo-300"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </Button>
      )}
    </FilterSection>
  )
}
