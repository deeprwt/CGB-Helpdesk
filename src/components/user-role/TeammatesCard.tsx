"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ArrowRight, MoreVertical, UserRound, UsersRound } from "lucide-react";
import { getInitials } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabaseClient";
import { getUserAccessibleDomains, buildEmailDomainFilter } from "@/lib/org";

type UserRole = "user" | "engineer" | "admin" | "superadmin";

interface OnlineEngineer {
  id: string;
  full_name: string;
  avatar_url: string | null;
  last_seen_at: string;
}

export default function TeammatesCard() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [engineers, setEngineers] = useState<OnlineEngineer[]>([]);
  const [ready, setReady] = useState<boolean>(false);

  /* 🟢 WhatsApp-style presence (tab-aware heartbeat) */
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const updatePresence = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      await supabase
        .from("users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    };

    const start = () => {
      updatePresence();
      interval = setInterval(updatePresence, 30000);
    };

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };

    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, []);

  /* 📥 Load role + online engineers */
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setReady(true);
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile) {
        setReady(true);
        return;
      }

      setRole(profile.role);

      /* 🚫 Normal users see nothing (no loader) */
      if (profile.role === "user") {
        setReady(true);
        return;
      }

      const onlineCutoff = new Date(
        Date.now() - 2 * 60 * 1000
      ).toISOString();

      // Scope to accessible org(s) engineers
      const domains = await getUserAccessibleDomains(supabase, user.id, user.email ?? "", profile.role);

      const { data } = await supabase
        .from("users")
        .select("id, full_name, avatar_url, last_seen_at")
        .eq("role", "engineer")
        .or(buildEmailDomainFilter(domains))
        .gte("last_seen_at", onlineCutoff)
        .order("last_seen_at", { ascending: false })
        .limit(5);

      setEngineers(data ?? []);
      setReady(true);
    };

    load();
  }, []);

  /* 🚫 Do not render for normal users */
  if (!ready || role === "user") {
    return null;
  }

  const title =
    role === "admin" ? "Online Engineers" : "Teammates";

  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          {title}
          <StatusBadge tone="emerald" dot className="text-[11px]">
            Live
          </StatusBadge>
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400">
          Engineers active in the last 2 minutes
        </CardDescription>

        {role === "admin" && (
          <CardAction>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-brand-600 hover:bg-brand-50 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-brand-500/10"
            >
              <Link href="/engineers">
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex-1">
        {engineers.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="Nobody online"
            description="No engineers are online right now."
            className="py-8"
          />
        ) : (
          <ul className="-mx-2 flex flex-col gap-1">
            {engineers.map((engineer) => (
              <li
                key={engineer.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={engineer.avatar_url ?? undefined}
                      alt={engineer.full_name}
                    />
                    <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
                      {getInitials(engineer.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* 🟢 WhatsApp-style online dot */}
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {engineer.full_name}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Online
                  </p>
                </div>

                <StatusBadge tone="sky" className="hidden sm:inline-flex">
                  Engineer
                </StatusBadge>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${engineer.full_name}`}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/profile/${engineer.id}`}>
                        <UserRound />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
