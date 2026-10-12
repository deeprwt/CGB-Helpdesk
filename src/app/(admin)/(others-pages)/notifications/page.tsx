"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge";
import {
  Bell,
  MessageSquare,
  UserCheck,
  XCircle,
  PauseCircle,
  RefreshCw,
  CheckCheck,
  ChevronRight,
  type LucideIcon,
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

/** Notification type → icon, chip colour, badge tone and label */
const TYPE_META: Record<
  string,
  { icon: LucideIcon; chip: string; tone: BadgeTone; label: string }
> = {
  message: {
    icon: MessageSquare,
    chip: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20",
    tone: "blue",
    label: "Message",
  },
  acquired: {
    icon: UserCheck,
    chip: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
    tone: "emerald",
    label: "Acquired",
  },
  closed: {
    icon: XCircle,
    chip: "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10",
    tone: "gray",
    label: "Closed",
  },
  hold: {
    icon: PauseCircle,
    chip: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20",
    tone: "orange",
    label: "On Hold",
  },
  status_changed: {
    icon: RefreshCw,
    chip: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20",
    tone: "violet",
    label: "Status",
  },
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

  const TABS: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", count: unreadCount },
    { key: "message", label: "Messages" },
    { key: "acquired", label: "Acquired" },
    { key: "closed", label: "Closed" },
    { key: "hold", label: "On Hold" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* Header */}
      <PageHeader
        title="Notifications"
        description="Stay updated on your ticket activity"
        actions={
          unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
          )
        }
      />

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <div className="glass-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="flex-none px-3">
                {tab.label}
                {!!tab.count && (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-px text-[10px] font-semibold leading-4 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {tab.count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Content */}
      {loading ? (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-2.5 dark:border-white/5 dark:bg-white/[0.03]">
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 px-5 py-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={Bell}
            title="No notifications found"
            description={
              filter === "all"
                ? "You're all caught up. New ticket activity will show up here."
                : "Nothing matches this filter right now."
            }
            className="py-16"
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <section
              key={dateLabel}
              className="border-b border-gray-100 last:border-b-0 dark:border-white/5"
            >
              {/* Date group heading */}
              <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-2.5 dark:border-white/5 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {dateLabel}
                </p>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-white/5">
                {items.map((n) => {
                  const actorName = n.actor?.full_name ?? "Someone";
                  const actorInitial = actorName[0]?.toUpperCase() ?? "?";
                  const meta = TYPE_META[n.type] ?? TYPE_META.status_changed;
                  const typeLabel = TYPE_META[n.type]?.label ?? "Update";
                  const TypeIcon = meta.icon;

                  return (
                    <Link
                      key={n.id}
                      href={`/ticket/${n.ticket_id}`}
                      className={cn(
                        "group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]",
                        !n.is_read && "bg-indigo-50/50 dark:bg-indigo-500/[0.06]"
                      )}
                    >
                      {/* Avatar + type chip */}
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={n.actor?.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                            {actorInitial}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-900",
                            meta.chip
                          )}
                        >
                          <TypeIcon className="h-3 w-3" />
                        </span>
                      </div>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-gray-700 dark:text-gray-300">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {actorName}
                          </span>{" "}
                          {n.message}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <StatusBadge tone={meta.tone} className="px-2 text-[10px] uppercase tracking-wide">
                            {typeLabel}
                          </StatusBadge>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Unread dot / chevron */}
                      <div className="flex shrink-0 items-center gap-2 self-center">
                        {!n.is_read && (
                          <>
                            <span className="h-2 w-2 rounded-full bg-indigo-500" />
                            <span className="sr-only">Unread</span>
                          </>
                        )}
                        <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
