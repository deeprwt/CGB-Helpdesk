import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "@/components/ui/button";

export const ThemeToggleButton: React.FC = () => {
  const { toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
    >
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  );
};
