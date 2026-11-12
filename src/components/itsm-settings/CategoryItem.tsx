"use client"

import * as React from "react"
import { Check, ChevronDown, ArrowDown, ArrowUp, Folder, CornerDownRight, Pencil, Trash2, X } from "lucide-react"
import { TICKET_TYPES, TICKET_TYPE_LABELS, type TicketType } from "@/lib/itsm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/common/status-badge"
import { cn } from "@/lib/utils"
import type { CategoryRow } from "./shared"

export type CategoryActions = {
  rename: (c: CategoryRow, name: string) => Promise<boolean>
  toggle: (c: CategoryRow, active: boolean) => void
  remove: (c: CategoryRow) => void
  move: (c: CategoryRow, dir: -1 | 1) => void
  setTypes: (c: CategoryRow, types: TicketType[] | null) => void
}

function typesLabel(types: TicketType[] | null) {
  if (!types || types.length === 0 || types.length === TICKET_TYPES.length) return "All types"
  return types.map((t) => TICKET_TYPE_LABELS[t]).join(", ")
}

/** Which record types a top-level category is offered for. */
function TypesPicker({
  value,
  onChange,
  disabled,
}: {
  value: TicketType[] | null
  onChange: (types: TicketType[] | null) => void
  disabled?: boolean
}) {
  const all = !value || value.length === 0 || value.length === TICKET_TYPES.length
  const selected = all ? [...TICKET_TYPES] : value

  const toggle = (t: TicketType, on: boolean) => {
    const next = on ? [...selected, t] : selected.filter((x) => x !== t)
    if (next.length === 0) return // at least one; "All types" is the reset
    onChange(next.length === TICKET_TYPES.length ? null : TICKET_TYPES.filter((x) => next.includes(x)))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="max-w-[260px] justify-between">
          <span className="truncate">{typesLabel(value)}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Offered for</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={all}
          onCheckedChange={() => !all && onChange(null)}
          onSelect={(e) => e.preventDefault()}
        >
          All types
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {TICKET_TYPES.map((t) => (
          <DropdownMenuCheckboxItem
            key={t}
            checked={selected.includes(t)}
            disabled={selected.length === 1 && selected.includes(t)}
            onCheckedChange={(on) => toggle(t, on === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {TICKET_TYPE_LABELS[t]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function IconAction({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn("text-gray-500 dark:text-gray-400", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function CategoryItem({
  category: c,
  first,
  last,
  busy,
  actions,
  sub,
}: {
  category: CategoryRow
  first: boolean
  last: boolean
  busy: boolean
  actions: CategoryActions
  /** Sub-categories render slightly indented and without the record-type picker. */
  sub?: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(c.name)

  const submit = async () => {
    const v = name.trim()
    if (!v || v === c.name) {
      setEditing(false)
      setName(c.name)
      return
    }
    if (await actions.rename(c, v)) setEditing(false)
  }

  const Icon = sub ? CornerDownRight : Folder

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl px-3 py-2",
        sub ? "ml-6 sm:ml-8" : "bg-gray-50 dark:bg-white/[0.03]",
        !c.is_active && "opacity-60"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", sub ? "text-gray-400" : "text-brand-500")} />

      {editing ? (
        <form
          className="flex min-w-[200px] flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false)
                setName(c.name)
              }
            }}
            maxLength={100}
            autoFocus
            aria-label="Category name"
            className="h-8"
            disabled={busy}
          />
          <IconAction label="Save name" onClick={() => void submit()} disabled={busy} className="text-emerald-600">
            <Check className="h-4 w-4" />
          </IconAction>
          <IconAction
            label="Cancel"
            onClick={() => {
              setEditing(false)
              setName(c.name)
            }}
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </IconAction>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "truncate text-sm text-gray-900 dark:text-white",
              !sub && "font-semibold",
              !c.is_active && "line-through decoration-gray-400"
            )}
          >
            {c.name}
          </span>
          {!c.is_active && <StatusBadge tone="gray">Inactive</StatusBadge>}
        </div>
      )}

      <div className="flex items-center gap-1">
        {!sub && (
          <TypesPicker value={c.ticket_types} onChange={(t) => actions.setTypes(c, t)} disabled={busy} />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mx-1 inline-flex">
              <Switch
                checked={c.is_active}
                onCheckedChange={(v) => actions.toggle(c, v)}
                disabled={busy}
                aria-label={c.is_active ? `Deactivate ${c.name}` : `Activate ${c.name}`}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{c.is_active ? "Active: offered on new tickets" : "Inactive: hidden from new tickets"}</TooltipContent>
        </Tooltip>
        <IconAction label="Move up" onClick={() => actions.move(c, -1)} disabled={busy || first}>
          <ArrowUp className="h-4 w-4" />
        </IconAction>
        <IconAction label="Move down" onClick={() => actions.move(c, 1)} disabled={busy || last}>
          <ArrowDown className="h-4 w-4" />
        </IconAction>
        <IconAction
          label="Rename"
          onClick={() => {
            setName(c.name)
            setEditing(true)
          }}
          disabled={busy || editing}
          className="hover:text-brand-600 dark:hover:text-brand-300"
        >
          <Pencil className="h-4 w-4" />
        </IconAction>
        <IconAction
          label="Delete"
          onClick={() => actions.remove(c)}
          disabled={busy}
          className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </IconAction>
      </div>
    </div>
  )
}
