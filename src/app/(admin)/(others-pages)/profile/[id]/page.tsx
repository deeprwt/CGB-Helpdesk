"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Skeleton } from "@/components/ui/skeleton"
import UserInfoCard from "@/components/user-profile/UserInfoCard"
import { UserTicketOverviewById } from "@/components/user-profile/UserTicketOverviewById"
import { UserAddressCardById } from "@/components/user-profile/UserAddressCardById"
import RoleGate from "@/components/auth/RoleGate"


type Role = "user" | "engineer" | "admin"

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
        return <Skeleton className="h-64 w-full" />
    }

    return (
        <>
            <RoleGate allowedRoles={["engineer", "admin"]}>
                <div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
                        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
                            Profile
                        </h3>
                        <div className="space-y-6">
                            <UserTicketOverviewById userId={profileId} />
                            <UserInfoCard
                                profileId={profileId}
                                currentRole={currentRole}
                            />
                            <UserAddressCardById userId={profileId} />
                        </div>
                    </div>
                </div>
            </RoleGate>
        </>
    )
}
