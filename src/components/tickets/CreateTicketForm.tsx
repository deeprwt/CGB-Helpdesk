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
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { supabase } from "@/lib/supabaseClient"

/* -----------------------------------
   Category → Sub Category Map
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
   User Profile Type
----------------------------------- */
type UserProfile = {
  full_name: string
  phone: string
  employee_id: string | null
  department: string | null
  designation: string | null
  position: string | null
  manager: string | null
  present_address: string | null
  permanent_address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
}

export default function CreateTicketForm() {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [category, setCategory] = React.useState<string>("")
  const [profile, setProfile] = React.useState<UserProfile | null>(null)
  const [requesterName, setRequesterName] = React.useState("")
const [contact, setContact] = React.useState("")


  /* -----------------------------------
     Load User Profile
  ----------------------------------- */
  React.useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from("users")
        .select(`
          full_name,
          phone,
          employee_id,
          department,
          designation,
          position,
          manager,
          present_address,
          permanent_address,
          city,
          postal_code,
          country
        `)
        .eq("id", user.id)
        .single()

      if (data) {
  setProfile(data)
  setRequesterName(data.full_name ?? "")
  setContact(data.phone ?? "")
}

    }

    loadProfile()
  }, [])

  /* -----------------------------------
     Submit Handler
  ----------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current) return

    setLoading(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        toast.error("You are not logged in")
        return
      }

      const formData = new FormData(formRef.current)

      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      if (!res.ok) {
        const data: { error?: string } = await res.json()
        throw new Error(data.error || "Failed to create ticket")
      }

      toast.success("Ticket created successfully")
      formRef.current.reset()
      setCategory("")
    } catch (err) {
      console.error(err)
      toast.error("Failed to create ticket")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">

      {/* Requester (Prefilled) */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <Label>Requester</Label>
    <Input
      name="requester_name"
      value={requesterName}
      onChange={(e) => setRequesterName(e.target.value)}
      placeholder="Enter full name"
    />
  </div>

  <div>
    <Label>Contact</Label>
    <Input
      name="contact"
      value={contact}
      onChange={(e) => setContact(e.target.value)}
      placeholder="Enter phone number"
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
        <Textarea name="description" rows={4} />
      </div>

      {/* Category / Sub Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Category</Label>
          <Select
            name="category"
            value={category}
            onValueChange={(v) => setCategory(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(CATEGORY_MAP).map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Sub Category</Label>
          <Select name="sub_category" disabled={!category}>
            <SelectTrigger>
              <SelectValue placeholder="Select sub category" />
            </SelectTrigger>
            <SelectContent>
              {(CATEGORY_MAP[category] ?? []).map((sub) => (
                <SelectItem key={sub} value={sub}>
                  {sub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Priority / Urgency */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Priority</Label>
          <Select name="priority">
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Urgency</Label>
          <Select name="urgency">
            <SelectTrigger>
              <SelectValue placeholder="Select urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assignee / Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* <div>
          <Label>Assignee</Label>
          <Input name="assignee" />
        </div> */}
        <div>
          <Label>Location</Label>
          <Input name="location" />
        </div>
      </div>

      {/* Inventory / Attachments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Inventory</Label>
          <Input name="inventory" />
        </div>
        <div>
          <Label>Attachments</Label>
          <Input type="file" name="attachments" multiple />
        </div>
      </div>

      {/* Link / CC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Reference Link</Label>
          <Input name="link" />
        </div>
        <div>
          <Label>CC</Label>
          <Input name="cc" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Ticket"}
        </Button>
      </div>
    </form>
  )
}
