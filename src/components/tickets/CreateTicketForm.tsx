"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  Gauge,
  Loader2,
  Package,
  Paperclip,
  RefreshCw,
  SearchCode,
  Send,
  UploadCloud,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabaseClient"
import { cn } from "@/lib/utils"
import { getInitials } from "@/hooks/useCurrentUser"
import { apiFetch } from "@/lib/api-client"
import { isStaffRole } from "@/lib/ticket-access"
import {
  CHANGE_TYPES,
  IMPACT_LABELS,
  LEVELS,
  PRIORITIES,
  PRIORITY_LABELS,
  REQUESTER_TICKET_TYPES,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  URGENCY_LABELS,
  formatMinutes,
  isPriority,
  pickPolicy,
  priorityFromMatrix,
  type Level,
  type MatrixCell,
  type SlaPolicy,
  type TicketType,
} from "@/lib/itsm"
import { PRIORITY_TONE } from "@/components/tickets/TicketBadges"
import { StatusBadge } from "@/components/common/status-badge"

/* -----------------------------------
   Layout helpers (presentational only)
----------------------------------- */
const CHIP_TONES = {
  indigo:
    "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20",
  violet:
    "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20",
  emerald:
    "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
  amber:
    "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
} as const

function SectionLegend({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: LucideIcon
  tone: keyof typeof CHIP_TONES
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
          CHIP_TONES[tone]
        )}
      >
        <Icon className="size-4" />
      </span>
      <FieldLegend description={description}>{title}</FieldLegend>
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const RADIO_PILL =
  "mb-0 cursor-pointer rounded-full border border-gray-200 px-3 py-1.5 text-sm font-normal has-[[data-state=checked]]:border-brand-300 has-[[data-state=checked]]:bg-brand-50/60 dark:border-white/10 dark:text-gray-300 dark:has-[[data-state=checked]]:border-brand-500/40 dark:has-[[data-state=checked]]:bg-brand-500/10"

/* -----------------------------------
   Types
----------------------------------- */
type Role = "user" | "engineer" | "admin" | "superadmin"

type UserLite = {
  id: string
  full_name: string
  email: string
  phone: number | null
  role: Role
  tenant_id: string | null
}

type AssetOption = {
  id: string
  asset_code: string
  asset_type: string
  model: string | null
}

const USER_COLUMNS = "id, full_name, email, phone, role, tenant_id"

type ConfigCategory = {
  id: string
  parent_id: string | null
  name: string
  ticket_types: TicketType[] | null
  sort_order: number
  is_active: boolean
}

type ItsmConfig = {
  tenant_id: string
  categories: ConfigCategory[]
  matrix: MatrixCell[]
  policies: SlaPolicy[]
}

const TYPE_OPTIONS: Record<TicketType, { icon: LucideIcon; description: string }> = {
  incident: { icon: AlertTriangle, description: "Something is broken" },
  service_request: { icon: Package, description: "I need something" },
  problem: { icon: SearchCode, description: "Find the cause of repeat incidents" },
  change: { icon: RefreshCw, description: "Plan a change to a service" },
}

const CHANGE_TYPE_LABELS: Record<(typeof CHANGE_TYPES)[number], string> = {
  standard: "Standard (pre-approved)",
  normal: "Normal",
  emergency: "Emergency",
}

const RISK_LABELS: Record<Level, string> = { low: "Low", medium: "Medium", high: "High" }

/** Active top-level categories offered for a record type (null ticket_types = every type). */
function categoriesFor(config: ItsmConfig | null, type: TicketType) {
  if (!config) return []
  return config.categories.filter(
    (c) => !c.parent_id && c.is_active && (!c.ticket_types || c.ticket_types.includes(type))
  )
}

