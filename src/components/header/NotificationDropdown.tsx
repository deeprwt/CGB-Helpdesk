"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

type Notification = {
  id: string;
  ticket_id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  actor: {
    full_name: string;
    avatar_url: string | null;
  };
};

export default function NotificationDropdown() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [hasUnread, setHasUnread] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("notifications")
        .select(`
          id,
          ticket_id,
          message,
          type,
          is_read,
          created_at,
          actor:actor_id (
            full_name,
            avatar_url
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

    const normalized = (data ?? []).map((n) => ({
  ...n,
  actor: n.actor[0],
}))

setNotifications(normalized)


      // REALTIME
      supabase
        .channel("notification-channel")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifications((prev) => [payload.new as any, ...prev]);
            setHasUnread(true);
          }
        )
        .subscribe();
    };

    load();
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-orange-500 animate-ping" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[360px] p-2">
        <h4 className="px-3 py-2 text-sm font-semibold">Notifications</h4>

        <div className="max-h-[420px] overflow-y-auto">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={`/ticket/${n.ticket_id}`}
              className="flex gap-3 rounded-lg p-3 hover:bg-muted"
            >
              <Avatar>
                <AvatarImage src={n.actor.avatar_url ?? undefined} />
                <AvatarFallback>
                  {n.actor.full_name[0]}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    {n.actor.full_name}
                  </span>{" "}
                  {n.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleTimeString()}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <Link
          href="/notifications"
          className="block mt-2 rounded-md border p-2 text-center text-sm"
        >
          View all
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
