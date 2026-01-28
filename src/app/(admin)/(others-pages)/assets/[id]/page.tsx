"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"

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

/* ---------------- COMPONENT ---------------- */

export default function AssetDetailsPage() {
  const { id } = useParams<{ id: string }>()

  const [asset, setAsset] = React.useState<Asset | null>(null)
  const [details, setDetails] = React.useState<AssetDetail[]>([])
  const [assignments, setAssignments] = React.useState<
    {
      order: number
      user_email: string
      assigned_by_email: string | null
      assigned_at: string
      returned_at: string | null
      isCurrent: boolean
    }[]
  >([])

  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const loadAll = async () => {
      setLoading(true)

      /* 1️⃣ ASSET */
      const { data: asset } = await supabase
        .from("assets")
        .select(`
          id,
          asset_code,
          asset_type,
          status,
          location,
          model,
          department,
          room,
          purchase_date,
          warranty_expiry
        `)
        .eq("id", id)
        .single()

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

      setAsset(asset ?? null)
      setDetails(details ?? [])
      setAssignments(mappedAssignments)
      setLoading(false)
    }

    loadAll()
  }, [id])

  if (loading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-48 w-full" />
      </Card>
    )
  }

  if (!asset) {
    return <div className="p-6">Asset not found</div>
  }

  return (
    <Card className="p-6 space-y-6">
      <h2 className="text-xl font-semibold">
        Asset: {asset.asset_code}
      </h2>

      <Tabs defaultValue="basic">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="basic">Asset Basics</TabsTrigger>
          <TabsTrigger value="details">Asset Details</TabsTrigger>
          <TabsTrigger value="assign">Assignment History</TabsTrigger>
          <TabsTrigger value="tickets">Ticket History</TabsTrigger>
        </TabsList>

        {/* BASIC */}
        <TabsContent value="basic">
          <Card className="p-4 space-y-2">
            <div><b>Type:</b> {asset.asset_type}</div>
            <div><b>Status:</b> {asset.status}</div>
            <div><b>Location:</b> {asset.location ?? "-"}</div>
            <div><b>Department:</b> {asset.department ?? "-"}</div>
            <div><b>Room:</b> {asset.room ?? "-"}</div>
            <div><b>Purchase Date:</b> {asset.purchase_date ?? "-"}</div>
            <div><b>Warranty Expiry:</b> {asset.warranty_expiry ?? "-"}</div>
          </Card>
        </TabsContent>

        {/* DETAILS */}
        <TabsContent value="details">
          <Card className="p-4 space-y-2">
            {details.length === 0 && (
              <div className="text-muted-foreground">
                No details added
              </div>
            )}

            {details.map((d) => (
              <div key={d.key}>
                <b>{d.key.replace(/_/g, " ").toUpperCase()}:</b>{" "}
                {d.value}
              </div>
            ))}
          </Card>
        </TabsContent>

        {/* ASSIGNMENT HISTORY */}
        <TabsContent value="assign">
          <Card className="p-4 space-y-3">
            {assignments.length === 0 && (
              <div className="text-muted-foreground">
                Asset has never been assigned
              </div>
            )}

            {assignments.map((a) => (
              <div
                key={a.order}
                className={`border rounded-md p-3 ${
                  a.isCurrent
                    ? "border-green-500 bg-green-50"
                    : ""
                }`}
              >
                <div className="font-medium">
                  {a.order}
                  {a.order === 1
                    ? "st"
                    : a.order === 2
                    ? "nd"
                    : a.order === 3
                    ? "rd"
                    : "th"}{" "}
                  Assignment{" "}
                  {a.isCurrent && (
                    <span className="text-green-600 ml-2">
                      (Current)
                    </span>
                  )}
                </div>

                <div>
                  <b>User:</b> {a.user_email}
                </div>

                <div>
                  <b>Assigned On:</b>{" "}
                  {new Date(a.assigned_at).toLocaleString()}
                </div>

                {a.returned_at && (
                  <div>
                    <b>Returned On:</b>{" "}
                    {new Date(a.returned_at).toLocaleString()}
                  </div>
                )}

                {a.assigned_by_email && (
                  <div>
                    <b>Assigned By:</b>{" "}
                    {a.assigned_by_email}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </TabsContent>

        {/* TICKETS */}
        <TabsContent value="tickets">
          <Card className="p-4 text-muted-foreground">
            Asset-related tickets will be listed here.
          </Card>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
