"use client"

import { SearchInput } from "@/components/ui/search-input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

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
}

const TRIGGER_CLASS = "w-[150px] data-[size=sm]:h-9"

export default function TicketFilters({
  search,
  setSearch,
  status,
  setStatus,
  category,
  setCategory,
}: Props) {
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

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger size="sm" className={TRIGGER_CLASS} aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger size="sm" className={TRIGGER_CLASS} aria-label="Filter by category">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="Hardware">Hardware</SelectItem>
          <SelectItem value="Database">Database</SelectItem>
          <SelectItem value="Security">Security</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
