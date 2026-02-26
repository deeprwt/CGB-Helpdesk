"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, MessageSquare, UserCheck, XCircle, PauseCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/* -----------------------------------
   Types
----------------------------------- */
type NotificationRow = {
  id: string;
  ticket_id: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  actor_id: string;
  actor: {
    full_name: string;
    avatar_url: string | null;
  } | null;
};

/* -----------------------------------
   Helpers
----------------------------------- */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  message: <MessageSquare className="h-3.5 w-3.5" />,
  acquired: <UserCheck className="h-3.5 w-3.5" />,
  closed: <XCircle className="h-3.5 w-3.5" />,
  hold: <PauseCircle className="h-3.5 w-3.5" />,
  status_changed: <RefreshCw className="h-3.5 w-3.5" />,
};

const TYPE_COLOR: Record<string, string> = {
  message: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
  acquired: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  hold: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
  status_changed: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
};

/* -----------------------------------
   Component
----------------------------------- */
export default function NotificationDropdown() {
  const router = useRouter();
  const [notifications, setNotifications] = React.useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  /* ── Load + count unread ─────────── */
  const loadNotifications = React.useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("notifications")
      .select(`
        id,
        ticket_id,
        message,
        type,
        is_read,
        created_at,
        actor_id,
        actor:actor_id (
          full_name,
          avatar_url
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const rows: NotificationRow[] = (data ?? []).map((n: any) => ({
      ...n,
      actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : (n.actor ?? null),
    }));

    setNotifications(rows);
    setUnreadCount(rows.filter((r) => !r.is_read).length);
  }, []);

  /* ── Initial load + realtime ─────── */
  React.useEffect(() => {
    let userId = "";
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      userId = user.id;

      await loadNotifications(userId);

      channel = supabase
        .channel(`notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            loadNotifications(userId);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  /* ── Mark all read when dropdown opens ── */
  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);

    if (isOpen && unreadCount > 0) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("is_read", false);

        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[380px] p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-bold px-1.5 py-0.5">
                {unreadCount} new
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-muted-foreground"
            onClick={() => {
              setOpen(false);
              router.push("/notifications");
            }}
          >
            View all
          </Button>
        </div>

        {/* List */}
        <div className="max-h-[440px] overflow-y-auto divide-y divide-border/40">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => {
              const actorName = n.actor?.full_name ?? "Someone";
              const actorInitial = actorName[0]?.toUpperCase() ?? "?";
              const iconEl = TYPE_ICON[n.type] ?? TYPE_ICON.status_changed;
              const iconColor = TYPE_COLOR[n.type] ?? TYPE_COLOR.status_changed;

              return (
                <Link
                  key={n.id}
                  href={`/ticket/${n.ticket_id}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 hover:bg-muted/60 transition-colors",
                    !n.is_read && "bg-blue-50/60 dark:bg-blue-950/20"
                  )}
                >
                  {/* Avatar + type icon */}
                  <div className="relative flex-shrink-0 mt-0.5">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={n.actor?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs font-bold bg-muted">
                        {actorInitial}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        "absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background",
                        iconColor
                      )}
                    >
                      {iconEl}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{actorName}</span>{" "}
                      <span className="text-foreground/80">{n.message}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                  )}
                </Link>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
