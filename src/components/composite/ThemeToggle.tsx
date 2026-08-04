"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Light/Dark/System theme switcher.
 * Defaults to the nav's dark-on-green treatment; override via className.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md text-white/80 transition-colors hover:text-board-yellow focus-visible:outline-2 focus-visible:outline-board-yellow",
          className
        )}
        aria-label="Change color theme"
      >
        <Sun className="size-5 dark:hidden" strokeWidth={1.75} aria-hidden />
        <Moon
          className="hidden size-5 dark:block"
          strokeWidth={1.75}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
