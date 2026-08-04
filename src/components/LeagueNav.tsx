"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, KeyRound, Menu } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./composite/ThemeToggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { LeagueNavLink } from "@/lib/league-nav";
import { cn } from "@/lib/utils";

interface LeagueNavProps {
  links: LeagueNavLink[];
}

export function LeagueNav({ links }: LeagueNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the sheet on route change
  const prevPathname = useRef(pathname);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setMobileOpen(false);
    }
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // No league chrome on the admin login screen
  if (pathname.includes("/admin/login")) {
    return null;
  }

  function linkState(link: LeagueNavLink) {
    const isActive =
      pathname === link.href ||
      (link.key === "admin" && pathname.startsWith(link.href));
    return { isActive, isAdmin: link.key === "admin" };
  }

  return (
    <nav className="dark wood-grain shadow-lg" aria-label="League navigation">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand — always goes to site home */}
          <Link href="/" className="flex items-center gap-3 h-full" title="LeagueLinks Home">
            <Logo size="sm" variant="contour" />
          </Link>

          {/* Mobile: theme toggle + menu sheet */}
          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-6 h-6" aria-hidden />
              </SheetTrigger>
              <SheetContent
                side="right"
                className="dark wood-grain border-white/10 text-white w-72"
              >
                <SheetHeader>
                  <SheetTitle className="text-board-yellow font-display uppercase tracking-wider text-left">
                    League Menu
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-1 px-4 pb-6">
                  <Link
                    href="/leagues"
                    className="px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider text-white/70 hover:text-board-yellow transition-colors"
                  >
                    &larr; All Leagues
                  </Link>
                  <div className="border-t border-white/10 my-1" />
                  {links.map((link) => {
                    const { isActive, isAdmin } = linkState(link);
                    return (
                      <Link
                        key={link.key}
                        href={link.href}
                        className={cn(
                          "px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5",
                          isActive
                            ? isAdmin
                              ? "bg-board-yellow/20 text-board-yellow"
                              : "bg-white/15 text-board-yellow"
                            : isAdmin
                              ? "text-board-yellow/70 hover:text-board-yellow"
                              : "text-white/80 hover:text-board-yellow hover:bg-white/5"
                        )}
                      >
                        {isAdmin && <KeyRound className="w-3 h-3" aria-hidden />}
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center">
            <Link
              href="/leagues"
              className="px-3 py-1.5 text-xs font-display font-semibold uppercase tracking-wider text-white/70 hover:text-board-yellow transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
              Leagues
            </Link>
            <div className="w-px h-5 bg-white/15 mx-1" aria-hidden="true" />

            {links.map((link) => {
              const { isActive, isAdmin } = linkState(link);
              return (
                <Link
                  key={link.key}
                  href={link.href}
                  className={cn(
                    "px-3 py-1.5 text-sm font-display font-semibold uppercase tracking-wider transition-all relative rounded flex items-center gap-1.5",
                    isActive
                      ? isAdmin
                        ? "bg-board-yellow/20 text-board-yellow"
                        : "bg-white/15 text-board-yellow shadow-sm -translate-y-px"
                      : isAdmin
                        ? "text-board-yellow/70 hover:text-board-yellow hover:bg-board-yellow/10"
                        : "text-white/80 hover:text-board-yellow hover:bg-white/5"
                  )}
                >
                  {isAdmin && <KeyRound className="w-3 h-3" aria-hidden />}
                  {link.label}
                </Link>
              );
            })}
            <div className="w-px h-5 bg-white/15 mx-1" aria-hidden="true" />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
