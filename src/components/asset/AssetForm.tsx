"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import { fetchAllRows } from "@/lib/fetch-all-rows"
import { type Organization } from "@/lib/org"
import { apiFetch, ApiError } from "@/lib/api-client"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  Cpu,
  Loader2,
  Package,
  Save,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { DUPLICATE_CODE, findAssetByCode } from "@/lib/asset-codes"

/* ---------------- UI HELPERS ---------------- */

const BASIC_FIELDS: [keyof AssetFormState, string, string][] = [
  ["asset_code", "Asset Code", "e.g. CGB-001"],
  ["asset_type", "Asset Type", "e.g. Laptop"],
  ["model", "Model", "e.g. Dell Latitude 5520"],
  ["location", "Location", "e.g. Delhi Office"],
  ["department", "Department", "e.g. IT"],
]

const DETAIL_FIELDS: [keyof AssetFormState, string, string][] = [
  ["serial_no", "Serial No", "e.g. SN12345678"],
  ["cpu", "CPU", "e.g. Intel i7-1165G7"],
  ["ram", "RAM", "e.g. 16GB"],
  ["storage", "Storage", "e.g. 512GB SSD"],
  ["os_name", "OS Name", "e.g. Windows 11 Pro"],
  ["mac_address", "MAC Address", "e.g. AA:BB:CC:DD:EE:FF"],
  ["vendor", "Vendor", "e.g. Dell Technologies"],
]

const STATUS_OPTIONS: { value: AssetFormState["status"]; label: string; dot: string }[] = [
  { value: "in_use", label: "In Use", dot: "bg-emerald-500" },
  { value: "spare", label: "Spare", dot: "bg-amber-500" },
  { value: "retired", label: "Retired", dot: "bg-gray-400" },
]

const emailInitials = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?"

function SectionLegend({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: LucideIcon
  tone: string
  title: string
  description: string
}) {
  return (
    <FieldLegend description={description}>
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
            tone
          )}
        >
          <Icon className="size-4" />
        </span>
        {title}
      </span>
    </FieldLegend>
  )
}

/* ---------------- TYPES ---------------- */

export type User = {
  id: string
  email: string
}

type Person = User & { tenant_id: string | null }

type Tenant = { id: string; name: string; status: string | null }

export type AssetFormState = {
  organization_id: string
  asset_code: string
  asset_type: string
  model: string
  status: "in_use" | "spare" | "retired"
  location: string
  department: string

  serial_no: string
  cpu: string
  ram: string
  storage: string
  os_name: string
  mac_address: string
  vendor: string
  purchase_date: string
  warranty_expiry: string
}

type Props = {
  mode: "create" | "edit"
  assetId?: string
  initialData?: AssetFormState
  initialAssignedUser?: User | null
  /** Edit mode: the asset's tenant. An asset can't be moved to another tenant. */
  initialTenantId?: string | null
}

