"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  MessageSquare,
  UserCheck,
  XCircle,
  PauseCircle,
  RefreshCw,
  CheckCheck,
} from "lucide-react";
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
  actor: {
    full_name: string;
    avatar_url: string | null;
  } | null;
};

/* -----------------------------------
   Helpers
----------------------------------- */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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
  message: <MessageSquare className="h-4 w-4" />,
  acquired: <UserCheck className="h-4 w-4" />,
  closed: <XCircle className="h-4 w-4" />,
  hold: <PauseCircle className="h-4 w-4" />,
  status_changed: <RefreshCw className="h-4 w-4" />,
};

const TYPE_COLOR: Record<string, string> = {
  message: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
  acquired: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  hold: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
  status_changed: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
};

const TYPE_LABEL: Record<string, string> = {
  message: "Message",
  acquired: "Acquired",
  closed: "Closed",
  hold: "On Hold",
  status_changed: "Status",
};

type FilterTab = "all" | "unread" | "message" | "acquired" | "closed" | "hold";

/* -----------------------------------
   Page
----------------------------------- */
export default function NotificationsPage() {
  const [notifications, setNotifications] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const [userId, setUserId] = React.useState<string | null>(null);

  /* ── Load ──────────────────────── */
  const load = React.useCallback(async (uid: string) => {
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
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    const rows: NotificationRow[] = (data ?? []).map((n: any) => ({
      ...n,
      actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : (n.actor ?? null),
    }));

    setNotifications(rows);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      await load(user.id);

      /* Mark all as read on page visit */
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      /* Realtime */
      supabase
        .channel(`notifications-page-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => load(user.id)
        )
        .subscribe();
    };

    init();
  }, [load]);

  /* ── Mark all read manually ──────── */
  const markAllRead = async () => {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  /* ── Filter ─────────────────────── */
  const filtered = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.is_read;
    return n.type === filter;
  });

  /* ── Group by date ───────────────── */
  const grouped = filtered.reduce<Record<string, NotificationRow[]>>(
    (acc, n) => {
      const label = formatDate(n.created_at);
      if (!acc[label]) acc[label] = [];
      acc[label].push(n);
      return acc;
    },
    {}
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` },
    { key: "message", label: "Messages" },
    { key: "acquired", label: "Acquired" },
    { key: "closed", label: "Closed" },
    { key: "hold", label: "On Hold" },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stay updated on your ticket activity
          </p>
        </div>

        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filter === tab.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <Card className="divide-y divide-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <Bell className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No notifications found</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              {/* Date group heading */}
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                {dateLabel}
              </p>

              <Card className="divide-y divide-border/40 overflow-hidden">
                {items.map((n) => {
                  const actorName = n.actor?.full_name ?? "Someone";
                  const actorInitial = actorName[0]?.toUpperCase() ?? "?";
                  const iconEl = TYPE_ICON[n.type] ?? TYPE_ICON.status_changed;
                  const iconColor = TYPE_COLOR[n.type] ?? TYPE_COLOR.status_changed;
                  const typeLabel = TYPE_LABEL[n.type] ?? "Update";

                  return (
                    <Link
                      key={n.id}
                      href={`/ticket/${n.ticket_id}`}
                      className={cn(
                        "flex items-start gap-4 px-4 py-4 hover:bg-muted/50 transition-colors",
                        !n.is_read && "bg-blue-50/50 dark:bg-blue-950/10"
                      )}
                    >
                      {/* Avatar + type badge */}
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={n.actor?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-sm font-bold bg-muted">
                            {actorInitial}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background",
                            iconColor
                          )}
                        >
                          {iconEl}
                        </span>
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">
                          <span className="font-semibold">{actorName}</span>{" "}
                          <span className="text-foreground/80">{n.message}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5",
                              iconColor
                            )}
                          >
                            {typeLabel}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Unread dot */}
                      {!n.is_read && (
                        <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                      )}
                    </Link>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
