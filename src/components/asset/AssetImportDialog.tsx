"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabaseClient"
import { extractOrgDomain, type Organization } from "@/lib/org"
import { assetCodeKey, fetchExistingAssetCodes, UNIQUE_VIOLATION } from "@/lib/asset-codes"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"

type SheetRow = Record<string, unknown>

type PlannedRow = { rowNumber: number; code: string; row: SheetRow }

type IssueKind = "existing" | "file_duplicate" | "missing_code" | "failed"

type Issue = { rowNumber: number; code: string; kind: IssueKind; reason: string }

type Plan = { totalRows: number; toImport: PlannedRow[]; issues: Issue[] }

type Progress = {
  done: number
  total: number
  imported: number
  failed: Issue[]
  currentCode: string
  startedAt: number
  finishedAt?: number
}

type Stage = "select" | "checking" | "review" | "importing" | "done"

const ISSUE_META: Record<IssueKind, { label: string; tone: BadgeTone }> = {
  existing: { label: "Already exists", tone: "amber" },
  file_duplicate: { label: "Duplicate in file", tone: "orange" },
  missing_code: { label: "No asset code", tone: "rose" },
  failed: { label: "Failed", tone: "red" },
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
const str = (v: unknown) => {
  const s = String(v ?? "").trim()
  return s === "" ? undefined : s
}

/** 65000 → "1m 05s" */
function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`
  return `${s}s`
}

export function AssetImportDialog({
  orgs,
  onImported,
}: {
  orgs: Organization[]
  /** Called once after an import run finishes (to reload the list) */
  onImported: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [stage, setStage] = React.useState<Stage>("select")
  const [file, setFile] = React.useState<File | null>(null)
  const [plan, setPlan] = React.useState<Plan | null>(null)
  const [progress, setProgress] = React.useState<Progress | null>(null)
  const [now, setNow] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const busy = stage === "checking" || stage === "importing"

  // Tick once a second while importing so elapsed / remaining time stay live
  React.useEffect(() => {
    if (stage !== "importing") return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [stage])

  // Warn before closing the tab mid-import
  React.useEffect(() => {
    if (stage !== "importing") return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [stage])

  const reset = () => {
    setStage("select")
    setFile(null)
    setPlan(null)
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleOpenChange = (next: boolean) => {
    if (busy) return // can't close while checking/importing
    setOpen(next)
    if (!next) reset()
  }

  /* ---------------- TEMPLATE ---------------- */
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

  /* ---------------- STEP 1: READ + DUPLICATE CHECK ---------------- */
  const analyzeFile = async (f: File) => {
    setFile(f)
    setStage("checking")
    try {
      const workbook = XLSX.read(await f.arrayBuffer())
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      // raw:false + dateNF turns Excel date cells into "2025-01-15" instead of serial numbers
      const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { raw: false, dateNF: "yyyy-mm-dd" })
      const existing = await fetchExistingAssetCodes()

      const seenInFile = new Map<string, number>() // code key → first row number
      const toImport: PlannedRow[] = []
      const issues: Issue[] = []

      rows.forEach((row, i) => {
        const rowNumber = i + 2 // row 1 is the header
        const code = String(row.asset_code ?? "").trim()
        const key = assetCodeKey(code)

        if (!key) {
          issues.push({ rowNumber, code: "—", kind: "missing_code", reason: "The asset_code column is empty" })
        } else if (existing.has(key)) {
          issues.push({
            rowNumber,
            code,
            kind: "existing",
            reason: `Asset code ${existing.get(key)} is already in the system`,
          })
        } else if (seenInFile.has(key)) {
          issues.push({
            rowNumber,
            code,
            kind: "file_duplicate",
            reason: `Same code as row ${seenInFile.get(key)} in this file`,
          })
        } else {
          seenInFile.set(key, rowNumber)
          toImport.push({ rowNumber, code, row })
        }
      })

      setPlan({ totalRows: rows.length, toImport, issues })
      setStage("review")
    } catch (err) {
      console.error("Import check failed:", err)
      toast.error(`Couldn't read the file${err instanceof Error ? `: ${err.message}` : ""}`)
      reset()
    }
  }

  /* ---------------- STEP 2: IMPORT WITH PROGRESS ---------------- */
  const importOne = async (
    { code, row: r }: PlannedRow,
    userIdByEmail: Map<string, string | null>
  ): Promise<string | null> => {
    // Organization: explicit column, else the assigned user's email domain
    const assignedEmail = str(r.assigned_user_email)
    const orgDomain = norm(r.organization_domain || (assignedEmail ? extractOrgDomain(assignedEmail) : ""))
    const org = orgs.find((o) => o.domain === orgDomain)

    const { data: asset, error } = await supabase
      .from("assets")
      .insert({
        ...(org ? { organization_id: org.id } : {}),
        asset_code: code,
        asset_type: str(r.asset_type),
        model: str(r.model) ?? "",
        status: str(r.status) ?? "in_use",
        location: str(r.location) ?? null,
        department: str(r.department) ?? "",
        purchase_date: str(r.purchase_date) || null,
        warranty_expiry: str(r.warranty_expiry) || null,
      })
      .select()
      .single()

    if (error || !asset) {
      if (error?.code === UNIQUE_VIOLATION) return "Asset code already exists"
      return error?.message ?? "Asset was not created"
    }

    const detailRows = Object.entries({
      serial_no: str(r.serial_no),
      cpu: str(r.cpu),
      ram: str(r.ram),
      storage: str(r.storage),
      os_name: str(r.os_name),
      mac_address: str(r.mac_address),
      vendor: str(r.vendor),
    })
      .filter(([, v]) => v)
      .map(([key, value]) => ({ asset_id: asset.id, key, value }))

    if (detailRows.length) {
      await supabase.from("asset_details").insert(detailRows)
    }

    if (assignedEmail) {
      // Look each email up once per run
      if (!userIdByEmail.has(assignedEmail)) {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("email", assignedEmail)
          .single()
        userIdByEmail.set(assignedEmail, user?.id ?? null)
      }
      const userId = userIdByEmail.get(assignedEmail)
      if (userId) {
        await supabase.from("asset_assignments").insert({ asset_id: asset.id, user_id: userId })
      }
    }

    return null
  }

  const handleImport = async () => {
    if (!plan || plan.toImport.length === 0) return
    const startedAt = Date.now()
    const userIdByEmail = new Map<string, string | null>()
    const failed: Issue[] = []
    let imported = 0

    setNow(startedAt)
    setStage("importing")
    setProgress({ done: 0, total: plan.toImport.length, imported: 0, failed: [], currentCode: "", startedAt })

    for (let i = 0; i < plan.toImport.length; i++) {
      const item = plan.toImport[i]
      setProgress((p) => (p ? { ...p, currentCode: item.code } : p))

      let failure: string | null
      try {
        failure = await importOne(item, userIdByEmail)
      } catch (err) {
        failure = err instanceof Error ? err.message : "Unexpected error"
      }

      if (failure) failed.push({ rowNumber: item.rowNumber, code: item.code, kind: "failed", reason: failure })
      else imported++

      setProgress((p) => (p ? { ...p, done: i + 1, imported, failed: [...failed] } : p))
    }

    const finishedAt = Date.now()
    setNow(finishedAt)
    setProgress((p) => (p ? { ...p, currentCode: "", finishedAt } : p))
    setStage("done")
    onImported()

    if (failed.length === 0) toast.success(`Imported ${imported} asset${imported === 1 ? "" : "s"}`)
    else toast.warning(`Imported ${imported}, ${failed.length} failed — see the report`)
  }

  /* ---------------- REPORT ---------------- */
  const allIssues = React.useMemo(
    () => [...(plan?.issues ?? []), ...(progress?.failed ?? [])].sort((a, b) => a.rowNumber - b.rowNumber),
    [plan, progress]
  )

  const handleDownloadReport = () => {
    const ws = XLSX.utils.json_to_sheet(
      allIssues.map((i) => ({
        row: i.rowNumber,
        asset_code: i.code,
        result: ISSUE_META[i.kind].label,
        reason: i.reason,
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Import report")
    XLSX.writeFile(wb, "asset-import-report.xlsx")
  }

  /* ---------------- DERIVED ---------------- */
  const count = (kind: IssueKind) => plan?.issues.filter((i) => i.kind === kind).length ?? 0
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const elapsed = progress ? (progress.finishedAt ?? now) - progress.startedAt : 0
  const remaining =
    progress && progress.done > 0 ? (elapsed / progress.done) * (progress.total - progress.done) : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          Import
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import Assets</DialogTitle>
          <DialogDescription>
            {stage === "importing"
              ? "Importing — keep this window open until it finishes."
              : stage === "done"
                ? "Import finished."
                : "Rows whose asset code already exists, or repeats in the file, are skipped — codes are never duplicated."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: template + file ─────────────────────────────────── */}
        {(stage === "select" || stage === "checking") && (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>1. Get the template</FieldLabel>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-white/10">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20">
                  <FileSpreadsheet className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">asset-import-template.xlsx</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Every supported column, with a sample row</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="size-4" />
                  Template
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-import-file">2. Upload your file</FieldLabel>
              <input
                ref={inputRef}
                id="asset-import-file"
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) analyzeFile(f)
                }}
              />
              <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
                  {stage === "checking" ? <Loader2 className="size-5 animate-spin" /> : <CloudUpload className="size-5" />}
                </span>
                {stage === "checking" ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Checking <span className="font-medium">{file?.name}</span> for duplicate asset codes…
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Excel (.xlsx) or CSV file</p>
                    <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                      Choose file
                    </Button>
                  </>
                )}
              </div>
            </Field>
          </FieldGroup>
        )}

        {/* ── Step 2: review duplicate check ──────────────────────────── */}
        {stage === "review" && plan && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">{file?.name}</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={reset}
                aria-label="Choose a different file"
                className="text-gray-500 hover:text-red-600"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile label="Ready to import" value={plan.toImport.length} tone="emerald" icon={CheckCircle2} />
              <SummaryTile label="Already exist" value={count("existing")} tone="amber" icon={AlertTriangle} />
              <SummaryTile label="Duplicate in file" value={count("file_duplicate")} tone="orange" icon={Copy} />
              <SummaryTile label="No asset code" value={count("missing_code")} tone="rose" icon={XCircle} />
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {plan.totalRows.toLocaleString()} row{plan.totalRows === 1 ? "" : "s"} in the file.{" "}
              {plan.issues.length > 0
                ? `${plan.issues.length.toLocaleString()} will be skipped:`
                : "No duplicates found."}
            </p>

            {plan.issues.length > 0 && <IssueList issues={plan.issues} />}
          </div>
        )}

        {/* ── Step 3: progress ────────────────────────────────────────── */}
        {(stage === "importing" || stage === "done") && progress && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {stage === "done" ? "Completed" : "Importing"} {progress.done.toLocaleString()} of{" "}
                  {progress.total.toLocaleString()}
                </p>
                <span className="text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-300">{percent}%</span>
              </div>
              <Progress
                value={percent}
                className={cn(
                  "h-2.5",
                  stage === "done" &&
                    progress.failed.length === 0 &&
                    "[&_[data-slot=progress-indicator]]:bg-emerald-500"
                )}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="tabular-nums">
                  {stage === "done" ? "Took" : "Elapsed"} {formatDuration(elapsed)}
                </span>
                {stage === "importing" && (
                  <span className="tabular-nums">
                    {remaining === null ? "Estimating time left…" : `About ${formatDuration(remaining)} remaining`}
                  </span>
                )}
              </div>
              {stage === "importing" && progress.currentCode && (
                <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  <Loader2 className="size-3 animate-spin" />
                  Importing <span className="font-mono font-medium text-gray-700 dark:text-gray-200">{progress.currentCode}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <SummaryTile label="Imported" value={progress.imported} tone="emerald" icon={CheckCircle2} />
              <SummaryTile label="Skipped" value={plan?.issues.length ?? 0} tone="amber" icon={AlertTriangle} />
              <SummaryTile label="Failed" value={progress.failed.length} tone="rose" icon={XCircle} />
            </div>

            {stage === "done" && allIssues.length > 0 && <IssueList issues={allIssues} />}
          </div>
        )}

        <DialogFooter>
          {stage === "review" && plan && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={plan.toImport.length === 0} onClick={handleImport}>
                <Upload className="size-4" />
                Import {plan.toImport.length.toLocaleString()} asset{plan.toImport.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {stage === "importing" && (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" />
              Importing…
            </Button>
          )}
          {stage === "done" && (
            <>
              {allIssues.length > 0 && (
                <Button variant="outline" onClick={handleDownloadReport}>
                  <Download className="size-4" />
                  Download report
                </Button>
              )}
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </>
          )}
          {(stage === "select" || stage === "checking") && (
            <Button variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const TILE_TONES: Record<"emerald" | "amber" | "orange" | "rose", string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
}

function SummaryTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  tone: keyof typeof TILE_TONES
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5 ring-1", TILE_TONES[tone])}>
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ScrollArea className="rounded-xl border border-gray-200 dark:border-white/10 [&>[data-slot=scroll-area-viewport]]:max-h-48">
      <ul className="divide-y divide-gray-100 dark:divide-white/5">
        {issues.map((i) => (
          <li key={`${i.kind}-${i.rowNumber}`} className="flex items-start gap-3 px-3 py-2">
            <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-gray-400">Row {i.rowNumber}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">{i.code}</span>
                <StatusBadge tone={ISSUE_META[i.kind].tone} className="px-2 py-0 text-[10px]">
                  {ISSUE_META[i.kind].label}
                </StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{i.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}
