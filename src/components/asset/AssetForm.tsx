"use client"

import * as React from "react"
import { supabase } from "@/lib/supabaseClient"
import { getUserAccessibleDomains, buildEmailDomainFilter } from "@/lib/org"
import { useRouter } from "next/navigation"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
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
} from "@/components/ui/command"
import { toast } from "sonner"

/* ---------------- TYPES ---------------- */

export type User = {
  id: string
  email: string
}

export type AssetFormState = {
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

  const [activeTab, setActiveTab] =
    React.useState<"basic" | "details" | "assign">("basic")

  const [loading, setLoading] = React.useState(false)

  const [form, setForm] = React.useState<AssetFormState>(
    initialData ?? {
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

  /* ---------------- USERS ---------------- */
  const [users, setUsers] = React.useState<User[]>([])
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
      const domains = await getUserAccessibleDomains(supabase, currentUser.id, currentUser.email ?? "", profile?.role ?? "user")

      const { data } = await supabase
        .from("users")
        .select("id, email")
        .or(buildEmailDomainFilter(domains))
        .order("email")

      setUsers(data ?? [])
    }

    loadUsers()
  }, [])

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
      setActiveTab("assign")
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
        toast.error("Failed to create asset")
        setLoading(false)
        return
      }

      assetIdFinal = asset.id
    } else {
      const { error } = await supabase
        .from("assets")
        .update({
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
        toast.error("Failed to update asset")
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
    <Card className="p-6 max-w-5xl space-y-6">
      <h2 className="text-xl font-semibold">
        {mode === "create" ? "Create Asset" : "Edit Asset"}
      </h2>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="basic">Asset Basics</TabsTrigger>
          <TabsTrigger value="details">Asset Details</TabsTrigger>
          <TabsTrigger value="assign">Assign Person</TabsTrigger>
        </TabsList>

        {/* BASIC */}
        <TabsContent value="basic" className="mt-4 grid md:grid-cols-2 gap-4">
          {[
            ["asset_code", "Asset Code"],
            ["asset_type", "Asset Type"],
            ["model", "Model"],
            ["location", "Location"],
            ["department", "Department"],
          ].map(([key, label]) => (
            <div key={key}>
              <Label className="mb-1.5 block">{label}</Label>
              <Input
                placeholder={label}
                value={form[key as keyof AssetFormState]}
                onChange={(e) =>
                  setForm({ ...form, [key]: e.target.value })
                }
              />
            </div>
          ))}

          <div>
            <Label className="mb-1.5 block">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  status: v as AssetFormState["status"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_use">In Use</SelectItem>
                <SelectItem value="spare">Spare</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-full flex justify-end">
            <Button onClick={() => setActiveTab("details")}>
              Next
            </Button>
          </div>
        </TabsContent>

        {/* DETAILS */}
        <TabsContent value="details" className="mt-4 grid md:grid-cols-2 gap-4">
          {[
            ["serial_no", "Serial No"],
            ["cpu", "CPU"],
            ["ram", "RAM"],
            ["storage", "Storage"],
            ["os_name", "OS Name"],
            ["mac_address", "MAC Address"],
            ["vendor", "Vendor"],
          ].map(([key, label]) => (
            <div key={key}>
              <Label className="mb-1.5 block">{label}</Label>
              <Input
                placeholder={label}
                value={form[key as keyof AssetFormState]}
                onChange={(e) =>
                  setForm({ ...form, [key]: e.target.value })
                }
              />
            </div>
          ))}

          <div>
            <Label className="mb-1.5 block">Purchase Date</Label>
            <Input
              type="date"
              value={form.purchase_date}
              onChange={(e) =>
                setForm({ ...form, purchase_date: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Warranty Expiry</Label>
            <Input
              type="date"
              value={form.warranty_expiry}
              onChange={(e) =>
                setForm({ ...form, warranty_expiry: e.target.value })
              }
            />
          </div>

          <div className="col-span-full flex justify-between">
            <Button variant="outline" onClick={() => setActiveTab("basic")}>
              Back
            </Button>
            <Button onClick={() => setActiveTab("assign")}>
              Next
            </Button>
          </div>
        </TabsContent>

        {/* ASSIGN */}
        <TabsContent value="assign" className="mt-4 space-y-4">
          <Label>Assign to User</Label>

          <Popover open={openAssign} onOpenChange={setOpenAssign}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {selectedUser ? selectedUser.email : "Search user"}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder="Search email..." />
                <CommandEmpty>No user found</CommandEmpty>
                <CommandGroup>
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={u.email}
                      onSelect={() => {
                        setSelectedUser(u)
                        setOpenAssign(false)
                      }}
                    >
                      {u.email}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setActiveTab("details")}>
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading
                ? "Saving..."
                : mode === "create"
                ? "Create Asset"
                : "Update Asset"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
