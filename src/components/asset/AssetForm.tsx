"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import {
  getUserAccessibleDomains,
  getUserAccessibleOrganizations,
  buildEmailDomainFilter,
  extractOrgDomain,
  type Organization,
} from "@/lib/org"
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
}

export default function AssetForm({
  mode,
  assetId,
  initialData,
  initialAssignedUser = null,
}: Props) {
  const router = useRouter()

  // The form is one page of sections (was tabs); a missing assignee
  // scrolls to the Assignment section and shows an inline error instead.
  const assignRef = React.useRef<HTMLDivElement>(null)
  const [assignError, setAssignError] = React.useState<string | null>(null)

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

  /* ---------------- USERS + ORGANIZATIONS ---------------- */
  const [users, setUsers] = React.useState<User[]>([])
  const [orgs, setOrgs] = React.useState<Organization[]>([])
  const [openAssign, setOpenAssign] = React.useState(false)
  const [selectedUser, setSelectedUser] =
    React.useState<User | null>(initialAssignedUser)

  React.useEffect(() => {
    const loadUsers = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) return
      const { data: profile } = await supabase.from("users").select("role").eq("id", currentUser.id).single()
      const role = profile?.role ?? "user"
      const [domains, accessibleOrgs] = await Promise.all([
        getUserAccessibleDomains(supabase, currentUser.id, currentUser.email ?? "", role),
        getUserAccessibleOrganizations(supabase, currentUser.id, currentUser.email ?? "", role),
      ])

      const { data } = await supabase
        .from("users")
        .select("id, email")
        .or(buildEmailDomainFilter(domains))
        .order("email")

      setUsers(data ?? [])
      setOrgs(accessibleOrgs)
    }

    loadUsers()
  }, [])

  const selectedOrg = orgs.find((o) => o.id === form.organization_id) ?? null

  // Assignable users are limited to the selected organization's domain
  const orgUsers = selectedOrg
    ? users.filter((u) => extractOrgDomain(u.email) === selectedOrg.domain)
    : users

  const handleOrgChange = (orgId: string) => {
    setForm((f) => ({ ...f, organization_id: orgId }))
    const org = orgs.find((o) => o.id === orgId)
    if (selectedUser && org && extractOrgDomain(selectedUser.email) !== org.domain) {
      setSelectedUser(null)
    }
  }

  const handleUserSelect = (u: User) => {
    setSelectedUser(u)
    setOpenAssign(false)
  }

  /* ---------------- SAVE ASSIGNMENT ---------------- */
  const saveAssignment = async (
    finalAssetId: string,
    assignedBy: string | null
  ) => {
    if (!selectedUser) return

    await supabase
      .from("asset_assignments")
      .delete()
      .eq("asset_id", finalAssetId)

    await supabase.from("asset_assignments").insert({
      asset_id: finalAssetId,
      user_id: selectedUser.id,
      assigned_by: assignedBy,
    })
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
    let assetIdFinal = assetId

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (mode === "create") {
      const { data: asset, error } = await supabase
        .from("assets")
        .insert({
          ...(form.organization_id ? { organization_id: form.organization_id } : {}),
          asset_code: form.asset_code,
          asset_type: form.asset_type,
          model: form.model,
          status: form.status,
          location: form.location,
          department: form.department,
          purchase_date: form.purchase_date || null,
          warranty_expiry: form.warranty_expiry || null,
        })
        .select()
        .single()

      if (error || !asset) {
        toast.error(`Failed to create asset${error ? `: ${error.message}` : ""}`)
        setLoading(false)
        return
      }

      assetIdFinal = asset.id
    } else {
      const { error } = await supabase
        .from("assets")
        .update({
          ...(form.organization_id ? { organization_id: form.organization_id } : {}),
          asset_code: form.asset_code,
          asset_type: form.asset_type,
          model: form.model,
          status: form.status,
          location: form.location,
          department: form.department,
          purchase_date: form.purchase_date || null,
          warranty_expiry: form.warranty_expiry || null,
        })
        .eq("id", assetId)

      if (error) {
        toast.error(`Failed to update asset: ${error.message}`)
        setLoading(false)
        return
      }

      await supabase
        .from("asset_details")
        .delete()
        .eq("asset_id", assetId)
    }

    const detailRows = Object.entries({
      serial_no: form.serial_no,
      cpu: form.cpu,
      ram: form.ram,
      storage: form.storage,
      os_name: form.os_name,
      mac_address: form.mac_address,
      vendor: form.vendor,
    })
      .filter(([, v]) => v)
      .map(([key, value]) => ({
        asset_id: assetIdFinal!,
        key,
        value,
      }))

    if (detailRows.length > 0) {
      await supabase.from("asset_details").insert(detailRows)
    }

    await saveAssignment(assetIdFinal!, currentUser?.id ?? null)

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
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="asset-organization">
                      Organization
                      <span className="font-normal text-gray-400 dark:text-gray-500">
                        (optional)
                      </span>
                    </FieldLabel>
                    <Select
                      value={form.organization_id || undefined}
                      onValueChange={handleOrgChange}
                    >
                      <SelectTrigger id="asset-organization" className="w-full">
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgs.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name} ({o.domain})
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
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      />
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
                            {orgUsers.map((u) => (
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
                    {selectedOrg
                      ? `Showing users from ${selectedOrg.name} (${orgUsers.length})`
                      : "Select an organization in Asset basics to narrow this list"}
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
