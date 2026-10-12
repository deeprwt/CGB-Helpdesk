"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabaseClient"
import {
  getUserAccessibleDomains,
  buildEmailDomainFilter,
  extractOrgDomain,
  type Organization,
} from "@/lib/org"
import { useRouter } from "next/navigation"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Eye,
  Pencil,
  Trash2,
  Download,
  Upload,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { toast } from "sonner"
import RoleGate from "@/components/auth/RoleGate"
import {
  FilterPanel,
  FilterSection,
  FacetFilter,
  type FacetOption,
} from "@/components/asset/AssetFilterSidebar"

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
}

const PAGE_SIZE = 10

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
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const [importOpen, setImportOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [exportMode, setExportMode] =
    React.useState<"all" | "selected">("all")

  const [file, setFile] = React.useState<File | null>(null)

  /* ---------------- LOAD ASSETS ---------------- */
  const loadAssets = async () => {
    setLoading(true)

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (!currentUser) { setLoading(false); return }
    const { data: profile } = await supabase.from("users").select("role").eq("id", currentUser.id).single()
    const domains = await getUserAccessibleDomains(supabase, currentUser.id, currentUser.email ?? "", profile?.role ?? "user")

    const [{ data: assets, error: assetsError }, { data: assignments }, { data: users }, { data: allOrgs }] =
      await Promise.all([
        // "*" keeps the list working even before organization_id exists
        // (supabase/migration_asset_organization.sql not yet run)
        supabase
          .from("assets")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("asset_assignments")
          .select("asset_id, user_id")
          .is("returned_at", null),

        // Only look up users within accessible org(s)
        supabase
          .from("users")
          .select("id, email")
          .or(buildEmailDomainFilter(domains)),

        supabase.from("organizations").select("id, name, domain").order("name"),
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

    // All assets are listed; organization is only used as a filter
    const rows: AssetRow[] = ((assets ?? []) as Asset[]).map((a) => ({
      ...a,
      organization_id: a.organization_id ?? null,
      assigned: assignmentMap.has(a.id),
      assigned_email: assignmentMap.get(a.id) ?? null,
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
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE))

  const paginatedAssets = filteredAssets.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
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

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const copy = new Set(prev)
      copy.has(id) ? copy.delete(id) : copy.add(id)
      return copy
    })
  }

  /* ---------------- DELETE (ROW) ---------------- */
  const handleDeleteRow = async (id: string) => {
    const ok = window.confirm("Delete this asset?")
    if (!ok) return

    await supabase.from("asset_assignments").delete().eq("asset_id", id)
    await supabase.from("asset_details").delete().eq("asset_id", id)
    await supabase.from("assets").delete().eq("id", id)

    toast.success("Asset deleted")
    loadAssets()
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
      supabase.from("assets").select("*"),
      supabase.from("asset_details").select("asset_id, key, value"),
      supabase.from("asset_assignments").select("asset_id, user_id").is("returned_at", null),
      supabase.from("users").select("id, email"),
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

  /* ---------------- DOWNLOAD IMPORT TEMPLATE ---------------- */
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        organization_domain: "cgbindia.com",
        asset_code: "CGB-001",
        asset_type: "Laptop",
        model: "Dell Latitude 5520",
        status: "in_use",
        location: "Delhi Office",
        department: "IT",
        purchase_date: "2025-01-15",
        warranty_expiry: "2027-01-15",
        serial_no: "SN12345678",
        cpu: "Intel i7-1165G7",
        ram: "16GB",
        storage: "512GB SSD",
        os_name: "Windows 11 Pro",
        mac_address: "AA:BB:CC:DD:EE:FF",
        vendor: "Dell Technologies",
        assigned_user_email: "user@company.com",
      },
    ]

    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Assets")
    XLSX.writeFile(wb, "asset-import-template.xlsx")
    toast.success("Template downloaded")
  }

  /* ---------------- IMPORT (ALL FIELDS) ---------------- */
  const handleImport = async () => {
    if (!file) return

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

    for (const r of rows) {
      // Organization: explicit column, else the assigned user's email domain
      const orgDomain = norm(
        r.organization_domain ||
        (r.assigned_user_email ? extractOrgDomain(r.assigned_user_email) : "")
      )
      const org = orgs.find((o) => o.domain === orgDomain)

      const { data: asset } = await supabase
        .from("assets")
        .insert({
          ...(org ? { organization_id: org.id } : {}),
          asset_code: r.asset_code,
          asset_type: r.asset_type,
          model: r.model ?? "",
          status: r.status ?? "in_use",
          location: r.location ?? null,
          department: r.department ?? "",
          purchase_date: r.purchase_date || null,
          warranty_expiry: r.warranty_expiry || null,
        })
        .select()
        .single()

      if (!asset) continue

      const detailRows = Object.entries({
        serial_no: r.serial_no,
        cpu: r.cpu,
        ram: r.ram,
        storage: r.storage,
        os_name: r.os_name,
        mac_address: r.mac_address,
        vendor: r.vendor,
      })
        .filter(([, v]) => v)
        .map(([key, value]) => ({
          asset_id: asset.id,
          key,
          value,
        }))

      if (detailRows.length) {
        await supabase.from("asset_details").insert(detailRows)
      }

      if (r.assigned_user_email) {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("email", r.assigned_user_email)
          .single()

        if (user) {
          await supabase.from("asset_assignments").insert({
            asset_id: asset.id,
            user_id: user.id,
          })
        }
      }
    }

    toast.success("Assets imported successfully")
    setImportOpen(false)
    setFile(null)
    loadAssets()
  }

  /* ---------------- UI ---------------- */
  return (
    <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
      <Card className="p-6 space-y-6">
        {/* HEADER */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-xl font-semibold">
            Assets
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {filteredAssets.length} of {assets.length}
              </span>
            )}
            {selected.size > 0 &&
              ` (${selected.size} selected)`}
          </h2>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push("/assets/create")}>
              Add Asset
            </Button>

            {/* EXPORT */}
            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Assets</DialogTitle>
                </DialogHeader>

                <RadioGroup
                  value={exportMode}
                  onValueChange={(v) =>
                    setExportMode(v as "all" | "selected")
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" />
                    <Label>
                      Export {isFiltered ? "FILTERED" : "ALL"} ({filteredAssets.length})
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value="selected"
                      disabled={selected.size === 0}
                    />
                    <Label>
                      Export SELECTED ({selected.size})
                    </Label>
                  </div>
                </RadioGroup>

                <Button
                  className="w-full mt-4"
                  onClick={() => handleExport(exportMode)}
                  disabled={
                    exportMode === "selected" &&
                    selected.size === 0
                  }
                >
                  Download Excel
                </Button>
              </DialogContent>
            </Dialog>

            {/* IMPORT */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Assets</DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                  Download the template to see the required format, fill in your data, then upload.
                </p>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>

                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) =>
                    setFile(e.target.files?.[0] ?? null)
                  }
                />

                <Button
                  className="w-full"
                  disabled={!file}
                  onClick={handleImport}
                >
                  Upload
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* SIDEBAR FILTERS */}
          <aside
            className={`${showFilters ? "block" : "hidden"} lg:block lg:w-64 shrink-0`}
          >
            <FilterPanel
              activeCount={activeChips.length}
              onClearAll={clearFilters}
            >
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
                  <SelectTrigger className="w-full">
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
            </FilterPanel>
          </aside>

          <div className="flex-1 min-w-0 space-y-4">
            {/* SEARCH */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search code, model, user, location, organization..."
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                className="lg:hidden"
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeChips.length > 0 && ` (${activeChips.length})`}
              </Button>
            </div>

            {/* ACTIVE FILTER CHIPS */}
            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {activeChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-500 dark:bg-brand-500/15 dark:text-brand-400"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      className="rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/20"
                      aria-label={`Remove ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-muted-foreground hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

        {/* TABLE */}
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={
                        paginatedAssets.length > 0 &&
                        paginatedAssets.every((a) =>
                          selected.has(a.id)
                        )
                      }
                      onCheckedChange={(v) =>
                        toggleAll(Boolean(v))
                      }
                    />
                  </TableHead>
                  <TableHead>Asset Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedAssets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No assets match your filters.{" "}
                      {isFiltered && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="font-medium text-brand-500 hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {paginatedAssets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(a.id)}
                        onCheckedChange={() =>
                          toggleOne(a.id)
                        }
                      />
                    </TableCell>
                    <TableCell>{a.asset_code}</TableCell>
                    <TableCell>{a.asset_type}</TableCell>
                    <TableCell>{formatStatus(a.status)}</TableCell>
                    <TableCell>
                      {a.organization_id
                        ? orgNameMap.get(a.organization_id) ?? "—"
                        : "—"}
                    </TableCell>
                    <TableCell>{a.location ?? "-"}</TableCell>
                    <TableCell>
                      {a.assigned_email ?? (a.assigned ? "Assigned" : "—")}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          router.push(`/assets/${a.id}`)
                        }
                      >
                        <Eye className="h-5 w-5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          router.push(`/assets/edit/${a.id}`)
                        }
                      >
                        <Pencil className="h-5 w-5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          handleDeleteRow(a.id)
                        }
                      >
                        <Trash2 className="h-5 w-5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* PAGINATION */}
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
          </div>
        </div>
      </Card>
    </RoleGate>
  )
}
