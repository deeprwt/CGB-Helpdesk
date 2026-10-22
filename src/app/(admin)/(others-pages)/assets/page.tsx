"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import {
  getUserAccessibleDomains,
  buildEmailDomainFilter,
  type Organization,
} from "@/lib/org"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PageHeader } from "@/components/common/page-header"
import {
  StatCard,
  StatCardSkeleton,
  STAT_TONE_CYCLE,
} from "@/components/common/stat-card"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import {
  Archive,
  Boxes,
  CircleCheck,
  Download,
  Eye,
  MapPin,
  PackageOpen,
  Pencil,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import RoleGate from "@/components/auth/RoleGate"
import { AssetImportDialog } from "@/components/asset/AssetImportDialog"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import {
  FilterPanel,
  FilterSection,
  FacetFilter,
  type FacetOption,
} from "@/components/asset/AssetFilterSidebar"

/* ---------------- UI HELPERS ---------------- */

const STATUS_BADGE_TONE: Record<string, BadgeTone> = {
  in_use: "emerald",
  spare: "amber",
  retired: "gray",
}

const emailInitials = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?"

function Dash() {
  return <span className="text-gray-400 dark:text-gray-500">—</span>
}

function RowAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
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
          className={cn("text-gray-500 dark:text-gray-400", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ExportOption({
  id,
  value,
  title,
  description,
  count,
  disabled,
}: {
  id: string
  value: string
  title: string
  description: string
  count: number
  disabled?: boolean
}) {
  return (
    <FieldLabel
      htmlFor={id}
      className="mb-0 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 font-normal leading-normal transition-colors hover:border-brand-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[[data-state=checked]]:border-brand-300 has-[[data-state=checked]]:bg-brand-50/60 dark:border-white/10 dark:hover:border-brand-500/30 dark:has-[[data-state=checked]]:border-brand-500/40 dark:has-[[data-state=checked]]:bg-brand-500/10"
    >
      <RadioGroupItem
        id={id}
        value={value}
        disabled={disabled}
        className="mt-0.5 text-brand-500 data-[state=checked]:border-brand-500 [&_svg]:fill-brand-500"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {title}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {description}
        </span>
      </span>
      <StatusBadge tone="indigo" className="tabular-nums">
        {count.toLocaleString()}
      </StatusBadge>
    </FieldLabel>
  )
}

/* ---------------- TYPES ---------------- */

type Asset = {
  id: string
  asset_code: string
  asset_type: string
  model: string | null
  status: string
  location: string | null
  department: string | null
  warranty_expiry: string | null
  created_at: string | null
  organization_id: string | null
}

type AssetRow = Asset & {
  assigned: boolean
  assigned_email: string | null
  serial_no: string | null
}

const DEFAULT_PAGE_SIZE = 10

/* ---------------- FILTERS ---------------- */

const FACETS: { key: FacetKey; title: string; defaultOpen?: boolean }[] = [
  { key: "org", title: "Organization", defaultOpen: true },
  { key: "status", title: "Status", defaultOpen: true },
  { key: "type", title: "Asset Type", defaultOpen: true },
  { key: "location", title: "Location" },
  { key: "department", title: "Department" },
  { key: "assignment", title: "Assignment" },
  { key: "warranty", title: "Warranty" },
]

type FacetKey =
  | "org"
  | "status"
  | "type"
  | "location"
  | "department"
  | "assignment"
  | "warranty"

type Filters = Record<FacetKey, string[]>

const EMPTY_FILTERS: Filters = {
  org: [],
  status: [],
  type: [],
  location: [],
  department: [],
  assignment: [],
  warranty: [],
}

const ADDED_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 1 year" },
]

// Fixed labels + display order for the small, known facets
const FIXED_LABELS: Partial<Record<FacetKey, Record<string, string>>> = {
  status: { in_use: "In Use", spare: "Spare", retired: "Retired" },
  assignment: { assigned: "Assigned", unassigned: "Unassigned" },
  warranty: {
    active: "Active",
    expiring: "Expiring in 30 days",
    expired: "Expired",
    none: "Not set",
  },
}

const DAY_MS = 86_400_000

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase()

function warrantyBucket(expiry: string | null) {
  if (!expiry) return "none"
  const days = (new Date(expiry).getTime() - Date.now()) / DAY_MS
  if (days < 0) return "expired"
  if (days <= 30) return "expiring"
  return "active"
}

const facetValue: Record<FacetKey, (r: AssetRow) => string> = {
  org: (r) => r.organization_id ?? "",
  status: (r) => norm(r.status),
  type: (r) => norm(r.asset_type),
  location: (r) => norm(r.location),
  department: (r) => norm(r.department),
  assignment: (r) => (r.assigned ? "assigned" : "unassigned"),
  warranty: (r) => warrantyBucket(r.warranty_expiry),
}

// Original (un-normalized) text used as the option label
const facetLabel: Partial<Record<FacetKey, (r: AssetRow) => string | null>> = {
  type: (r) => r.asset_type,
  location: (r) => r.location,
  department: (r) => r.department,
}

const formatStatus = (status: string) =>
  FIXED_LABELS.status?.[norm(status)] ?? status

export default function AssetsPage() {
  const router = useRouter()

  const [assets, setAssets] = React.useState<AssetRow[]>([])
  const [orgs, setOrgs] = React.useState<Organization[]>([])
  const [loading, setLoading] = React.useState(true)

  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS)
  const [added, setAdded] = React.useState("any")
  const [search, setSearch] = React.useState("")
  const [showFilters, setShowFilters] = React.useState(false)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const [exportOpen, setExportOpen] = React.useState(false)
  const [exportMode, setExportMode] =
    React.useState<"all" | "selected">("all")


  /* ---------------- LOAD ASSETS ---------------- */
  const loadAssets = async () => {
    setLoading(true)

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (!currentUser) { setLoading(false); return }
    const { data: profile } = await supabase.from("users").select("role").eq("id", currentUser.id).single()
    const domains = await getUserAccessibleDomains(supabase, currentUser.id, currentUser.email ?? "", profile?.role ?? "user")

    // fetchAllRows: Supabase returns max 1000 rows per request
    const [{ data: assets, error: assetsError }, { data: assignments }, { data: users }, { data: allOrgs }, { data: serials }] =
      await Promise.all([
        // "*" keeps the list working even before organization_id exists
        // (supabase/migration_asset_organization.sql not yet run)
        fetchAllRows((from, to) =>
          supabase
            .from("assets")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from("asset_assignments")
            .select("asset_id, user_id")
            .is("returned_at", null)
            .order("id")
            .range(from, to)
        ),

        // Only look up users within accessible org(s)
        fetchAllRows((from, to) =>
          supabase
            .from("users")
            .select("id, email")
            .or(buildEmailDomainFilter(domains))
            .order("id")
            .range(from, to)
        ),

        supabase.from("organizations").select("id, name, domain").order("name"),

        // Serial numbers live in asset_details (key = "serial_no"), used by search
        fetchAllRows((from, to) =>
          supabase
            .from("asset_details")
            .select("asset_id, value")
            .eq("key", "serial_no")
            .order("id")
            .range(from, to)
        ),
      ])

    if (assetsError) {
      toast.error(`Failed to load assets: ${assetsError.message}`)
    }

    const userMap = new Map(
      (users ?? []).map((u) => [u.id, u.email])
    )

    const assignmentMap = new Map<string, string | null>()
      ; (assignments ?? []).forEach((a) => {
        assignmentMap.set(
          a.asset_id,
          a.user_id ? userMap.get(a.user_id) ?? null : null
        )
      })

    const serialMap = new Map<string, string>(
      (serials ?? []).map((d) => [d.asset_id, d.value])
    )

    // All assets are listed; organization is only used as a filter
    const rows: AssetRow[] = ((assets ?? []) as Asset[]).map((a) => ({
      ...a,
      organization_id: a.organization_id ?? null,
      assigned: assignmentMap.has(a.id),
      assigned_email: assignmentMap.get(a.id) ?? null,
      serial_no: serialMap.get(a.id) ?? null,
    }))

    setOrgs((allOrgs ?? []) as Organization[])
    setAssets(rows)
    setLoading(false)
  }

  React.useEffect(() => {
    loadAssets()
  }, [])

  /* ---------------- FILTERING ---------------- */
  const orgNameMap = React.useMemo(
    () => new Map(orgs.map((o) => [o.id, o.name])),
    [orgs]
  )

  // Row matches every active filter, optionally ignoring one facet
  // (used to compute "what if" counts for that facet's options)
  const matches = React.useCallback(
    (r: AssetRow, skip?: FacetKey) => {
      for (const { key } of FACETS) {
        if (key === skip) continue
        const sel = filters[key]
        if (sel.length && !sel.includes(facetValue[key](r))) return false
      }

      if (added !== "any") {
        const created = r.created_at ? new Date(r.created_at).getTime() : 0
        if (Date.now() - created > Number(added) * DAY_MS) return false
      }

      const q = search.trim().toLowerCase()
      if (q) {
        const haystack = [
          r.asset_code,
          r.serial_no,
          r.asset_type,
          r.model,
          r.location,
          r.department,
          r.assigned_email,
          r.organization_id ? orgNameMap.get(r.organization_id) : null,
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    },
    [filters, added, search, orgNameMap]
  )

  const filteredAssets = React.useMemo(
    () => assets.filter((r) => matches(r)),
    [assets, matches]
  )

  const facetOptions = React.useMemo(() => {
    const result = {} as Record<FacetKey, FacetOption[]>

    for (const { key } of FACETS) {
      const counts = new Map<string, number>()
      const labels = new Map<string, string>()

      // Every existing value stays listed, even when its count drops to 0
      assets.forEach((r) => {
        const value = facetValue[key](r)
        if (!counts.has(value)) counts.set(value, 0)
        if (!labels.has(value)) {
          labels.set(value, facetLabel[key]?.(r)?.trim() || "Not set")
        }
      })

      assets.forEach((r) => {
        if (!matches(r, key)) return
        const value = facetValue[key](r)
        counts.set(value, (counts.get(value) ?? 0) + 1)
      })

      const fixed = FIXED_LABELS[key]
      const options: FacetOption[] = Array.from(counts, ([value, count]) => ({
        value,
        count,
        label:
          key === "org"
            ? orgNameMap.get(value) ?? "No organization"
            : fixed?.[value] ?? labels.get(value) ?? value,
      }))

      if (fixed) {
        const order = Object.keys(fixed)
        const rank = (v: string) =>
          order.includes(v) ? order.indexOf(v) : order.length
        options.sort((a, b) => rank(a.value) - rank(b.value))
      } else {
        options.sort(
          (a, b) => b.count - a.count || a.label.localeCompare(b.label)
        )
      }

      result[key] = options
    }

    return result
  }, [assets, matches, orgNameMap])

  const toggleFilter = (key: FacetKey, value: string) => {
    setFilters((prev) => {
      const current = prev[key]
      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      }
    })
  }

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setAdded("any")
    setSearch("")
  }

  const activeChips = [
    ...FACETS.flatMap(({ key }) =>
      filters[key].map((value) => ({
        id: `${key}:${value}`,
        label:
          facetOptions[key].find((o) => o.value === value)?.label ?? value,
        onRemove: () => toggleFilter(key, value),
      }))
    ),
    ...(added !== "any"
      ? [{
        id: "added",
        label: `Added: ${ADDED_OPTIONS.find((o) => o.value === added)?.label}`,
        onRemove: () => setAdded("any"),
      }]
      : []),
  ]

  const isFiltered = activeChips.length > 0 || search.trim() !== ""

  // Back to the first page whenever the result set changes
  React.useEffect(() => {
    setPage(1)
  }, [filters, added, search])

  /* ---------------- PAGINATION ---------------- */
  const paginatedAssets = filteredAssets.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  /* ---------------- SELECTION ---------------- */
  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelected(
        new Set(paginatedAssets.map((a) => a.id))
      )
    } else {
      setSelected(new Set())
    }
  }

  // Select every asset matching the current filters, across all pages
  const selectAllFiltered = () => {
    setSelected(new Set(filteredAssets.map((a) => a.id)))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const copy = new Set(prev)
      copy.has(id) ? copy.delete(id) : copy.add(id)
      return copy
    })
  }

  /* ---------------- DELETE (ROW) ---------------- */
  // Confirmation is handled by <ConfirmDialog> below (replaces window.confirm)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)

  const handleDeleteRow = async (id: string) => {
    await supabase.from("asset_assignments").delete().eq("asset_id", id)
    await supabase.from("asset_details").delete().eq("asset_id", id)
    await supabase.from("assets").delete().eq("id", id)

    toast.success("Asset deleted")
    loadAssets()
  }

  /* ---------------- DELETE (BULK, ADMINS ONLY) ---------------- */
  const { user: me } = useCurrentUser()
  const canBulkDelete = me?.role === "admin" || me?.role === "superadmin"
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)

  // Same three deletes as a single row, run in chunks so the id list stays URL-safe
  const handleBulkDelete = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const toastId = toast.loading(`Deleting ${ids.length} asset${ids.length === 1 ? "" : "s"}…`)
    let deleted = 0
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100)
        const r1 = await supabase.from("asset_assignments").delete().in("asset_id", chunk)
        if (r1.error) throw r1.error
        const r2 = await supabase.from("asset_details").delete().in("asset_id", chunk)
        if (r2.error) throw r2.error
        const r3 = await supabase.from("assets").delete().in("id", chunk)
        if (r3.error) throw r3.error
        deleted += chunk.length
      }
      toast.success(`Deleted ${deleted} asset${deleted === 1 ? "" : "s"}`, { id: toastId })
    } catch (err) {
      console.error("Bulk delete failed:", err)
      toast.error(
        deleted > 0
          ? `Deleted ${deleted} of ${ids.length} assets, then an error stopped the rest`
          : "Failed to delete the selected assets",
        { id: toastId }
      )
    } finally {
      setSelected(new Set())
      loadAssets()
    }
  }


  /* ---------------- EXPORT (FULL DATA + DATES) ---------------- */
  const handleExport = async (mode: "all" | "selected") => {
    const ids = new Set(
      mode === "selected" ? selected : filteredAssets.map((a) => a.id)
    )

    const [
      { data: allAssets },
      { data: details },
      { data: assignments },
      { data: users },
    ] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from("assets").select("*").order("id").range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase.from("asset_details").select("asset_id, key, value").order("id").range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase.from("asset_assignments").select("asset_id, user_id").is("returned_at", null).order("id").range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase.from("users").select("id, email").order("id").range(from, to)
      ),
    ])

    const assets = (allAssets ?? []).filter((a) => ids.has(a.id))

    if (assets.length === 0) {
      toast.error("No data to export")
      return
    }

    const userMap = new Map(
      (users ?? []).map((u) => [u.id, u.email])
    )

    const assignmentMap = new Map<string, string | null>()
      ; (assignments ?? []).forEach((a) => {
        assignmentMap.set(
          a.asset_id,
          a.user_id ? userMap.get(a.user_id) ?? null : null
        )
      })

    const detailMap = new Map<string, Record<string, string>>()
      ; (details ?? []).forEach((d) => {
        if (!detailMap.has(d.asset_id)) {
          detailMap.set(d.asset_id, {})
        }
        detailMap.get(d.asset_id)![d.key] = d.value
      })

    const rows = assets.map((a) => {
      const d = detailMap.get(a.id) ?? {}
      return {
        organization: a.organization_id
          ? orgNameMap.get(a.organization_id) ?? ""
          : "",
        asset_code: a.asset_code,
        asset_type: a.asset_type,
        model: a.model,
        status: a.status,
        location: a.location,
        department: a.department,

        purchase_date: a.purchase_date ?? "",
        warranty_expiry: a.warranty_expiry ?? "",
        created_at: a.created_at ?? "",

        serial_no: d.serial_no ?? "",
        cpu: d.cpu ?? "",
        ram: d.ram ?? "",
        storage: d.storage ?? "",
        os_name: d.os_name ?? "",
        mac_address: d.mac_address ?? "",
        vendor: d.vendor ?? "",

        assigned_user_email:
          assignmentMap.get(a.id) ?? "",
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Assets")
    XLSX.writeFile(wb, "assets-full-export.xlsx")

    toast.success("Excel exported")
    setExportOpen(false)
  }

  /* ---------------- SUMMARY (derived from loaded rows) ---------------- */
  const stats = React.useMemo(() => {
    const count = (fn: (r: AssetRow) => boolean) => assets.filter(fn).length
    return {
      total: assets.length,
      inUse: count((r) => norm(r.status) === "in_use"),
      spare: count((r) => norm(r.status) === "spare"),
      retired: count((r) => norm(r.status) === "retired"),
      expiring: count((r) => warrantyBucket(r.warranty_expiry) === "expiring"),
    }
  }, [assets])

  const statCards = [
    {
      label: "Total Assets",
      value: stats.total,
      icon: Boxes,
      hint: isFiltered
        ? `${filteredAssets.length.toLocaleString()} match current filters`
        : "Across all organizations",
    },
    { label: "In Use", value: stats.inUse, icon: CircleCheck, hint: "Currently deployed" },
    { label: "Spare", value: stats.spare, icon: PackageOpen, hint: "Available to assign" },
    { label: "Retired", value: stats.retired, icon: Archive, hint: "Out of service" },
    {
      label: "Warranty Expiring",
      value: stats.expiring,
      icon: ShieldAlert,
      hint: "Within the next 30 days",
    },
  ]

  // DataTable highlight state mirrors the existing `selected` set
  const rowSelection = React.useMemo<RowSelectionState>(
    () => Object.fromEntries(Array.from(selected, (id) => [id, true])),
    [selected]
  )


  const deleteTarget = deleteId ? assets.find((a) => a.id === deleteId) : null

  /* ---------------- TABLE COLUMNS ---------------- */
  const columns: ColumnDef<AssetRow>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all on this page"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(v) => toggleAll(Boolean(v))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.asset_code}`}
          checked={row.getIsSelected()}
          onCheckedChange={() => toggleOne(row.original.id)}
        />
      ),
      enableSorting: false,
      meta: { className: "w-10 pr-0", headerClassName: "w-10 pr-0" },
    },
    {
      accessorKey: "asset_code",
      header: "Asset Code",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className="rounded-md border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs font-semibold text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
        >
          {row.original.asset_code}
        </Badge>
      ),
    },
    {
      accessorKey: "asset_type",
      header: "Type",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate font-medium text-gray-900 dark:text-white">
            {row.original.asset_type}
          </p>
          {row.original.model && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {row.original.model}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          tone={STATUS_BADGE_TONE[norm(row.original.status)] ?? "gray"}
          dot
        >
          {formatStatus(row.original.status)}
        </StatusBadge>
      ),
    },
    {
      id: "organization",
      header: "Organization",
      cell: ({ row }) => {
        const orgId = row.original.organization_id
        const name = orgId ? orgNameMap.get(orgId) : null
        return name ? (
          <span className="text-gray-700 dark:text-gray-300">{name}</span>
        ) : (
          <Dash />
        )
      },
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) =>
        row.original.location ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            {row.original.location}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      id: "assigned",
      header: "Assigned To",
      cell: ({ row }) => {
        const a = row.original
        if (a.assigned_email) {
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar className="size-7">
                <AvatarFallback className="bg-brand-500 text-[10px] font-semibold text-white">
                  {emailInitials(a.assigned_email)}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-[220px] truncate">{a.assigned_email}</span>
            </div>
          )
        }
        return a.assigned ? (
          <StatusBadge tone="indigo">Assigned</StatusBadge>
        ) : (
          <Dash />
        )
      },
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      meta: { className: "text-right", headerClassName: "text-right" },
      cell: ({ row }) => {
        const a = row.original
        return (
          <div className="flex items-center justify-end gap-1">
            <RowAction
              label="View asset"
              onClick={() => router.push(`/assets/${a.id}`)}
              className="hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
            >
              <Eye className="size-4" />
            </RowAction>
            <RowAction
              label="Edit asset"
              onClick={() => router.push(`/assets/edit/${a.id}`)}
              className="hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
            >
              <Pencil className="size-4" />
            </RowAction>
            <RowAction
              label="Delete asset"
              onClick={() => setDeleteId(a.id)}
              className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Trash2 className="size-4" />
            </RowAction>
          </div>
        )
      },
    },
  ]

  /* ---------------- FILTER SECTIONS (sidebar + mobile sheet) ---------------- */
  const filterSections = (
    <>
      {FACETS.map((f) => (
        <FacetFilter
          key={f.key}
          title={f.title}
          defaultOpen={f.defaultOpen}
          options={facetOptions[f.key]}
          selected={filters[f.key]}
          onToggle={(v) => toggleFilter(f.key, v)}
        />
      ))}

      <FilterSection title="Added on" defaultOpen>
        <Select value={added} onValueChange={setAdded}>
          <SelectTrigger size="sm" className="w-full rounded-lg" aria-label="Added on">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADDED_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>
    </>
  )

  const mobileFilterButton = (
    <Button
      variant="outline"
      size="sm"
      className="lg:hidden"
      onClick={() => setShowFilters((v) => !v)}
    >
      <SlidersHorizontal className="size-4" />
      Filters
      {activeChips.length > 0 && (
        <StatusBadge tone="indigo" className="px-1.5 py-0 text-[11px]">
          {activeChips.length}
        </StatusBadge>
      )}
    </Button>
  )

  /* ---------------- BULK BAR + ACTIVE FILTER CHIPS ---------------- */
  const allFilteredSelected =
    filteredAssets.length > 0 && filteredAssets.every((a) => selected.has(a.id))

  const subHeader =
    selected.size > 0 || activeChips.length > 0 ? (
      <div className="flex flex-col gap-3">
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50/70 px-3 py-2 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:ring-brand-500/20">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
                {allFilteredSelected
                  ? `All ${selected.size.toLocaleString()} assets selected`
                  : `${selected.size.toLocaleString()} selected`}
              </span>
              {!allFilteredSelected && filteredAssets.length > selected.size && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={selectAllFiltered}
                  className="h-auto px-0 text-sm font-semibold"
                >
                  Select all {filteredAssets.length.toLocaleString()} assets
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                className="text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Clear selection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExportMode("selected")
                  setExportOpen(true)
                }}
              >
                <Download className="size-4" />
                Export selected
              </Button>
              {canBulkDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Delete selected
                </Button>
              )}
            </div>
          </div>
        )}

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <Badge
                key={chip.id}
                variant="outline"
                className="gap-1 rounded-full border-brand-100 bg-brand-50 py-0.5 pl-3 pr-1 text-xs font-medium text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300"
              >
                {chip.label}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label}`}
                  className="size-5 rounded-full text-brand-500 hover:bg-brand-100 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-brand-500/20"
                >
                  <X className="size-3" />
                </Button>
              </Badge>
            ))}
            <Button
              variant="link"
              size="sm"
              onClick={clearFilters}
              className="h-auto px-1 text-xs text-gray-500 dark:text-gray-400"
            >
              Clear all
            </Button>
          </div>
        )}
      </div>
    ) : undefined

  /* ---------------- UI ---------------- */
  return (
    <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Assets"
          description="Track hardware inventory, assignments and warranty coverage across organizations."
          actions={
            <>
              {/* IMPORT */}
              <AssetImportDialog orgs={orgs} onImported={loadAssets} />

              {/* EXPORT */}
              <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Download className="size-4" />
                    Export
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Export Assets</DialogTitle>
                    <DialogDescription>
                      Excel export with hardware details, dates and the assigned user.
                    </DialogDescription>
                  </DialogHeader>

                  <FieldSet className="gap-3">
                    <FieldLegend className="sr-only">Rows to export</FieldLegend>
                    <RadioGroup
                      value={exportMode}
                      onValueChange={(v) =>
                        setExportMode(v as "all" | "selected")
                      }
                      className="gap-3"
                    >
                      <ExportOption
                        id="export-all"
                        value="all"
                        title={`Export ${isFiltered ? "filtered" : "all"} assets`}
                        description={
                          isFiltered
                            ? "Every asset matching the current filters and search"
                            : "Every asset in the inventory"
                        }
                        count={filteredAssets.length}
                      />
                      <ExportOption
                        id="export-selected"
                        value="selected"
                        disabled={selected.size === 0}
                        title="Export selected assets"
                        description={
                          selected.size === 0
                            ? "Select rows in the table to enable this option"
                            : "Only the rows you have checked"
                        }
                        count={selected.size}
                      />
                    </RadioGroup>
                  </FieldSet>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={() => handleExport(exportMode)}
                      disabled={
                        exportMode === "selected" &&
                        selected.size === 0
                      }
                    >
                      <Download className="size-4" />
                      Download Excel
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                onClick={() => router.push("/assets/create")}
              >
                <Plus className="size-4" />
                Add Asset
              </Button>
            </>
          }
        />

        {/* SUMMARY */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))
            : statCards.map((c, i) => (
              <StatCard
                key={c.label}
                label={c.label}
                value={c.value}
                icon={c.icon}
                hint={c.hint}
                tone={STAT_TONE_CYCLE[i % STAT_TONE_CYCLE.length]}
              />
            ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* SIDEBAR FILTERS (lg+) */}
          <aside className="hidden min-w-0 lg:block">
            <FilterPanel
              activeCount={activeChips.length}
              onClearAll={clearFilters}
            >
              {filterSections}
            </FilterPanel>
          </aside>

          {/* TABLE */}
          <DataTable
            columns={columns}
            data={paginatedAssets}
            loading={loading}
            title="Asset inventory"
            description={
              loading
                ? "Loading assets…"
                : `${filteredAssets.length.toLocaleString()} of ${assets.length.toLocaleString()} assets`
            }
            searchable
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search code, serial no, model, user, location…"
            filters={mobileFilterButton}
            subHeader={subHeader}
            pagination={{
              pageIndex: page - 1,
              pageSize,
              totalRows: filteredAssets.length,
              onPageChange: (index) => setPage(index + 1),
              onPageSizeChange: (size) => {
                setPageSize(size)
                setPage(1)
              },
            }}
            entityName="assets"
            getRowId={(r) => r.id}
            rowSelection={rowSelection}
            emptyIcon={Boxes}
            emptyTitle={
              isFiltered ? "No assets match your filters" : "No assets yet"
            }
            emptyDescription={
              isFiltered
                ? "Try removing a filter or changing your search."
                : "Add an asset or import a spreadsheet to get started."
            }
            emptyAction={
              isFiltered ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
            className="min-w-0"
          />
        </div>

        {/* MOBILE FILTERS (< lg) */}
        <Sheet open={showFilters} onOpenChange={setShowFilters}>
          <SheetContent side="left" className="w-full gap-0 p-0 sm:max-w-sm">
            <SheetHeader className="border-b border-gray-200 px-5 py-4 dark:border-white/10">
              <SheetTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-white">
                <SlidersHorizontal className="size-4 text-brand-600 dark:text-brand-300" />
                Filters
                {activeChips.length > 0 && (
                  <StatusBadge tone="indigo" className="px-2 text-[11px]">
                    {activeChips.length}
                  </StatusBadge>
                )}
              </SheetTitle>
              <SheetDescription>Narrow down the asset list.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">{filterSections}</div>
            <SheetFooter className="flex-row gap-2 border-t border-gray-200 px-5 py-4 dark:border-white/10">
              <Button
                variant="outline"
                className="flex-1"
                onClick={clearFilters}
                disabled={activeChips.length === 0}
              >
                Clear all
              </Button>
              <Button
                className="flex-1"
                onClick={() => setShowFilters(false)}
              >
                Show {filteredAssets.length.toLocaleString()} results
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog
          open={deleteId !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteId(null)
          }}
          title={`Delete ${deleteTarget?.asset_code ?? "this asset"}?`}
          description="This permanently removes the asset together with its hardware details and assignment records. This cannot be undone."
          confirmLabel="Delete asset"
          onConfirm={() => {
            if (deleteId) handleDeleteRow(deleteId)
          }}
        />

        <ConfirmDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          title={`Delete ${selected.size.toLocaleString()} asset${selected.size === 1 ? "" : "s"}?`}
          description="This permanently removes the selected assets together with their hardware details and assignment records. This cannot be undone."
          confirmLabel={`Delete ${selected.size.toLocaleString()} asset${selected.size === 1 ? "" : "s"}`}
          onConfirm={handleBulkDelete}
        />
      </div>
    </RoleGate>
  )
}
