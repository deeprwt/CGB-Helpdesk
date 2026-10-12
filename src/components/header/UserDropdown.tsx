"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, LogOut, UserCircle2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser, getInitials, roleLabel } from "@/hooks/useCurrentUser";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function UserDropdown() {
  const { user, loading } = useCurrentUser();

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign out error:", error.message);
    else toast.success("Signed out successfully");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-3 rounded-full pl-1 pr-3 text-gray-700 dark:text-gray-300">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold leading-tight text-gray-900 dark:text-white">
              {user.full_name}
            </span>
            <span className="block text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400">
              {roleLabel(user.role)}
            </span>
          </span>
          <ChevronDown className="size-4 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
        <DropdownMenuLabel className="flex items-center gap-3 font-normal">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user.full_name}</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
            <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              {roleLabel(user.role)}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/profile">
            <UserCircle2 /> Edit profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={handleSignOut} className="cursor-pointer">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
