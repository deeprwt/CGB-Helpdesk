"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import { apiFetch } from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldDescription,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, type PageHeaderMetaItem } from "@/components/common/page-header"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import { getInitials, roleLabel, useCompanyList, useCurrentUser } from "@/hooks/useCurrentUser"
import { IdCard, Loader2, Pencil, UserCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/* ---------------- TYPES ---------------- */

type Role = "user" | "engineer" | "admin" | "superadmin"

type UserProfile = {
  id: string
  email: string
  role?: Role
  full_name: string
  employee_id: string | null
  designation: string | null
  department: string | null
  position: string | null
  manager: string | null
  phone: string | null
  present_address: string | null
  permanent_address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  avatar_url: string | null
  tenant_id: string | null
  organization_id: string | null
}

const NO_COMPANY = "__none__"

/** Fields saved from the edit form (people may write these on their own row) */
const EDITABLE_FIELDS = [
  "full_name", "employee_id", "designation", "department", "position", "manager", "phone",
  "present_address", "permanent_address", "city", "postal_code", "country",
] as const

type UserInfoCardProps = {
  profileId?: string
  currentRole?: Role | null
}

/* ---------------- UI HELPERS ---------------- */

const ROLE_TONE: Record<Role, BadgeTone> = {
  superadmin: "violet",
  admin: "blue",
  engineer: "emerald",
  user: "gray",
}

/** Edit form layout: [field name, label, spans both columns?] */
const WORK_FIELDS: [string, string][] = [
  ["full_name", "Full Name"],
  ["phone", "Phone Number"],
  ["employee_id", "Employee ID"],
  ["department", "Department"],
  ["designation", "Designation"],
  ["position", "Position"],
  ["manager", "Manager"],
]

const ADDRESS_FIELDS: [string, string, boolean?][] = [
  ["present_address", "Present Address", true],
  ["permanent_address", "Permanent Address", true],
  ["city", "City"],
  ["postal_code", "Postal Code"],
  ["country", "Country"],
]

function InfoItem({
  label,
  value,
  className,
}: {
  label: string
  value?: string | null
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-gray-900 dark:text-white">
        {value || "—"}
      </dd>
    </div>
  )
}

/* ---------------- COMPONENT ---------------- */

export default function UserInfoCard({
  profileId,
  currentRole,
}: UserInfoCardProps) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const [profile, setProfile] =
    React.useState<UserProfile | null>(null)

  const { user: me } = useCurrentUser()
  const currentUserId = me?.id ?? ""
  // Prefer the live role; the prop is what the page already loaded
  const viewerRole: Role | null = me?.role ?? currentRole ?? null

  // Names shown for the person's company and tenant
  const [companyName, setCompanyName] = React.useState<string | null>(null)
  const [tenantName, setTenantName] = React.useState<string | null>(null)
  // Company picked in the edit form
  const [companyChoice, setCompanyChoice] = React.useState(NO_COMPANY)

  /* ---------------- LOAD PROFILE ---------------- */

  React.useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const targetId = profileId ?? user.id

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", targetId)
        .maybeSingle()

      if (error || !data) {
        console.error("Profile load failed:", error)
        toast.error("Unable to load profile")
        return
      }

      setProfile(data)

      const [{ data: org }, { data: tenant }] = await Promise.all([
        data.organization_id
          ? supabase.from("organizations").select("name").eq("id", data.organization_id).maybeSingle()
          : Promise.resolve({ data: null }),
        data.tenant_id
          ? supabase.from("tenants").select("name").eq("id", data.tenant_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setCompanyName((org as { name: string } | null)?.name ?? null)
      setTenantName((tenant as { name: string } | null)?.name ?? null)
    }

    loadProfile()
  }, [profileId])

  /* ---------------- PERMISSIONS ---------------- */

  const isOwn = !!profile && profile.id === currentUserId

  // Same rules as PATCH /api/users/:id: admins edit members of their tenant
  // (not super admins); super admins edit anyone. Everyone edits themselves.
  const canAdminister =
    !!profile &&
    (viewerRole === "superadmin" ||
      (viewerRole === "admin" && profile.role !== "superadmin"))

  const canEdit = !!profile && (isOwn || canAdminister)

  // Only admins move people between companies
  const companies = useCompanyList(
    canAdminister && open ? (viewerRole === "superadmin" ? profile?.tenant_id ?? null : undefined) : null
  )

  /* ---------------- HANDLERS ---------------- */

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!profile) return
    setProfile({
      ...profile,
      [e.target.name]: e.target.value,
    })
  }

  const openEditor = () => {
    setCompanyChoice(profile?.organization_id ?? NO_COMPANY)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!profile || !canEdit) {
      toast.error("Unauthorized action")
      return
    }
    if (!profile.full_name?.trim()) {
      toast.error("Name cannot be empty")
      return
    }

    const fields: Record<string, string | null> = {}
    for (const f of EDITABLE_FIELDS) {
      const v = (profile as Record<string, unknown>)[f]
      fields[f] = typeof v === "string" ? v.trim() || null : null
    }
    const nextCompany = companyChoice === NO_COMPANY ? null : companyChoice
    const companyChanged = canAdminister && nextCompany !== (profile.organization_id ?? null)

    setLoading(true)
    try {
      if (isOwn && !companyChanged) {
        // Your own row: the database lets you update these columns directly
        const { error } = await supabase.from("users").update(fields).eq("id", profile.id)
        if (error) throw new Error(error.message)
      } else {
        // Someone else (or a company change): the server checks the admin's rights
        await apiFetch(`/api/users/${profile.id}`, {
          method: "PATCH",
          body: { ...fields, ...(companyChanged ? { organization_id: nextCompany } : {}) },
        })
      }

      if (companyChanged) {
        setProfile({ ...profile, organization_id: nextCompany })
        setCompanyName(companies.find((c) => c.id === nextCompany)?.name ?? null)
      }
      toast.success("Profile updated successfully")
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the profile")
    } finally {
      setLoading(false)
    }
  }

  /* ---------------- LOADING ---------------- */

  if (!profile) {
    return (
      <>
        <div className="order-first rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 via-white to-blue-light-50/70 p-5 sm:p-6 lg:col-span-2 dark:border-brand-500/20 dark:from-brand-500/10 dark:via-gray-900 dark:to-blue-light-500/10">
          <Skeleton className="h-5 w-24 rounded-full" />
          <div className="mt-3 flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full max-w-[180px]" />
              </div>
            ))}
          </CardContent>
        </Card>
      </>
    )
  }

  /* ---------------- UI ---------------- */

  const isOwnProfile = isOwn
  const location = [profile.city, profile.country].filter(Boolean).join(", ")
  const subtitle = [profile.designation, profile.department].filter(Boolean).join(" · ")

  const meta: PageHeaderMetaItem[] = [{ label: profile.email, dot: "bg-emerald-400" }]
  if (location) meta.push({ label: location, dot: "bg-brand-400" })
  if (profile.phone) meta.push({ label: profile.phone, dot: "bg-brand-400" })

  const fieldValue = (name: string) =>
    (profile as Record<string, string | null>)[name] ?? ""

  return (
    <>
      {/* HERO */}
      <PageHeader
        variant="hero"
        className="order-first lg:col-span-2 sm:[&_h1~*]:pl-20"
        eyebrow={isOwnProfile ? "My profile" : "User profile"}
        eyebrowIcon={UserCircle2}
        title={
          <span className="flex items-center gap-4">
            <Avatar className="size-16 shadow-md ring-4 ring-white dark:ring-gray-900">
              <AvatarImage src={profile.avatar_url ?? ""} className="object-cover" />
              <AvatarFallback className="bg-brand-500 text-lg font-semibold text-white">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="break-words">{profile.full_name || profile.email}</span>
              {profile.role && (
                <StatusBadge tone={ROLE_TONE[profile.role] ?? "gray"} dot className="text-xs">
                  {roleLabel(profile.role)}
                </StatusBadge>
              )}
            </span>
          </span>
        }
        description={subtitle || undefined}
        meta={meta}
      />

      {/* PERSONAL INFORMATION */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-base text-gray-900 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
              <IdCard className="h-4 w-4" />
            </span>
            Personal Information
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Contact and work details
          </CardDescription>
          {canEdit && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={openEditor}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </CardAction>
          )}
        </CardHeader>

        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <InfoItem label="Full Name" value={profile.full_name} />
            <InfoItem label="Email" value={profile.email} />
            <InfoItem label="Phone" value={profile.phone} />
            <InfoItem label="Employee ID" value={profile.employee_id} />
            <InfoItem label="Department" value={profile.department} />
            <InfoItem label="Designation" value={profile.designation} />
            <InfoItem label="Position" value={profile.position} />
            <InfoItem label="Manager" value={profile.manager} />
            <InfoItem label="Company" value={companyName} />
            <InfoItem label="Organisation" value={tenantName} />
          </dl>
        </CardContent>
      </Card>

      {/* EDIT MODAL */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update personal, work and address details.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6">
            <FieldSet>
              <FieldLegend>Personal &amp; work</FieldLegend>
              <FieldGroup className="sm:grid-cols-2">
                {WORK_FIELDS.map(([name, label]) => (
                  <Field key={name}>
                    <FieldLabel htmlFor={`profile-${name}`}>{label}</FieldLabel>
                    <Input
                      id={`profile-${name}`}
                      name={name}
                      value={fieldValue(name)}
                      onChange={handleChange}
                    />
                  </Field>
                ))}
                {canAdminister && (
                  <Field>
                    <FieldLabel htmlFor="profile-company">Company</FieldLabel>
                    <Select value={companyChoice} onValueChange={setCompanyChoice}>
                      <SelectTrigger id="profile-company" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_COMPANY}>No company</SelectItem>
                        {companies
                          .filter((c) => c.status === "active" || c.id === profile.organization_id)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                              {c.status !== "active" ? " (inactive)" : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>For grouping only; it doesn&apos;t change what they can see.</FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>Address</FieldLegend>
              <FieldGroup className="sm:grid-cols-2">
                {ADDRESS_FIELDS.map(([name, label, wide]) => (
                  <Field key={name} className={cn(wide && "sm:col-span-2")}>
                    <FieldLabel htmlFor={`profile-${name}`}>{label}</FieldLabel>
                    <Input
                      id={`profile-${name}`}
                      name={name}
                      value={fieldValue(name)}
                      onChange={handleChange}
                    />
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
