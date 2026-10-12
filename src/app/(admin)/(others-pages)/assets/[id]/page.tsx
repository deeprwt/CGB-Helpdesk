"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { supabase } from "@/lib/supabaseClient"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import RoleGate from "@/components/auth/RoleGate"
import { toast } from "sonner"
import {
  ArrowLeft,
  CalendarClock,
  Cpu,
  History,
  Loader2,
  Package,
  Pencil,
  Ticket,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react"

/* ---------------- TYPES ---------------- */

type Asset = {
  id: string
  asset_code: string
  asset_type: string
  status: string
  location: string | null
  model: string | null
  department: string | null
  room: string | null
  purchase_date: string | null
  warranty_expiry: string | null
  organization: { name: string; domain: string } | null
}

type AssetDetail = {
  key: string
  value: string
}

type Assignment = {
  id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
  returned_at: string | null
}

type User = {
  id: string
  email: string
}

type AssignmentHistoryRow = {
  order: number
  user_email: string
  assigned_by_email: string | null
  assigned_at: string
  returned_at: string | null
  isCurrent: boolean
}

/* ---------------- DISPLAY HELPERS ---------------- */

const STATUS_META: Record<string, { label: string; tone: BadgeTone; dot: string }> = {
  in_use: { label: "In Use", tone: "emerald", dot: "bg-emerald-400" },
  spare: { label: "Spare", tone: "amber", dot: "bg-amber-400" },
  retired: { label: "Retired", tone: "gray", dot: "bg-gray-400" },
}

const statusMeta = (status: string) =>
  STATUS_META[(status ?? "").trim().toLowerCase()] ?? {
    label: status,
    tone: "gray" as BadgeTone,
    dot: "bg-gray-400",
  }

function warrantyInfo(expiry: string | null): { label: string; tone: BadgeTone } {
  if (!expiry) return { label: "Not set", tone: "gray" }
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000
  if (days < 0) return { label: "Expired", tone: "red" }
  if (days <= 30) return { label: "Expiring soon", tone: "amber" }
  return { label: "Active", tone: "emerald" }
}

const DETAIL_LABELS: Record<string, string> = {
  serial_no: "Serial No",
  cpu: "CPU",
  ram: "RAM",
  storage: "Storage",
  os_name: "OS Name",
  mac_address: "MAC Address",
  vendor: "Vendor",
}

const MONO_DETAILS = new Set(["serial_no", "mac_address"])

const detailLabel = (key: string) =>
  DETAIL_LABELS[key] ?? key.replace(/_/g, " ").toUpperCase()

const ordinal = (n: number) =>
  `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`

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

function SectionHeader({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: LucideIcon
  tone: string
  title: string
  description?: string
}) {
  return (
    <CardHeader className="flex flex-row items-center gap-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
          tone
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <CardTitle className="text-base text-gray-900 dark:text-white">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="mt-1 text-gray-500 dark:text-gray-400">
            {description}
          </CardDescription>
        )}
      </div>
    </CardHeader>
  )
}

/** Label / value tile used in the definition grids */
function DetailItem({
  label,
  children,
  mono,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-xl bg-gray-50/70 px-4 py-3 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:ring-white/5">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words text-sm font-medium text-gray-900 dark:text-white",
          mono && "font-mono"
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/** Inline label / value row used in the side cards */
function InfoRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-gray-900 dark:text-white">
        {children}
      </dd>
    </div>
  )
}

const historyColumns: ColumnDef<AssignmentHistoryRow>[] = [
  {
    id: "order",
    header: "Assignment",
    cell: ({ row }) => (
      <span className="font-medium text-gray-900 dark:text-white">
        {ordinal(row.original.order)}
      </span>
    ),
  },
  {
    accessorKey: "user_email",
    header: "User",
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-7">
          <AvatarFallback className="bg-brand-500 text-[10px] font-semibold text-white">
            {emailInitials(row.original.user_email)}
          </AvatarFallback>
        </Avatar>
        <span className="max-w-[240px] truncate">{row.original.user_email}</span>
      </div>
    ),
  },
  {
    accessorKey: "assigned_at",
    header: "Assigned On",
    cell: ({ row }) => new Date(row.original.assigned_at).toLocaleString(),
  },
  {
    accessorKey: "returned_at",
    header: "Returned On",
    cell: ({ row }) =>
      row.original.returned_at ? (
        new Date(row.original.returned_at).toLocaleString()
      ) : (
        <Dash />
      ),
  },
  {
    accessorKey: "assigned_by_email",
    header: "Assigned By",
    cell: ({ row }) => row.original.assigned_by_email ?? <Dash />,
  },
  {
    id: "state",
    header: "Status",
    cell: ({ row }) =>
      row.original.isCurrent ? (
        <StatusBadge tone="emerald" dot>
          Current
        </StatusBadge>
      ) : (
        <StatusBadge tone="gray">Returned</StatusBadge>
      ),
  },
]

