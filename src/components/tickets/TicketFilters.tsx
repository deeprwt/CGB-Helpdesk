"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

type Props = {
  search: string
  setSearch: (v: string) => void
  status: string
  setStatus: (v: string) => void
  category: string
  setCategory: (v: string) => void
}

export default function TicketFilters({
  search,
  setSearch,
  status,
  setStatus,
  category,
  setCategory,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 justify-end">
      <Input
        placeholder="Search"
        className="w-64"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="Hardware">Hardware</SelectItem>
          <SelectItem value="Database">Database</SelectItem>
          <SelectItem value="Security">Security</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
