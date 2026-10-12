"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, MoreHorizontal, X } from "lucide-react";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import { useSidebar } from "@/context/SidebarContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";

const AppHeader: React.FC = () => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();

  const handleToggle = () => {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  };

  return (
    <header className="sticky top-0 z-40 flex w-full border-gray-200 bg-white/90 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/90 lg:border-b">
      <div className="flex grow flex-col items-center justify-between lg:flex-row lg:px-6">
        <div className="flex w-full items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <Button
            variant="outline"
            size="icon-lg"
            onClick={handleToggle}
            aria-label="Toggle sidebar"
            className="rounded-lg text-gray-500 dark:text-gray-400"
          >
            {isMobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>

          <Link href="/" className="lg:hidden">
            <Image width={154} height={32} className="dark:hidden" src="/images/logo/logo.svg" alt="Logo" />
            <Image width={154} height={32} className="hidden dark:block" src="/images/logo/logo-dark.svg" alt="Logo" />
          </Link>

          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => setApplicationMenuOpen((v) => !v)}
            aria-label="Toggle header menu"
            className="text-gray-700 dark:text-gray-400 lg:hidden"
          >
            <MoreHorizontal className="size-5" />
          </Button>

          <div className="hidden lg:block xl:w-[430px]">
            <SearchInput
              shortcut="⌘K"
              placeholder="Search or type command…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div
          className={cn(
            isApplicationMenuOpen ? "flex" : "hidden",
            "w-full items-center justify-between gap-4 px-5 py-4 shadow-theme-md lg:flex lg:justify-end lg:px-0 lg:shadow-none",
          )}
        >
          <div className="flex items-center gap-2 2xsm:gap-3">
            <ThemeToggleButton />
            <NotificationDropdown />
          </div>
          <UserDropdown />
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
