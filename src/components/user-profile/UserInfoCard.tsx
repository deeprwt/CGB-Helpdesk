"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
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
} from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, type PageHeaderMetaItem } from "@/components/common/page-header"
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge"
import { getInitials, roleLabel } from "@/hooks/useCurrentUser"
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
}

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

  const [currentUserId, setCurrentUserId] =
    React.useState<string>("")

  /* ---------------- LOAD PROFILE ---------------- */

  React.useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      setCurrentUserId(user.id)

      // ✅ CRITICAL FIX: safe target id
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
    }

    loadProfile()
  }, [profileId])

  /* ---------------- PERMISSIONS ---------------- */

  const canEdit =
    profile &&
    (
      // own profile
      profile.id === currentUserId ||

      // superadmin → everyone except other superadmins
      (currentRole === "superadmin" &&
        profile.role !== "superadmin") ||

      // admin → user + engineer
      (currentRole === "admin" &&
        (profile.role === "user" ||
          profile.role === "engineer")) ||

      // engineer → user
      (currentRole === "engineer" &&
        profile.role === "user")
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

  const handleSave = async () => {
    if (!profile || !canEdit) {
      toast.error("Unauthorized action")
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from("users")
      .update({
        full_name: profile.full_name,
        employee_id: profile.employee_id,
        designation: profile.designation,
        department: profile.department,
        position: profile.position,
        manager: profile.manager,
        phone: profile.phone,
        present_address: profile.present_address,
        permanent_address: profile.permanent_address,
        city: profile.city,
        postal_code: profile.postal_code,
        country: profile.country,
      })
      .eq("id", profile.id)

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("Profile updated successfully")
    setOpen(false)
  }

  /* ---------------- LOADING ---------------- */

  if (!profile) {
    return (
      <>
        <div className="order-first rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/70 p-5 sm:p-6 lg:col-span-2 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
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

  const isOwnProfile = profile.id === currentUserId
  const location = [profile.city, profile.country].filter(Boolean).join(", ")
  const subtitle = [profile.designation, profile.department].filter(Boolean).join(" · ")

  const meta: PageHeaderMetaItem[] = [{ label: profile.email, dot: "bg-emerald-400" }]
  if (location) meta.push({ label: location, dot: "bg-indigo-400" })
  if (profile.phone) meta.push({ label: profile.phone, dot: "bg-purple-400" })

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
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-lg font-semibold text-white">
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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
              <IdCard className="h-4 w-4" />
            </span>
            Personal Information
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Contact and work details
          </CardDescription>
          {canEdit && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
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
