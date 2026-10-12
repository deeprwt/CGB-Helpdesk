"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, Search, SlidersHorizontal } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
}: {
  activeCount: number
  onClearAll: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
          <SlidersHorizontal className="size-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
              {activeCount}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-medium text-brand-500 hover:underline dark:text-brand-400"
          >
            Clear all
          </button>
        )}
      </div>
      {children}
    </div>
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
      className="border-b border-gray-200 last:border-b-0 dark:border-gray-800"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-white/[0.03]">
        <span className="flex items-center gap-2">
          {title}
          {!!badge && (
            <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-medium leading-4 text-white">
              {badge}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="size-4 text-gray-500" />
        ) : (
          <ChevronDown className="size-4 text-gray-500" />
        )}
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
        <p className="py-1 text-sm text-gray-500">No options</p>
      )}

      {expanded && options.length > SEARCHABLE_AFTER && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            className="h-8 pl-8 text-sm"
          />
        </div>
      )}

      <div className={cn(expanded && "max-h-64 overflow-y-auto pr-1")}>
        {visible.map((o) => {
          const checked = selected.includes(o.value)
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 py-1.5 text-sm",
                o.count === 0 && !checked && "opacity-50"
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(o.value)}
                className="data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500 data-[state=checked]:text-white dark:data-[state=checked]:bg-brand-500"
              />
              <span
                className="flex-1 truncate text-gray-700 dark:text-gray-300"
                title={o.label}
              >
                {o.label}
              </span>
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {o.count.toLocaleString()}
              </span>
            </label>
          )
        })}
      </div>

      {(hiddenCount > 0 || expanded) && (
        <button
          type="button"
          onClick={() => {
            setExpanded((v) => !v)
            setQuery("")
          }}
          className="mt-1 text-sm font-medium text-brand-500 hover:underline dark:text-brand-400"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </FilterSection>
  )
}
