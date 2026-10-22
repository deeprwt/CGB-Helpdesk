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
import {
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  Loader2,
  Paperclip,
  Send,
  UploadCloud,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabaseClient"
import { cn } from "@/lib/utils"
import { CATEGORY_MAP } from "@/lib/ticket-categories"
import { getInitials } from "@/hooks/useCurrentUser"

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
type Role = "user" | "engineer" | "admin"

type UserLite = {
  id: string
  full_name: string
  email: string
  phone: number | null
  role: Role
}

type AssignedAsset = {
  asset_id: string
  assets: {
    asset_code: string
    asset_type: string
    model: string | null
  }
}

export default function CreateTicketForm() {
  const router = useRouter()
  const formRef = React.useRef<HTMLFormElement | null>(null)

  const [loading, setLoading] = React.useState(false)
  const [category, setCategory] = React.useState("")
  const [role, setRole] = React.useState<Role>("user")

  const [users, setUsers] = React.useState<UserLite[]>([])
  const [selectedUser, setSelectedUser] = React.useState<UserLite | null>(null)

  const [requesterName, setRequesterName] = React.useState("")
  const [contact, setContact] = React.useState("")

  const [assetRelated, setAssetRelated] =
    React.useState<"yes" | "no">("no")
  const [assets, setAssets] = React.useState<AssignedAsset[]>([])
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
        .select("id, full_name, email, phone, role")
        .eq("id", auth.user.id)
        .single()

      if (!me) return

      setRole(me.role)
      setSelectedUser(me)
      setRequesterName(me.full_name)
      setContact(me.phone?.toString() ?? "")

      if (me.role !== "user") {
        const { data } = await supabase
          .from("users")
          .select("id, full_name, email, phone, role")
          .order("full_name")

        setUsers(data ?? [])
      }
    }

    load()
  }, [])

  /* -----------------------------------
     Load assigned assets
  ----------------------------------- */
  React.useEffect(() => {
    if (assetRelated !== "yes" || !selectedUser) {
      setAssets([])
      setAssetsLoaded(false)
      return
    }

    const loadAssets = async () => {
      setAssetsLoaded(false)

      const { data } = await supabase
        .from("asset_assignments")
        .select(`
          asset_id,
          assets:assets!asset_assignments_asset_id_fkey!inner (
            asset_code,
            asset_type,
            model
          )
        `)
        .eq("user_id", selectedUser.id)
        .is("returned_at", null)
        .returns<AssignedAsset[]>()

      setAssets(data ?? [])
      setAssetsLoaded(true)
    }

    loadAssets()
  }, [assetRelated, selectedUser])

  /* -----------------------------------
     Submit
  ----------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current || !selectedUser) return

    setLoading(true)

    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error("Unauthorized")

      const formData = new FormData(formRef.current)
      formData.set("requester_id", selectedUser.id)

      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: formData,
      })

      const result = await res.json().catch(() => null)
      if (!res.ok || !result?.ticketId) throw new Error(result?.error ?? "Failed")

      toast.success("Ticket created successfully")
      // Button stays disabled while navigating, so it can't be submitted twice
      router.push(`/ticket/${result.ticketId}`)
    } catch {
      toast.error("Failed to create ticket")
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
                                keywords={[u.full_name ?? "", u.email ?? ""]}
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
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">{u.full_name}</span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {u.email}
                                  </span>
                                </span>
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

              {/* Category */}
              <Field>
                <FieldLabel htmlFor="category">Category</FieldLabel>
                <Select name="category" value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CATEGORY_MAP).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="sub_category">Sub Category</FieldLabel>
                <Select name="sub_category" disabled={!category}>
                  <SelectTrigger id="sub_category">
                    <SelectValue
                      placeholder={category ? "Select sub category" : "Choose a category first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(CATEGORY_MAP[category] ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Priority */}
              <Field>
                <FieldLabel htmlFor="priority">Priority</FieldLabel>
                <Select name="priority">
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

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
                          <SelectItem key={a.asset_id} value={a.asset_id}>
                            {a.assets.asset_code} — {a.assets.asset_type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : !assetsLoaded ? (
                    <Skeleton className="h-11 w-full" />
                  ) : (
                    <FieldDescription className="flex h-11 items-center">
                      No assets are currently assigned to this user.
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
