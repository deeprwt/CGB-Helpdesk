"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import AssetForm, {
    AssetFormState,
    User,
} from "@/components/asset/AssetForm"
import { Skeleton } from "@/components/ui/skeleton"
import RoleGate from "@/components/auth/RoleGate"

export default function EditAssetPage() {
    const { id } = useParams<{ id: string }>()

    const [data, setData] = React.useState<AssetFormState | null>(null)
    const [assignedUser, setAssignedUser] =
        React.useState<User | null>(null)

    React.useEffect(() => {
        const load = async () => {
            const { data: asset } = await supabase
                .from("assets")
                .select("*")
                .eq("id", id)
                .single()

            const { data: details } = await supabase
                .from("asset_details")
                .select("key, value")
                .eq("asset_id", id)

            const { data: assignment } = await supabase
                .from("asset_assignments")
                .select("user_id")
                .eq("asset_id", id)
                .single()

            let user: User | null = null
            if (assignment?.user_id) {
                const { data } = await supabase
                    .from("users")
                    .select("id, email")
                    .eq("id", assignment.user_id)
                    .single()
                user = data ?? null
            }

            const map = Object.fromEntries(
                (details ?? []).map((d) => [d.key, d.value])
            )

            setAssignedUser(user)

            setData({
                asset_code: asset.asset_code ?? "",
                asset_type: asset.asset_type ?? "",
                model: asset.model ?? "",
                status: asset.status,
                location: asset.location ?? "",
                room: asset.room ?? "",
                department: asset.department ?? "",
                serial_no: map.serial_no ?? "",
                cpu: map.cpu ?? "",
                ram: map.ram ?? "",
                storage: map.storage ?? "",
                os_name: map.os_name ?? "",
                os_version: map.os_version ?? "",
                ip_address: map.ip_address ?? "",
                mac_address: map.mac_address ?? "",
                vendor: map.vendor ?? "",
                purchase_date: asset.purchase_date ?? "",
                warranty_expiry: asset.warranty_expiry ?? "",
            })
        }

        load()
    }, [id])

    if (!data) return <Skeleton className="h-96 w-full" />

    return (
        <RoleGate allowedRoles={["engineer", "admin"]}>
            <AssetForm
                mode="edit"
                assetId={id}
                initialData={data}
                initialAssignedUser={assignedUser}
            />
        </RoleGate>
    )
}