export default function CreateTicketForm() {
  const router = useRouter()
  const formRef = React.useRef<HTMLFormElement | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [category, setCategory] = React.useState("")
  const [subCategory, setSubCategory] = React.useState("")
  const [role, setRole] = React.useState<Role>("user")
  const staff = isStaffRole(role)

  /* ITSM: record type, the tenant's categories / priority matrix / SLA policies */
  const [ticketType, setTicketType] = React.useState<TicketType>("incident")
  const [config, setConfig] = React.useState<ItsmConfig | null>(null)
  const [configError, setConfigError] = React.useState<string | null>(null)
  const [configReload, setConfigReload] = React.useState(0)
  const [impact, setImpact] = React.useState<Level>("low")
  const [urgency, setUrgency] = React.useState<Level>("low")
  const [priorityOverride, setPriorityOverride] = React.useState("auto")
  const [knownError, setKnownError] = React.useState(false)

  const [users, setUsers] = React.useState<UserLite[]>([])
  const [selectedUser, setSelectedUser] = React.useState<UserLite | null>(null)
  // Super admins pick people from every tenant: show which tenant each is in
  const [tenantNames, setTenantNames] = React.useState<Record<string, string>>({})

  const [requesterName, setRequesterName] = React.useState("")
  const [contact, setContact] = React.useState("")

  const [assetRelated, setAssetRelated] =
    React.useState<"yes" | "no">("no")
  const [assets, setAssets] = React.useState<AssetOption[]>([])
  const [assetsLoaded, setAssetsLoaded] = React.useState(false)

  /* UI-only state for the attachment drop area */
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [pickedFiles, setPickedFiles] = React.useState<File[]>([])
  const [dragActive, setDragActive] = React.useState(false)

  /* -----------------------------------
     Load current user
  ----------------------------------- */
  React.useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) return

      const { data: me } = await supabase
        .from("users")
        .select(USER_COLUMNS)
        .eq("id", auth.user.id)
        .single<UserLite>()

      if (!me) return

      setRole(me.role)
      setSelectedUser(me)
      setRequesterName(me.full_name)
      setContact(me.phone?.toString() ?? "")

      if (me.role !== "user") {
        // The database (RLS) returns this person's tenant; a super admin gets everyone
        const { data } = await supabase
          .from("users")
          .select(USER_COLUMNS)
          .order("full_name")
          .returns<UserLite[]>()

        setUsers(data ?? [])

        if (me.role === "superadmin") {
          const { data: tenants } = await supabase.from("tenants").select("id, name")
          setTenantNames(
            Object.fromEntries((tenants ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))
          )
        }
      }
    }

    load()
  }, [])

  /* -----------------------------------
     Load the ITSM config of the ticket's tenant
     (a ticket belongs to its requester's tenant; only a
     super admin can raise one in another tenant).
  ----------------------------------- */
  const configTenant = selectedUser?.tenant_id ?? null
  const hasRequester = !!selectedUser
  React.useEffect(() => {
    if (!hasRequester) return
    let active = true
    setConfig(null)
    setConfigError(null)
    const qs = configTenant ? `?tenant_id=${encodeURIComponent(configTenant)}` : ""
    apiFetch<ItsmConfig>(`/api/itsm/config${qs}`)
      .then((cfg) => {
        if (active) setConfig(cfg)
      })
      .catch((err: unknown) => {
        if (active) setConfigError(err instanceof Error ? err.message : "Could not load categories")
      })
    return () => {
      active = false
    }
  }, [configTenant, hasRequester, configReload])

  const typeCategories = React.useMemo(() => categoriesFor(config, ticketType), [config, ticketType])
  const parentCategory = typeCategories.find((c) => c.name === category) ?? null
  const subCategories = React.useMemo(
    () =>
      parentCategory && config
        ? config.categories.filter((c) => c.parent_id === parentCategory.id && c.is_active)
        : [],
    [config, parentCategory]
  )

  // Drop a category (or sub category) that isn't offered for the chosen type / tenant
  React.useEffect(() => {
    if (!config) return
    if (category && !typeCategories.some((c) => c.name === category)) {
      setCategory("")
      setSubCategory("")
    } else if (subCategory && !subCategories.some((c) => c.name === subCategory)) {
      setSubCategory("")
    }
  }, [config, category, subCategory, typeCategories, subCategories])

  const allowedTypes: readonly TicketType[] = staff ? TICKET_TYPES : REQUESTER_TICKET_TYPES
  // A requester can never keep a staff-only type selected
  React.useEffect(() => {
    if (!allowedTypes.includes(ticketType)) setTicketType("incident")
  }, [allowedTypes, ticketType])

  const matrixPriority = priorityFromMatrix(config?.matrix ?? [], impact, urgency)
  const effectivePriority =
    staff && isPriority(priorityOverride) ? priorityOverride : matrixPriority
  const policy = config ? pickPolicy(config.policies, ticketType, effectivePriority) : null

  /* -----------------------------------
     Load assets that can be linked.
     The database (RLS) decides what is visible: the IT team sees its
     tenant's assets, a user only the assets assigned to them. Staff raising
     a ticket for someone only get assets of that person's tenant (a ticket
     belongs to its requester's tenant).
  ----------------------------------- */
  React.useEffect(() => {
    if (assetRelated !== "yes" || !selectedUser) {
      setAssets([])
      setAssetsLoaded(false)
      return
    }

    let active = true
    const loadAssets = async () => {
      setAssetsLoaded(false)

      let q = supabase
        .from("assets")
        .select("id, asset_code, asset_type, model")
        .order("asset_code")
      if (role !== "user" && selectedUser.tenant_id) q = q.eq("tenant_id", selectedUser.tenant_id)

      const { data } = await q.returns<AssetOption[]>()
      if (!active) return
      setAssets(data ?? [])
      setAssetsLoaded(true)
    }

    loadAssets()
    return () => {
      active = false
    }
  }, [assetRelated, selectedUser, role])

  /* -----------------------------------
     Submit
  ----------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current || !selectedUser) return
    if (!config) {
      toast.error("Categories haven't loaded yet. Try again in a moment.")
      return
    }

    setLoading(true)

    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error("Unauthorized")

      const formData = new FormData(formRef.current)
      formData.set("requester_id", selectedUser.id)
      formData.set("ticket_type", ticketType)
      formData.set("impact", impact)
      formData.set("urgency", urgency)
      // Priority comes from impact × urgency on the server; only staff may override it
      formData.delete("priority")
      if (staff && isPriority(priorityOverride)) formData.set("priority", priorityOverride)
      if (staff && ticketType === "problem") formData.set("known_error", knownError ? "true" : "false")
      // datetime-local has no zone: send the instant as the person meant it in their own time zone
      for (const key of ["planned_start", "planned_end"]) {
        const v = formData.get(key)?.toString()
        if (!v) continue
        const d = new Date(v)
        if (!Number.isNaN(d.getTime())) formData.set(key, d.toISOString())
      }

      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: formData,
      })

      const result = await res.json().catch(() => null)
      if (!res.ok || !result?.ticketId) throw new Error(result?.error ?? "Failed")

      toast.success(
        result.number ? `${result.number} created` : `${TICKET_TYPE_LABELS[ticketType]} created`
      )
      // Button stays disabled while navigating, so it can't be submitted twice
      router.push(`/ticket/${result.ticketId}`)
    } catch (err) {
      const msg = err instanceof Error && err.message !== "Failed" ? err.message : null
      toast.error(msg ? `Failed to create ticket: ${msg}` : "Failed to create ticket")
      setLoading(false)
    }
  }

  /* -----------------------------------
     Attachment drop area (UI only — files
     still submit via the form's FormData)
  ----------------------------------- */
  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPickedFiles(Array.from(e.target.files ?? []))
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    const input = fileInputRef.current
    if (!input || e.dataTransfer.files.length === 0) return
    input.files = e.dataTransfer.files
    setPickedFiles(Array.from(e.dataTransfer.files))
  }

  const clearFiles = () => {
    if (fileInputRef.current) fileInputRef.current.value = ""
    setPickedFiles([])
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onReset={() => setPickedFiles([])}
      className="flex flex-col gap-6"
    >
      {/* Record type */}
      <Card>
        <CardContent>
          <FieldSet>
            <SectionLegend
              icon={FileText}
              tone="indigo"
              title="What do you need?"
              description="Pick the kind of record so it gets the right handling and targets."
            />
            <div
              role="radiogroup"
              aria-label="Record type"
              className={cn(
                "grid gap-3 sm:grid-cols-2",
                allowedTypes.length > 2 && "lg:grid-cols-4"
              )}
            >
              {allowedTypes.map((t) => {
                const opt = TYPE_OPTIONS[t]
                const Icon = opt.icon
                const selected = ticketType === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTicketType(t)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      selected
                        ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-200 dark:border-brand-500/40 dark:bg-brand-500/10 dark:ring-brand-500/20"
                        : "border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.03]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        selected ? "text-brand-600 dark:text-brand-300" : "text-gray-400"
                      )}
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {TICKET_TYPE_LABELS[t]}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </FieldSet>
        </CardContent>
      </Card>

      {/* Requester */}
      <Card>
        <CardContent>
          <FieldSet>
            <SectionLegend
              icon={UserRound}
              tone="indigo"
              title="Requester"
              description="Who is this ticket for and how can we reach them?"
            />
            <FieldGroup className="md:grid-cols-2">
              {/* Engineer/Admin user search */}
              {role !== "user" && (
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="raise_for">Raise Ticket For</FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="raise_for"
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {selectedUser && (
                            <Avatar className="size-6">
                              <AvatarFallback className="bg-brand-500 text-[10px] font-semibold text-white">
                                {getInitials(selectedUser.full_name)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span className="truncate">
                            {selectedUser?.full_name ?? "Select user"}
                            {selectedUser?.email && (
                              <span className="ml-1.5 text-muted-foreground">
                                · {selectedUser.email}
                              </span>
                            )}
                            {selectedUser?.tenant_id && tenantNames[selectedUser.tenant_id] && (
                              <span className="ml-1.5 text-muted-foreground">
                                · {tenantNames[selectedUser.tenant_id]}
                              </span>
                            )}
                          </span>
                        </span>
                        <ChevronsUpDown className="opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-(--radix-popover-trigger-width) p-0"
                    >
                      <Command>
                        <CommandInput placeholder="Search user..." />
                        <CommandList>
                          <CommandEmpty>No user found</CommandEmpty>
                          <CommandGroup>
                            {users.map((u) => (
                              <CommandItem
                                key={u.id}
                                // Unique per user — the default (display text) mixes up
                                // people with the same name; keywords keep search working
                                value={u.id}
                                keywords={[
                                  u.full_name ?? "",
                                  u.email ?? "",
                                  (u.tenant_id && tenantNames[u.tenant_id]) || "",
                                ]}
                                onSelect={() => {
                                  setSelectedUser(u)
                                  setRequesterName(u.full_name)
                                  setContact(u.phone?.toString() ?? "")
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedUser?.id === u.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate">{u.full_name}</span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {u.email}
                                  </span>
                                </span>
                                {u.tenant_id && tenantNames[u.tenant_id] && (
                                  <span className="ml-2 shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                    {tenantNames[u.tenant_id]}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </Field>
              )}

              {/* Editable Name & Contact */}
              <Field>
                <FieldLabel htmlFor="requester_name">Name</FieldLabel>
                <Input
                  id="requester_name"
                  name="requester_name"
                  placeholder="Full name"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact">Contact</FieldLabel>
                <Input
                  id="contact"
                  name="contact"
                  placeholder="Phone number"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      {/* Issue details */}
      <Card>
        <CardContent>
          <FieldSet>
            <SectionLegend
              icon={ClipboardList}
              tone="violet"
              title="Issue details"
              description="Tell us what's going on so we can route it to the right engineer."
            />
            <FieldGroup className="md:grid-cols-2">
              {/* Subject */}
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="subject" required>
                  Subject
                </FieldLabel>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="Short summary of the issue"
                  required
                />
              </Field>

              {/* Description */}
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Steps to reproduce, error messages, when it started…"
                  className="min-h-32"
                />
              </Field>

              {/* Category (the tenant's list for this record type) */}
              {configError ? (
                <Field className="md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    <span>Couldn&apos;t load categories and priorities: {configError}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigReload((n) => n + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                </Field>
              ) : !config ? (
                <>
                  <Field>
                    <FieldLabel>Category</FieldLabel>
                    <Skeleton className="h-11 w-full" />
                  </Field>
                  <Field>
                    <FieldLabel>Sub Category</FieldLabel>
                    <Skeleton className="h-11 w-full" />
                  </Field>
                </>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="category">Category</FieldLabel>
                    <Select
                      name="category"
                      value={category}
                      onValueChange={(v) => {
                        setCategory(v)
                        setSubCategory("")
                      }}
                      disabled={typeCategories.length === 0}
                    >
                      <SelectTrigger id="category">
                        <SelectValue
                          placeholder={
                            typeCategories.length ? "Select category" : "No categories for this type"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {typeCategories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="sub_category">Sub Category</FieldLabel>
                    <Select
                      name="sub_category"
                      value={subCategory}
                      onValueChange={setSubCategory}
                      disabled={!category || subCategories.length === 0}
                    >
                      <SelectTrigger id="sub_category">
                        <SelectValue
                          placeholder={
                            !category
                              ? "Choose a category first"
                              : subCategories.length
                                ? "Select sub category"
                                : "No sub categories"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {subCategories.map((s) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              {/* Impact × urgency → priority */}
              <Field>
                <FieldLabel htmlFor="impact">Impact</FieldLabel>
                <Select value={impact} onValueChange={(v) => setImpact(v as Level)}>
                  <SelectTrigger id="impact">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...LEVELS].reverse().map((l) => (
                      <SelectItem key={l} value={l}>{IMPACT_LABELS[l]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="urgency">Urgency</FieldLabel>
                <Select value={urgency} onValueChange={(v) => setUrgency(v as Level)}>
                  <SelectTrigger id="urgency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...LEVELS].reverse().map((l) => (
                      <SelectItem key={l} value={l}>{URGENCY_LABELS[l]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field className="md:col-span-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.02]">
                  <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Gauge className="size-4 text-gray-400" />
                    Priority:
                    <StatusBadge tone={PRIORITY_TONE[effectivePriority]}>
                      {PRIORITY_LABELS[effectivePriority]}
                    </StatusBadge>
                    {staff && isPriority(priorityOverride) && priorityOverride !== matrixPriority && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">(overridden)</span>
                    )}
                  </span>
                  {config && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {policy
                        ? `First response within ${formatMinutes(policy.response_minutes)} · resolution within ${formatMinutes(policy.resolution_minutes)}${policy.business_hours ? " (business hours)" : ""}`
                        : "No SLA target set for this priority"}
                    </span>
                  )}
                </div>
              </Field>

              {staff && (
                <Field>
                  <FieldLabel htmlFor="priority_override">Override priority</FieldLabel>
                  <Select value={priorityOverride} onValueChange={setPriorityOverride}>
                    <SelectTrigger id="priority_override">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Use impact × urgency ({PRIORITY_LABELS[matrixPriority]})
                      </SelectItem>
                      {[...PRIORITIES].reverse().map((p) => (
                        <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {/* Location */}
              <Field>
                <FieldLabel htmlFor="location">Location</FieldLabel>
                <Input id="location" name="location" placeholder="Office, floor or desk" />
              </Field>

              {/* Reference Link */}
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="link">Reference Link</FieldLabel>
                <Input id="link" name="link" placeholder="https://" />
                <FieldDescription>
                  Optional link to a screenshot, document or related page.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      {/* Problem details (IT team only) */}
      {staff && ticketType === "problem" && (
        <Card>
          <CardContent>
            <FieldSet>
              <SectionLegend
                icon={Wrench}
                tone="amber"
                title="Problem details"
                description="What's known so far about the underlying cause."
              />
              <FieldGroup className="md:grid-cols-2">
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="root_cause">Root cause</FieldLabel>
                  <Textarea
                    id="root_cause"
                    name="root_cause"
                    placeholder="Known or suspected cause"
                    className="min-h-24"
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="workaround">Workaround</FieldLabel>
                  <Textarea
                    id="workaround"
                    name="workaround"
                    placeholder="How people can keep working until it's fixed"
                    className="min-h-24"
                  />
                </Field>
                <Field orientation="horizontal" className="md:col-span-2">
                  <Checkbox
                    id="known_error"
                    checked={knownError}
                    onCheckedChange={(v) => setKnownError(v === true)}
                  />
                  <FieldLabel htmlFor="known_error" className="font-normal">
                    Known error (root cause and workaround are documented)
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </FieldSet>
          </CardContent>
        </Card>
      )}

      {/* Change details (IT team only) */}
      {staff && ticketType === "change" && (
        <Card>
          <CardContent>
            <FieldSet>
              <SectionLegend
                icon={CalendarClock}
                tone="amber"
                title="Change details"
                description="Type, risk, schedule and how to roll it out or back."
              />
              <FieldGroup className="md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="change_type">Change type</FieldLabel>
                  <Select name="change_type" defaultValue="normal">
                    <SelectTrigger id="change_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANGE_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>{CHANGE_TYPE_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="risk">Risk</FieldLabel>
                  <Select name="risk">
                    <SelectTrigger id="risk">
                      <SelectValue placeholder="Select risk" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{RISK_LABELS[l]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="planned_start">Planned start</FieldLabel>
                  <Input id="planned_start" name="planned_start" type="datetime-local" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="planned_end">Planned end</FieldLabel>
                  <Input id="planned_end" name="planned_end" type="datetime-local" />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="implementation_plan">Implementation plan</FieldLabel>
                  <Textarea
                    id="implementation_plan"
                    name="implementation_plan"
                    placeholder="Steps to carry out the change"
                    className="min-h-24"
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="backout_plan">Backout plan</FieldLabel>
                  <Textarea
                    id="backout_plan"
                    name="backout_plan"
                    placeholder="How to undo the change if it goes wrong"
                    className="min-h-24"
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
          </CardContent>
        </Card>
      )}

      {/* Asset & attachments */}
      <Card>
        <CardContent>
          <FieldSet>
            <SectionLegend
              icon={Paperclip}
              tone="emerald"
              title="Asset & attachments"
              description="Link an assigned device and add any supporting files."
            />
            <FieldGroup className="md:grid-cols-2">
              {/* Asset Radio + Select */}
              <Field>
                <FieldLabel>Asset related?</FieldLabel>
                <RadioGroup
                  value={assetRelated}
                  onValueChange={(v) => setAssetRelated(v as "yes" | "no")}
                  className="flex flex-wrap gap-2"
                >
                  <Label htmlFor="asset_related_no" className={RADIO_PILL}>
                    <RadioGroupItem id="asset_related_no" value="no" />
                    No
                  </Label>
                  <Label htmlFor="asset_related_yes" className={RADIO_PILL}>
                    <RadioGroupItem id="asset_related_yes" value="yes" />
                    Yes
                  </Label>
                </RadioGroup>
              </Field>

              {assetRelated === "yes" && (
                <Field>
                  <FieldLabel htmlFor="asset_id">Asset</FieldLabel>
                  {assets.length > 0 ? (
                    <Select name="asset_id">
                      <SelectTrigger id="asset_id">
                        <SelectValue placeholder="Select asset" />
                      </SelectTrigger>
                      <SelectContent>
                        {assets.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.asset_code} — {a.asset_type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : !assetsLoaded ? (
                    <Skeleton className="h-11 w-full" />
                  ) : (
                    <FieldDescription className="flex h-11 items-center">
                      {role === "user"
                        ? "No assets are currently assigned to you."
                        : "No assets found in this person's tenant."}
                    </FieldDescription>
                  )}
                </Field>
              )}

              {/* Attachments */}
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="attachments">Attachments</FieldLabel>
                <input
                  ref={fileInputRef}
                  id="attachments"
                  type="file"
                  name="attachments"
                  multiple
                  className="hidden"
                  onChange={handleFilesPicked}
                />
                <Card
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "items-center gap-3 border-2 border-dashed px-6 py-8 text-center shadow-none transition-colors",
                    dragActive
                      ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/60 dark:bg-brand-500/10"
                      : "border-gray-200 bg-gray-50/60 dark:border-white/10 dark:bg-white/[0.02]"
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-brand-300 dark:ring-white/10">
                    <UploadCloud className="size-5" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Drag &amp; drop files here
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      or browse to choose one or more files
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip />
                    Browse files
                  </Button>
                </Card>

                {pickedFiles.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {pickedFiles.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]"
                      >
                        <FileText className="size-4 shrink-0 text-gray-400" />
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                          {f.name}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(f.size)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearFiles}
                        className="text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <X />
                        Clear files
                      </Button>
                    </div>
                  </div>
                )}
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      {/* Submit row */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" asChild>
          <Link href="/ticket">Cancel</Link>
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Send />}
          {loading ? "Creating..." : "Create Ticket"}
        </Button>
      </div>
    </form>
  )
}
