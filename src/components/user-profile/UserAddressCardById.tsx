"use client"

import * as React from "react"
import { MapPin } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type UserAddress = {
  country: string | null
  city: string | null
  postal_code: string | null
  present_address: string | null
  permanent_address: string | null
}

type Props = {
  userId: string
}

export function UserAddressCardById({ userId }: Props) {
  const [data, setData] =
    React.useState<UserAddress | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!userId) return

    const fetchAddress = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from("users")
        .select(
          "country, city, postal_code, present_address, permanent_address"
        )
        .eq("id", userId)
        .single()

      if (!error) {
        setData(data)
      }

      setLoading(false)
    }

    fetchAddress()
  }, [userId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base text-gray-900 dark:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20">
            <MapPin className="h-4 w-4" />
          </span>
          Address
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400">
          Location and mailing details
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <AddressSkeleton />
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <AddressItem label="Country" value={data?.country} />
            <AddressItem label="City" value={data?.city} />
            <AddressItem
              label="Postal Code"
              value={data?.postal_code}
            />
            <AddressItem
              label="Present Address"
              value={data?.present_address}
              className="sm:col-span-2"
            />
            <AddressItem
              label="Permanent Address"
              value={data?.permanent_address}
              className="sm:col-span-2"
            />
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- helpers ---------------- */

function AddressItem({
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

function AddressSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn("space-y-2", i > 2 && "sm:col-span-2")}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full max-w-[220px]" />
        </div>
      ))}
    </div>
  )
}
