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
import { PageHeader } from "@/components/common/page-header"

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
                organization_id: asset.organization_id ?? "",
                asset_code: asset.asset_code ?? "",
                asset_type: asset.asset_type ?? "",
                model: asset.model ?? "",
                status: asset.status,
                location: asset.location ?? "",
                department: asset.department ?? "",
                serial_no: map.serial_no ?? "",
                cpu: map.cpu ?? "",
                ram: map.ram ?? "",
                storage: map.storage ?? "",
                os_name: map.os_name ?? "",
                mac_address: map.mac_address ?? "",
                vendor: map.vendor ?? "",
                purchase_date: asset.purchase_date ?? "",
                warranty_expiry: asset.warranty_expiry ?? "",
            })
        }

        load()
    }, [id])

    if (!data) {
        return (
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-8 w-56" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <div className="grid gap-6 xl:grid-cols-3">
                    <div className="flex flex-col gap-6 xl:col-span-2">
                        <Skeleton className="h-96 w-full rounded-2xl" />
                        <Skeleton className="h-72 w-full rounded-2xl" />
                    </div>
                    <div className="flex flex-col gap-6">
                        <Skeleton className="h-56 w-full rounded-2xl" />
                        <Skeleton className="h-56 w-full rounded-2xl" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
            <div className="flex flex-col gap-6">
                <PageHeader
                    breadcrumbs={[
                        { label: "Assets", href: "/assets" },
                        { label: data.asset_code || "Asset", href: `/assets/${id}` },
                        { label: "Edit" },
                    ]}
                    title="Edit Asset"
                    description={
                        data.asset_code
                            ? `Update details, warranty and assignment for ${data.asset_code}.`
                            : "Update details, warranty and assignment for this asset."
                    }
                />

                <AssetForm
                    mode="edit"
                    assetId={id}
                    initialData={data}
                    initialAssignedUser={assignedUser}
                />
            </div>
        </RoleGate>
    )
}
