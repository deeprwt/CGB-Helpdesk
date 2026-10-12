"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCardSkeleton } from "@/components/common/stat-card"
import UserInfoCard from "@/components/user-profile/UserInfoCard"
import { UserTicketOverviewById } from "@/components/user-profile/UserTicketOverviewById"
import { UserAddressCardById } from "@/components/user-profile/UserAddressCardById"
import RoleGate from "@/components/auth/RoleGate"


type Role = "user" | "engineer" | "admin" | "superadmin"

export default function ProfilePage() {
    const params = useParams()
    const router = useRouter()

    const profileId =
        typeof params?.id === "string" ? params.id : ""

    const [currentRole, setCurrentRole] =
        React.useState<Role | null>(null)

    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        const init = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (!user) {
                router.push("/login")
                return
            }

            const { data: me } = await supabase
                .from("users")
                .select("role")
                .eq("id", user.id)
                .single()

            setCurrentRole(me?.role ?? "user")
            setLoading(false)
        }

        init()
    }, [router])

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-36 w-full rounded-2xl" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <StatCardSkeleton key={i} />
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Skeleton className="h-72 w-full rounded-2xl" />
                    <Skeleton className="h-72 w-full rounded-2xl" />
                </div>
            </div>
        )
    }

    return (
        <>
            <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
                {/*
                  UserInfoCard renders the hero header (order-first, full width)
                  plus the personal-information card. Ticket stats span both
                  columns; info + address cards sit side by side on lg.
                */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <UserTicketOverviewById userId={profileId} />
                    <UserInfoCard
                        profileId={profileId}
                        currentRole={currentRole}
                    />
                    <UserAddressCardById userId={profileId} />
                </div>
            </RoleGate>
        </>
    )
}
