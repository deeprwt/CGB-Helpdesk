"use client"

import * as React from "react"
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
} from "@/components/ui/command"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabaseClient"

/* -----------------------------------
   Category → Sub Category Map (FULL)
----------------------------------- */
const CATEGORY_MAP: Record<string, string[]> = {
  "Access & Identity": [
    "Password Reset",
    "Account Locked",
    "New User Access",
    "Role / Permission Change",
    "SSO Login Issues",
  ],
  Hardware: [
    "Laptop Issue",
    "Desktop Issue",
    "Monitor",
    "Keyboard / Mouse",
    "Printer / Scanner",
    "Hardware Replacement",
  ],
  "Software / Applications": [
    "Application Not Working",
    "Software Installation Request",
    "License Request",
    "Update / Patch Issue",
    "Compatibility Issue",
    "Internal / Custom Application",
  ],
  "Network & Connectivity": [
    "No Internet",
    "VPN Issues",
    "Wi-Fi Slow / Unstable",
    "LAN Issue",
    "Firewall / Port Access Request",
    "DNS Issue",
  ],
  "Email & Collaboration": [
    "Email Not Sending / Receiving",
    "Mailbox Full",
    "Outlook / Gmail Issues",
    "Teams / Slack Issues",
    "Calendar / Meeting Issue",
    "Shared Mailbox Access",
  ],
  Security: [
    "Phishing / Suspicious Email",
    "Malware / Virus",
    "Device Compromised",
    "Security Access Request",
    "Data Loss Incident",
    "Policy Violation",
  ],
  Database: [
    "Database Down",
    "Query Performance Issue",
    "Database Access Request",
    "Backup / Restore",
  ],
  "Service Requests": [
    "New Laptop Request",
    "Software Installation",
    "VPN Access",
    "Email Group Creation",
  ],
}

/* -----------------------------------
   Types
----------------------------------- */
type Role = "user" | "engineer" | "admin"

type UserLite = {
  id: string
  full_name: string
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

  /* -----------------------------------
     Load current user
  ----------------------------------- */
  React.useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) return

      const { data: me } = await supabase
        .from("users")
        .select("id, full_name, phone, role")
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
          .select("id, full_name, phone, role")
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

      if (!res.ok) throw new Error("Failed")

      toast.success("Ticket created successfully")
      formRef.current.reset()
      setCategory("")
      setAssetRelated("no")
    } catch {
      toast.error("Failed to create ticket")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">

      {/* Engineer/Admin user search */}
      {role !== "user" && (
        <div>
          <Label>Raise Ticket For</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {selectedUser?.full_name ?? "Select user"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-full">
              <Command>
                <CommandInput placeholder="Search user..." />
                <CommandEmpty>No user found</CommandEmpty>
                <CommandGroup>
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      onSelect={() => {
                        setSelectedUser(u)
                        setRequesterName(u.full_name)
                        setContact(u.phone?.toString() ?? "")
                      }}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      {u.full_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Editable Name & Contact */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          <Input
            name="requester_name"
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
          />
        </div>

        <div>
          <Label>Contact</Label>
          <Input
            name="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>
      </div>

      {/* Subject */}
      <div>
        <Label>Subject *</Label>
        <Input name="subject" required />
      </div>

      {/* Description */}
      <div>
        <Label>Description</Label>
        <Textarea name="description" />
      </div>

      {/* Category */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Category</Label>
          <Select name="category" value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(CATEGORY_MAP).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Sub Category</Label>
          <Select name="sub_category" disabled={!category}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(CATEGORY_MAP[category] ?? []).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Priority */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Priority</Label>
          <Select name="priority">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Location */}
        <div>
          <Label>Location</Label>
          <Input name="location" />
        </div>
      </div>
      {/* Reference Link */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Reference Link</Label>
          <Input name="link" />
        </div>

        {/* Asset Radio + Select */}
        <div>
          <Label>Asset related?</Label>
          <RadioGroup
            value={assetRelated}
            onValueChange={(v) => setAssetRelated(v as any)}
            className="flex gap-4"
          >
            <RadioGroupItem value="no" /> No
            <RadioGroupItem value="yes" /> Yes
          </RadioGroup>
        </div>
      </div>
      {assetRelated === "yes" && assets.length > 0 && (
        <Select name="asset_id">
          <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
          <SelectContent>
            {assets.map((a) => (
              <SelectItem key={a.asset_id} value={a.asset_id}>
                {a.assets.asset_code} — {a.assets.asset_type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Attachments */}
      <div>
        <Label>Attachments</Label>
        <Input type="file" name="attachments" multiple />
      </div>

      <div className="flex justify-end">
        <Button disabled={loading}>
          {loading ? "Creating..." : "Create Ticket"}
        </Button>
      </div>
    </form>
  )
}
