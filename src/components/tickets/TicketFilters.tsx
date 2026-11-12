"use client"

import * as React from "react"
import { SearchInput } from "@/components/ui/search-input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/api-client"
import { TICKET_TYPES, TICKET_TYPE_LABELS } from "@/lib/itsm"

type Props = {
  /**
   * Optional: tables built on `DataTable` pass search through its controlled
   * `search`/`onSearchChange` instead. When provided, a search box is rendered here.
   */
  search?: string
  setSearch?: (v: string) => void
  status: string
  setStatus: (v: string) => void
  category: string
  setCategory: (v: string) => void
  /** Optional record-type filter ("all" or a ticket type) */
  ticketType?: string
  setTicketType?: (v: string) => void
}

const TRIGGER_CLASS = "w-[150px] data-[size=sm]:h-9"

type ConfigCategory = { id: string; parent_id: string | null; name: string; is_active: boolean }

export default function TicketFilters({
  search,
  setSearch,
  status,
  setStatus,
  category,
  setCategory,
  ticketType,
  setTicketType,
}: Props) {
  // Top-level categories of the signed-in person's tenant
  const [categories, setCategories] = React.useState<string[]>([])

  React.useEffect(() => {
    let active = true
    apiFetch<{ categories: ConfigCategory[] }>("/api/itsm/config")
      .then((cfg) => {
        if (!active) return
        const names = cfg.categories.filter((c) => !c.parent_id).map((c) => c.name)
        setCategories([...new Set(names)])
      })
      .catch(() => {
        // e.g. a super admin without a home tenant: only "All categories" is offered
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2">
      {setSearch && (
        <SearchInput
          size="sm"
          placeholder="Search"
          value={search ?? ""}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          wrapperClassName="w-full sm:w-64"
        />
      )}

      {setTicketType && (
        <Select value={ticketType ?? "all"} onValueChange={setTicketType}>
          <SelectTrigger size="sm" className={TRIGGER_CLASS} aria-label="Filter by record type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TICKET_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TICKET_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger size="sm" className={TRIGGER_CLASS} aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="hold">On Hold</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger size="sm" className={TRIGGER_CLASS} aria-label="Filter by category">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
          {/* Keep a chosen category selectable even if it's not in the list */}
          {category !== "all" && !categories.includes(category) && (
            <SelectItem value={category}>{category}</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
