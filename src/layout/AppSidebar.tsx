"use client";

import React, { useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Ticket,
  UserCircle2,
  Users,
  Boxes,
  Building2,
  ShieldCheck,
  Link2,
  Plus,
  LogOut,
  MoreVertical,
  type LucideIcon,
} from "lucide-react";

import { useSidebar } from "../context/SidebarContext";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { useCurrentUser, getInitials, roleLabel, type AppRole } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  name: string;
  icon: LucideIcon;
  path: string;
  /** Roles that can see this item */
  roles: AppRole[];
};

type NavSection = { title: string; items: NavItem[] };

const ALL: AppRole[] = ["user", "engineer", "admin", "superadmin"];
const STAFF: AppRole[] = ["engineer", "admin", "superadmin"];

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Menu",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, path: "/", roles: ALL },
      { name: "Tickets", icon: Ticket, path: "/ticket", roles: ALL },
      { name: "User Profile", icon: UserCircle2, path: "/profile", roles: ALL },
      { name: "User & Role", icon: Users, path: "/user", roles: STAFF },
      { name: "Assets", icon: Boxes, path: "/assets", roles: STAFF },
      { name: "AskMira", icon: Link2, path: "/askmira", roles: ["admin", "superadmin"] },
    ],
  },
  {
    title: "Super Admin",
    items: [
      { name: "Organizations", icon: Building2, path: "/super-admin/organizations", roles: ["superadmin"] },
      { name: "Access Control", icon: ShieldCheck, path: "/super-admin/access-control", roles: ["superadmin"] },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const { user, loading } = useCurrentUser();
  const pathname = usePathname();

  // Expanded when pinned open, hovered, or showing as the mobile drawer
  const open = isExpanded || isHovered || isMobileOpen;

  const sections = useMemo(
    () =>
      user
        ? NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(user.role)) })).filter(
            (s) => s.items.length > 0,
          )
        : [],
    [user],
  );

  const isActive = useCallback(
    (path: string) => (path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/")),
    [pathname],
  );

  const handleLinkClick = useCallback(() => {
    if (isMobileOpen) toggleMobileSidebar();
  }, [isMobileOpen, toggleMobileSidebar]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign out error:", error.message);
    else toast.success("Signed out successfully");
  };

  const accountMenu = (
    <DropdownMenuContent align="end" side={open ? "top" : "right"} className="w-56">
      <DropdownMenuLabel className="font-normal">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user?.full_name}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/profile" onClick={handleLinkClick}>
          <UserCircle2 /> My Profile
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
        <LogOut /> Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <aside
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed left-0 top-0 z-50 mt-16 flex h-[calc(100vh-4rem)] flex-col border-r border-gray-200/80 bg-white text-gray-900 transition-[width,transform] duration-200 ease-out lg:mt-0 lg:h-screen",
        "dark:border-white/10 dark:bg-gray-950 dark:text-gray-100",
        open ? "w-[260px]" : "w-[84px]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0",
      )}
    >
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className={cn("hidden min-h-[72px] shrink-0 items-center px-5 py-4 lg:flex", open ? "justify-start" : "justify-center")}>
        <Link href="/" onClick={handleLinkClick} className="flex items-center gap-2">
          {open ? (
            <>
              <Image className="h-auto w-[132px] dark:hidden" src="/images/logo/logo.svg" alt="Logo" width={132} height={73} priority />
              <Image className="hidden h-auto w-[132px] dark:block" src="/images/logo/logo-dark.svg" alt="Logo" width={132} height={76} priority />
            </>
          ) : (
            <Image src="/images/logo/logo-icon.svg" alt="Logo" width={32} height={32} priority />
          )}
        </Link>
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4 pt-4 lg:pt-2">
        {loading && (
          <div className="flex flex-col gap-2 px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-10 rounded-xl", open ? "w-full" : "mx-auto w-10")} />
            ))}
          </div>
        )}

        {sections.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            <p
              className={cn(
                "mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400",
                !open && "text-center",
              )}
            >
              {open ? section.title : "•••"}
            </p>

            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                const link = (
                  <Link
                    href={item.path}
                    onClick={handleLinkClick}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center rounded-xl transition-all duration-150 ease-out",
                      open ? "gap-3 px-3 py-2.5" : "mx-auto h-10 w-10 justify-center",
                      active
                        ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
                    )}
                  >
                    {active && open && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500"
                      />
                    )}
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
                        active
                          ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30"
                          : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-700 dark:bg-white/5 dark:text-gray-400 dark:group-hover:bg-white/10",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    {open && (
                      <span className={cn("flex-1 truncate text-sm font-medium", active && "font-semibold")}>
                        {item.name}
                      </span>
                    )}
                  </Link>
                );

                return (
                  <li key={item.path}>
                    {open ? (
                      link
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.name}</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── New Ticket CTA ───────────────────────────────────────────── */}
      <div className={cn("px-3 pb-3", !open && "flex justify-center")}>
        <Button
          asChild
          className={cn(
            "group relative overflow-hidden rounded-xl",
            open ? "h-10 w-full justify-start gap-2 px-3 font-semibold" : "h-10 w-10 p-0",
          )}
        >
          <Link href="/create-ticket" onClick={handleLinkClick} title={!open ? "New Ticket" : undefined}>
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <Plus className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
            {open && <span>New Ticket</span>}
          </Link>
        </Button>
      </div>

      {/* ── User footer ──────────────────────────────────────────────── */}
      {user && (
        <div className={cn("border-t border-gray-200/80 p-3 dark:border-white/10", !open && "flex justify-center")}>
          {open ? (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
                    {getInitials(user.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-gray-50 dark:ring-gray-950" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user.full_name}</p>
                <p className="truncate text-[11px] font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
                  {roleLabel(user.role)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Account menu" className="text-gray-400">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                {accountMenu}
              </DropdownMenu>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Account menu" className="relative rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-brand-500 text-xs font-semibold text-white">
                      {getInitials(user.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-950" />
                </Button>
              </DropdownMenuTrigger>
              {accountMenu}
            </DropdownMenu>
          )}
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