export default function AssetForm({
  mode,
  assetId,
  initialData,
  initialAssignedUser = null,
  initialTenantId = null,
}: Props) {
  const router = useRouter()

  // The form is one page of sections (was tabs); a missing assignee
  // scrolls to the Assignment section and shows an inline error instead.
  const assignRef = React.useRef<HTMLDivElement>(null)
  const [assignError, setAssignError] = React.useState<string | null>(null)
  const [codeError, setCodeError] = React.useState<string | null>(null)

  const [loading, setLoading] = React.useState(false)

  const [form, setForm] = React.useState<AssetFormState>(
    initialData ?? {
      organization_id: "",
      asset_code: "",
      asset_type: "",
      model: "",
      status: "in_use",
      location: "",
      department: "",
      serial_no: "",
      cpu: "",
      ram: "",
      storage: "",
      os_name: "",
      mac_address: "",
      vendor: "",
      purchase_date: "",
      warranty_expiry: "",
    }
  )

  /* ---------------- PEOPLE + COMPANIES (+ TENANTS FOR SUPER ADMIN) ---------------- */
  // RLS scopes every read: the IT team sees its own tenant, a super admin sees all.
  const [people, setPeople] = React.useState<Person[]>([])
  const [orgs, setOrgs] = React.useState<Organization[]>([])
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false)
  const [tenantId, setTenantId] = React.useState<string | null>(initialTenantId)
  const [openAssign, setOpenAssign] = React.useState(false)
  const [selectedUser, setSelectedUser] =
    React.useState<User | null>(initialAssignedUser)

  React.useEffect(() => {
    const loadOptions = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) return
      const { data: profile } = await supabase
        .from("users")
        .select("role, tenant_id")
        .eq("id", currentUser.id)
        .single()
      const superAdmin = profile?.role === "superadmin"

      const [{ data: peopleRows }, { data: orgRows }, tenantRes] = await Promise.all([
        fetchAllRows<Person>((from, to) =>
          supabase
            .from("users")
            .select("id, email, tenant_id")
            .order("email")
            .order("id")
            .range(from, to)
        ),
        supabase
          .from("organizations")
          .select("id, name, domain, status, tenant_id")
          .order("name"),
        superAdmin
          ? supabase.from("tenants").select("id, name, status").order("name")
          : Promise.resolve({ data: [] as Tenant[] }),
      ])

      setIsSuperAdmin(superAdmin)
      setPeople(peopleRows.filter((p) => p.email))
      setOrgs((orgRows ?? []) as Organization[])
      setTenants((tenantRes.data ?? []) as Tenant[])
      // New assets go into the creator's own tenant unless a super admin picks another
      setTenantId((t) => t ?? profile?.tenant_id ?? null)
    }

    loadOptions()
  }, [])

  // Non-super-admins only ever receive their own tenant's rows (RLS);
  // a super admin narrows companies and people to the chosen tenant.
  const tenantCompanies = isSuperAdmin
    ? orgs.filter((o) => o.tenant_id === tenantId)
    : orgs
  const tenantPeople = isSuperAdmin
    ? people.filter((p) => p.tenant_id === tenantId)
    : people
  const selectedTenant = tenants.find((t) => t.id === tenantId) ?? null

  const handleTenantChange = (next: string) => {
    if (next === tenantId) return
    setTenantId(next)
    // Companies and people belong to one tenant: drop picks from the old one
    setForm((f) => ({ ...f, organization_id: "" }))
    setSelectedUser(null)
    setCodeError(null)
  }

  const handleOrgChange = (orgId: string) => {
    setForm((f) => ({ ...f, organization_id: orgId }))
  }

  const handleUserSelect = (u: User) => {
    setSelectedUser(u)
    setOpenAssign(false)
  }

  const showCodeError = (msg: string) => {
    setCodeError(msg)
    toast.error(msg)
    document.getElementById("asset-asset_code")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async () => {
    if (!selectedUser) {
      toast.error("Please assign this asset to a user")
      setAssignError("Please assign this asset to a user")
      assignRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }

    setLoading(true)

    // Asset codes are unique per tenant (case-insensitive); on edit, ignore this asset itself.
    // This is a friendly pre-check: the API enforces it and answers 409 "duplicate_code".
    const code = form.asset_code.trim()
    if (code) {
      try {
        const clash = await findAssetByCode(
          code,
          mode === "edit" ? assetId : undefined,
          isSuperAdmin ? tenantId : undefined
        )
        if (clash) {
          showCodeError(`Asset code ${clash.asset_code} is already used by another asset`)
          setLoading(false)
          return
        }
      } catch (err) {
        // If the check itself fails, don't block saving; log it for debugging
        console.error("Asset code check failed:", err)
      }
    }

    const body = {
      asset: {
        ...(form.organization_id ? { organization_id: form.organization_id } : {}),
        asset_code: form.asset_code,
        asset_type: form.asset_type,
        model: form.model,
        status: form.status,
        location: form.location,
        department: form.department,
        purchase_date: form.purchase_date,
        warranty_expiry: form.warranty_expiry,
      },
      // The server drops empty values; on edit it replaces all detail values
      details: {
        serial_no: form.serial_no,
        cpu: form.cpu,
        ram: form.ram,
        storage: form.storage,
        os_name: form.os_name,
        mac_address: form.mac_address,
        vendor: form.vendor,
      },
      assigned_user_id: selectedUser.id,
      ...(mode === "create" && isSuperAdmin && tenantId ? { tenant_id: tenantId } : {}),
    }

    try {
      if (mode === "create") {
        await apiFetch<{ id: string }>("/api/assets", { method: "POST", body })
      } else {
        await apiFetch<{ id: string }>(`/api/assets/${assetId}`, { method: "PATCH", body })
      }
    } catch (err) {
      setLoading(false)
      if (err instanceof ApiError && err.code === DUPLICATE_CODE) {
        showCodeError(err.message)
        return
      }
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error(`Failed to ${mode === "create" ? "create" : "update"} asset: ${message}`)
      return
    }

    toast.success(
      mode === "create" ? "Asset created" : "Asset updated"
    )
    // router.push(`/assets/${assetIdFinal}`)
    router.push(`/assets`)
  }


  /* ---------------- UI ---------------- */
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          {/* BASICS */}
          <Card>
            <CardContent>
              <FieldSet>
                <SectionLegend
                  icon={Package}
                  tone="bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20"
                  title="Asset basics"
                  description="Identity, ownership and where the asset lives."
                />
                <FieldGroup className="sm:grid-cols-2">
                  {isSuperAdmin && (
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="asset-tenant">Organisation</FieldLabel>
                      <Select
                        value={tenantId ?? undefined}
                        onValueChange={handleTenantChange}
                        disabled={mode === "edit"}
                      >
                        <SelectTrigger id="asset-tenant" className="w-full">
                          <SelectValue placeholder="Select organisation" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                              {t.status && t.status !== "active" ? ` (${t.status})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        {mode === "edit"
                          ? "An asset stays in the organisation it was created in."
                          : "The tenant this asset belongs to. Companies and people below follow it."}
                      </FieldDescription>
                    </Field>
                  )}

                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="asset-organization">
                      Company
                      <span className="font-normal text-gray-400 dark:text-gray-500">
                        (optional)
                      </span>
                    </FieldLabel>
                    <Select
                      value={form.organization_id || undefined}
                      onValueChange={handleOrgChange}
                    >
                      <SelectTrigger id="asset-organization" className="w-full">
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenantCompanies.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                            {o.domain ? ` (${o.domain})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {BASIC_FIELDS.map(([key, label, placeholder]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={`asset-${key}`}>{label}</FieldLabel>
                      <Input
                        id={`asset-${key}`}
                        placeholder={placeholder}
                        value={form[key]}
                        aria-invalid={key === "asset_code" && !!codeError}
                        onChange={(e) => {
                          setForm({ ...form, [key]: e.target.value })
                          if (key === "asset_code") setCodeError(null)
                        }}
                      />
                      {key === "asset_code" && <FieldError>{codeError}</FieldError>}
                    </Field>
                  ))}

                  <Field>
                    <FieldLabel htmlFor="asset-status">Status</FieldLabel>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          status: v as AssetFormState["status"],
                        })
                      }
                    >
                      <SelectTrigger id="asset-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            <span className={cn("size-2 rounded-full", s.dot)} />
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>

          {/* DETAILS */}
          <Card>
            <CardContent>
              <FieldSet>
                <SectionLegend
                  icon={Cpu}
                  tone="bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20"
                  title="Asset details"
                  description="Hardware specification and vendor. Empty fields are skipped."
                />
                <FieldGroup className="sm:grid-cols-2">
                  {DETAIL_FIELDS.map(([key, label, placeholder]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={`asset-${key}`}>{label}</FieldLabel>
                      <Input
                        id={`asset-${key}`}
                        placeholder={placeholder}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                        className={cn(
                          (key === "serial_no" || key === "mac_address") &&
                            "font-mono"
                        )}
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* ASSIGN */}
          <Card ref={assignRef}>
            <CardContent>
              <FieldSet>
                <SectionLegend
                  icon={UserRound}
                  tone="bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
                  title="Assign person"
                  description="Every asset must be assigned to a user."
                />
                <Field>
                  <FieldLabel htmlFor="asset-assignee" required>
                    Assign to User
                  </FieldLabel>
                  <Popover open={openAssign} onOpenChange={setOpenAssign}>
                    <PopoverTrigger asChild>
                      <Button
                        id="asset-assignee"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openAssign}
                        aria-invalid={!selectedUser && !!assignError}
                        className="w-full justify-between font-normal"
                      >
                        {selectedUser ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarFallback className="bg-brand-500 text-[10px] font-semibold text-white">
                                {emailInitials(selectedUser.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-gray-900 dark:text-white">
                              {selectedUser.email}
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">
                            Search user
                          </span>
                        )}
                        <ChevronsUpDown className="size-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent
                      align="start"
                      className="w-(--radix-popover-trigger-width) p-0"
                    >
                      <Command>
                        <CommandInput placeholder="Search email..." />
                        <CommandList>
                          <CommandEmpty>No user found</CommandEmpty>
                          <CommandGroup>
                            {tenantPeople.map((u) => (
                              <CommandItem
                                key={u.id}
                                value={u.email}
                                onSelect={() => handleUserSelect(u)}
                              >
                                <Check
                                  className={cn(
                                    "size-4 text-brand-600 dark:text-brand-300",
                                    selectedUser?.id === u.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <span className="truncate">{u.email}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FieldDescription>
                    {isSuperAdmin && selectedTenant
                      ? `Showing people in ${selectedTenant.name} (${tenantPeople.length})`
                      : `Showing people in your organisation (${tenantPeople.length})`}
                  </FieldDescription>
                  <FieldError>{!selectedUser ? assignError : null}</FieldError>
                </Field>
              </FieldSet>
            </CardContent>
          </Card>

          {/* DATES */}
          <Card>
            <CardContent>
              <FieldSet>
                <SectionLegend
                  icon={CalendarClock}
                  tone="bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20"
                  title="Purchase & warranty"
                  description="Used for warranty tracking and expiry alerts."
                />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="asset-purchase_date">
                      Purchase Date
                    </FieldLabel>
                    <Input
                      id="asset-purchase_date"
                      type="date"
                      value={form.purchase_date}
                      onChange={(e) =>
                        setForm({ ...form, purchase_date: e.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="asset-warranty_expiry">
                      Warranty Expiry
                    </FieldLabel>
                    <Input
                      id="asset-warranty_expiry"
                      type="date"
                      value={form.warranty_expiry}
                      onChange={(e) =>
                        setForm({ ...form, warranty_expiry: e.target.value })
                      }
                    />
                  </Field>
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FOOTER */}
      <Card className="sticky bottom-4 z-20 flex-col gap-3 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:bg-gray-900/90">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {mode === "create"
            ? "The asset is created and assigned when you save."
            : "Changes are applied when you save."}
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/assets")}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {loading
              ? "Saving..."
              : mode === "create"
                ? "Create Asset"
                : "Update Asset"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
