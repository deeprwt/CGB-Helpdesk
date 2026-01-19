"use client";

import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type UserAddress = {
  country: string | null;
  city: string | null;
  postal_code: string | null;
  present_address: string | null;
  permanent_address: string | null;
};

export default function UserAddressCard() {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [data, setData] = React.useState<UserAddress | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Restore session
  React.useEffect(() => {
    const initSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUserId(session?.user?.id ?? null);
    };

    initSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Fetch user address
  React.useEffect(() => {
    if (!userId) return;

    const fetchAddress = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select(
          "country, city, postal_code, present_address, permanent_address"
        )
        .eq("id", userId)
        .single();

      if (!error) {
        setData(data);
      }

      setLoading(false);
    };

    fetchAddress();
  }, [userId]);

  return (
    <Card className="rounded-2xl border">
      <CardHeader>
        <CardTitle>Address</CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <AddressSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7">
            <AddressItem label="Country" value={data?.country} />
            <AddressItem label="City" value={data?.city} />
            <AddressItem label="Postal Code" value={data?.postal_code} />
            <AddressItem
              label="Present Address"
              value={data?.present_address}
            />
            <AddressItem
              label="Permanent Address"
              value={data?.permanent_address}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- helpers ---------------- */

function AddressItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">
        {value || "—"}
      </p>
    </div>
  );
}

function AddressSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
