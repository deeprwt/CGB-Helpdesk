"use client";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";

export default function ThemeTogglerTwo() {
  const { toggleTheme } = useTheme();
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="size-14 rounded-full border-gray-200 bg-white text-brand-600 shadow-lg hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:bg-gray-800 dark:text-brand-300 dark:hover:bg-gray-700 dark:hover:text-brand-200"
    >
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  );
}