/* ---------------- COMPONENT ---------------- */

export default function AssetDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [asset, setAsset] = React.useState<Asset | null>(null)
  const [details, setDetails] = React.useState<AssetDetail[]>([])
  const [assignments, setAssignments] = React.useState<
    AssignmentHistoryRow[]
  >([])

  const [loading, setLoading] = React.useState(true)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    const loadAll = async () => {
      setLoading(true)

      /* 1️⃣ ASSET */
      // "*" keeps this working even before organization_id exists
      const { data: asset } = await supabase
        .from("assets")
        .select("*")
        .eq("id", id)
        .single()

      let organization: Asset["organization"] = null
      if (asset?.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name, domain")
          .eq("id", asset.organization_id)
          .single()
        organization = org ?? null
      }

      /* 2️⃣ DETAILS */
      const { data: details } = await supabase
        .from("asset_details")
        .select("key, value")
        .eq("asset_id", id)

      /* 3️⃣ ASSIGNMENTS (IMPORTANT FIX) */
      const { data: assignmentRows } = await supabase
        .from("asset_assignments")
        .select(`
          id,
          user_id,
          assigned_by,
          assigned_at,
          returned_at
        `)
        .eq("asset_id", id)
        .order("assigned_at", { ascending: true })

      /* 4️⃣ USERS */
      const { data: users } = await supabase
        .from("users")
        .select("id, email")

      const userMap = new Map<string, string>(
        (users ?? []).map((u) => [u.id, u.email])
      )

      /* 5️⃣ MAP ASSIGNMENT HISTORY */
      const mappedAssignments =
        assignmentRows?.map((a, index) => ({
          order: index + 1,
          user_email: userMap.get(a.user_id) ?? "Unknown user",
          assigned_by_email: a.assigned_by
            ? userMap.get(a.assigned_by) ?? null
            : null,
          assigned_at: a.assigned_at,
          returned_at: a.returned_at,
          isCurrent: a.returned_at === null,
        })) ?? []

      setAsset(asset ? { ...asset, organization } : null)
      setDetails(details ?? [])
      setAssignments(mappedAssignments)
      setLoading(false)
    }

    loadAll()
  }, [id])

  /* ---------------- DELETE (same queries as the asset list) ---------------- */
  const handleDelete = async () => {
    setDeleting(true)

    await supabase.from("asset_assignments").delete().eq("asset_id", id)
    await supabase.from("asset_details").delete().eq("asset_id", id)
    await supabase.from("assets").delete().eq("id", id)

    toast.success("Asset deleted")
    router.push("/assets")
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 w-full rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    )
  }

  if (!asset) {
    return (
      <Card>
        <EmptyState
          icon={Package}
          title="Asset not found"
          description="It may have been deleted, or the link is incorrect."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/assets">
                <ArrowLeft className="size-4" />
                Back to assets
              </Link>
            </Button>
          }
        />
      </Card>
    )
  }

  const status = statusMeta(asset.status)
  const warranty = warrantyInfo(asset.warranty_expiry)
  const current = [...assignments].reverse().find((a) => a.isCurrent) ?? null

  return (
    <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          variant="hero"
          breadcrumbs={[
            { label: "Assets", href: "/assets" },
            { label: asset.asset_code },
          ]}
          eyebrow="Asset"
          eyebrowIcon={Package}
          title={asset.asset_code}
          description={[asset.asset_type, asset.model].filter(Boolean).join(" · ")}
          meta={[
            { label: status.label, dot: status.dot },
            ...(asset.organization
              ? [{ label: asset.organization.name, dot: "bg-brand-400" }]
              : []),
            ...(asset.location
              ? [{ label: asset.location, dot: "bg-sky-400" }]
              : []),
            current
              ? { label: `Assigned to ${current.user_email}`, dot: "bg-emerald-400" }
              : { label: "Unassigned", dot: "bg-gray-400" },
          ]}
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="border-red-200 bg-white/80 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:bg-gray-900/60 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete
              </Button>
              <Button asChild>
                <Link href={`/assets/edit/${asset.id}`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
            </>
          }
        >
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone} dot>
              {status.label}
            </StatusBadge>
            <StatusBadge tone={warranty.tone}>
              Warranty: {warranty.label}
            </StatusBadge>
          </div>
        </PageHeader>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* BASICS */}
          <Card className="lg:col-span-2">
            <SectionHeader
              icon={Package}
              tone="bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20"
              title="Asset basics"
              description="Identity, ownership and placement"
            />
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <DetailItem label="Organization">
                  {asset.organization ? (
                    <>
                      {asset.organization.name}
                      <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                        {asset.organization.domain}
                      </span>
                    </>
                  ) : (
                    <Dash />
                  )}
                </DetailItem>
                <DetailItem label="Type">{asset.asset_type}</DetailItem>
                <DetailItem label="Model">{asset.model || <Dash />}</DetailItem>
                <DetailItem label="Status">
                  <StatusBadge tone={status.tone} dot>
                    {status.label}
                  </StatusBadge>
                </DetailItem>
                <DetailItem label="Location">{asset.location ?? <Dash />}</DetailItem>
                <DetailItem label="Department">{asset.department ?? <Dash />}</DetailItem>
                <DetailItem label="Room">{asset.room ?? <Dash />}</DetailItem>
              </dl>
            </CardContent>
          </Card>

          {/* CURRENT ASSIGNMENT */}
          <Card>
            <SectionHeader
              icon={UserRound}
              tone="bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
              title="Current assignment"
              description="Who has this asset right now"
            />
            <CardContent>
              {current ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 rounded-xl bg-gray-50/70 p-3 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:ring-white/5">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
                        {emailInitials(current.user_email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {current.user_email}
                      </p>
                      <StatusBadge tone="emerald" dot className="mt-1">
                        Current
                      </StatusBadge>
                    </div>
                  </div>
                  <dl className="divide-y divide-gray-100 dark:divide-white/5">
                    <InfoRow label="Assigned on">
                      {new Date(current.assigned_at).toLocaleString()}
                    </InfoRow>
                    <InfoRow label="Assigned by">
                      {current.assigned_by_email ?? <Dash />}
                    </InfoRow>
                  </dl>
                </div>
              ) : (
                <EmptyState
                  icon={UserRound}
                  title="Not assigned"
                  description="This asset isn't assigned to anyone."
                  className="py-6"
                />
              )}
            </CardContent>
          </Card>

          {/* HARDWARE DETAILS */}
          <Card className="lg:col-span-2">
            <SectionHeader
              icon={Cpu}
              tone="bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20"
              title="Asset details"
              description="Hardware specification and vendor"
            />
            <CardContent>
              {details.length === 0 ? (
                <EmptyState
                  icon={Cpu}
                  title="No details added"
                  className="py-6"
                />
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {details.map((d) => (
                    <DetailItem
                      key={d.key}
                      label={detailLabel(d.key)}
                      mono={MONO_DETAILS.has(d.key)}
                    >
                      {d.value}
                    </DetailItem>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          {/* PURCHASE & WARRANTY */}
          <Card>
            <SectionHeader
              icon={CalendarClock}
              tone="bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20"
              title="Purchase & warranty"
              description="Lifecycle dates"
            />
            <CardContent>
              <dl className="divide-y divide-gray-100 dark:divide-white/5">
                <InfoRow label="Purchase date">
                  {asset.purchase_date ?? <Dash />}
                </InfoRow>
                <InfoRow label="Warranty expiry">
                  {asset.warranty_expiry ?? <Dash />}
                </InfoRow>
                <InfoRow label="Coverage">
                  <StatusBadge tone={warranty.tone} dot>
                    {warranty.label}
                  </StatusBadge>
                </InfoRow>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* ASSIGNMENT HISTORY */}
        <DataTable
          columns={historyColumns}
          data={assignments}
          title="Assignment history"
          description="Every user this asset has been assigned to, oldest first"
          entityName="assignments"
          getRowId={(r) => String(r.order)}
          emptyIcon={History}
          emptyTitle="Asset has never been assigned"
        />

        {/* TICKETS */}
        <Card>
          <SectionHeader
            icon={Ticket}
            tone="bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20"
            title="Ticket history"
          />
          <CardContent>
            <EmptyState
              icon={Ticket}
              title="No linked tickets yet"
              description="Asset-related tickets will be listed here."
              className="py-6"
            />
          </CardContent>
        </Card>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${asset.asset_code}?`}
          description="This permanently removes the asset together with its hardware details and assignment records. This cannot be undone."
          confirmLabel="Delete asset"
          loading={deleting}
          onConfirm={handleDelete}
        />
      </div>
    </RoleGate>
  )
}
