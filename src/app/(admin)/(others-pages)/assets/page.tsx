"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabaseClient"
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
  Eye,
  Pencil,
  Trash2,
  Download,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import RoleGate from "@/components/auth/RoleGate"

/* ---------------- TYPES ---------------- */

type Asset = {
  id: string
  asset_code: string
  asset_type: string
  status: string
  location: string | null
}

type AssetRow = Asset & {
  assigned_email: string | null
}

const PAGE_SIZE = 10

export default function AssetsPage() {
  const router = useRouter()

  const [assets, setAssets] = React.useState<AssetRow[]>([])
  const [loading, setLoading] = React.useState(true)

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

    const [{ data: assets }, { data: assignments }, { data: users }] =
      await Promise.all([
        supabase
          .from("assets")
          .select("id, asset_code, asset_type, status, location")
          .order("created_at", { ascending: false }),

        supabase
          .from("asset_assignments")
          .select("asset_id, user_id"),

        supabase.from("users").select("id, email"),
      ])

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

    const rows: AssetRow[] =
      assets?.map((a) => ({
        ...a,
        assigned_email: assignmentMap.get(a.id) ?? null,
      })) ?? []

    setAssets(rows)
    setLoading(false)
  }

  React.useEffect(() => {
    loadAssets()
  }, [])

  /* ---------------- PAGINATION ---------------- */
  const totalPages = Math.ceil(assets.length / PAGE_SIZE)

  const paginatedAssets = assets.slice(
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
    const ids =
      mode === "selected" ? Array.from(selected) : null

    const [
      { data: assets },
      { data: details },
      { data: assignments },
      { data: users },
    ] = await Promise.all([
      supabase.from("assets").select("*").in("id", ids ?? []),
      supabase.from("asset_details").select("asset_id, key, value"),
      supabase.from("asset_assignments").select("asset_id, user_id"),
      supabase.from("users").select("id, email"),
    ])

    if (!assets || assets.length === 0) {
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
        asset_code: a.asset_code,
        asset_type: a.asset_type,
        model: a.model,
        status: a.status,
        location: a.location,
        department: a.department,
        room: a.room,

        purchase_date: a.purchase_date ?? "",
        warranty_expiry: a.warranty_expiry ?? "",
        created_at: a.created_at ?? "",

        serial_no: d.serial_no ?? "",
        cpu: d.cpu ?? "",
        ram: d.ram ?? "",
        storage: d.storage ?? "",
        os_name: d.os_name ?? "",
        os_version: d.os_version ?? "",
        ip_address: d.ip_address ?? "",
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

  /* ---------------- IMPORT (ALL FIELDS) ---------------- */
  const handleImport = async () => {
    if (!file) return

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

    for (const r of rows) {
      const { data: asset } = await supabase
        .from("assets")
        .insert({
          asset_code: r.asset_code,
          asset_type: r.asset_type,
          model: r.model ?? "",
          status: r.status ?? "in_use",
          location: r.location ?? null,
          department: r.department ?? "",
          room: r.room ?? "",
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
        os_version: r.os_version,
        ip_address: r.ip_address,
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
    <RoleGate allowedRoles={["engineer", "admin"]}>
      <Card className="p-6 space-y-6">
        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            Assets
            {selected.size > 0 &&
              ` (${selected.size} selected)`}
          </h2>

          <div className="flex gap-2">
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
                    <Label>Export ALL ({assets.length})</Label>
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

                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) =>
                    setFile(e.target.files?.[0] ?? null)
                  }
                />

                <Button
                  className="w-full mt-4"
                  disabled={!file}
                  onClick={handleImport}
                >
                  Upload
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

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
                  <TableHead>Location</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
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
                    <TableCell>{a.status}</TableCell>
                    <TableCell>{a.location ?? "-"}</TableCell>
                    <TableCell>
                      {a.assigned_email ?? "—"}
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
      </Card>
    </RoleGate>
  )
}
