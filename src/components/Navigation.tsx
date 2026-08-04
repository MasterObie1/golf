"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ThemeToggle } from "./composite/ThemeToggle";
import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Menu, Plus, Search, X } from "lucide-react";

/**
 * Global site navigation. League pages get their own nav from the league
 * layout (LeagueNav); sudo pages have their own header in sudo/layout.
 */
export function Navigation() {
  const pathname = usePathname();
  const [leaguesOpen, setLeaguesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  // Close mobile menu on route change
  const prevPathname = useRef(pathname);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setMobileMenuOpen(false);
      setLeaguesOpen(false);
    }
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setLeaguesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDropdownKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        setLeaguesOpen((prev) => !prev);
        break;
      case "ArrowDown":
        e.preventDefault();
        setLeaguesOpen(true);
        setTimeout(() => menuItemsRef.current[0]?.focus(), 0);
        break;
      case "Escape":
        setLeaguesOpen(false);
        dropdownButtonRef.current?.focus();
        break;
    }
  }, []);

  const handleMenuItemKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        menuItemsRef.current[index + 1]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (index === 0) {
          dropdownButtonRef.current?.focus();
        } else {
          menuItemsRef.current[index - 1]?.focus();
        }
        break;
      case "Escape":
        setLeaguesOpen(false);
        dropdownButtonRef.current?.focus();
        break;
    }
  }, []);

  // League pages render LeagueNav from their layout; sudo has its own header.
  if (pathname.startsWith("/league/") || pathname.startsWith("/sudo")) {
    return null;
  }

  return (
    <nav className="dark wood-grain shadow-lg" aria-label="Main navigation">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center gap-3 h-full">
            <Logo size="sm" variant="contour" />
            <span className="text-board-yellow font-display text-lg font-bold tracking-wider uppercase hidden sm:block">
              LeagueLinks
            </span>
          </Link>

          {/* Mobile: theme toggle + hamburger */}
          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle />
            <button
              className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="global-mobile-menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" aria-hidden />
              ) : (
                <Menu className="w-6 h-6" aria-hidden />
              )}
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className={`px-4 py-1.5 text-sm font-display font-semibold uppercase tracking-wider transition-all rounded ${
                pathname === "/"
                  ? "bg-white/15 text-board-yellow shadow-sm"
                  : "text-white/80 hover:text-board-yellow hover:bg-white/5"
              }`}
            >
              Home
            </Link>

            {/* Leagues Dropdown */}
            <div
              className="relative"
              ref={dropdownRef}
              onMouseEnter={() => setLeaguesOpen(true)}
              onMouseLeave={() => setLeaguesOpen(false)}
            >
              <button
                ref={dropdownButtonRef}
                className={`px-4 py-1.5 text-sm font-display font-semibold uppercase tracking-wider transition-all flex items-center gap-1 rounded ${
                  pathname.startsWith("/leagues")
                    ? "bg-white/15 text-board-yellow shadow-sm"
                    : "text-white/80 hover:text-board-yellow hover:bg-white/5"
                }`}
                aria-expanded={leaguesOpen}
                aria-haspopup="true"
                aria-controls="leagues-dropdown-menu"
                onKeyDown={handleDropdownKeyDown}
                onClick={() => setLeaguesOpen((prev) => !prev)}
              >
                Leagues
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${leaguesOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {leaguesOpen && (
                <div className="absolute top-full left-0 pt-2 z-50">
                  <div
                    id="leagues-dropdown-menu"
                    role="menu"
                    className="w-52 bg-popover rounded-lg shadow-lg py-2 border border-border"
                  >
                    <Link
                      href="/leagues"
                      role="menuitem"
                      ref={(el) => { menuItemsRef.current[0] = el; }}
                      onKeyDown={(e) => handleMenuItemKeyDown(e, 0)}
                      className="flex items-center gap-3 px-4 py-2.5 text-popover-foreground hover:bg-accent transition-colors"
                    >
                      <Search className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                      <span className="font-medium font-sans">Find a League</span>
                    </Link>
                    <Link
                      href="/leagues/new"
                      role="menuitem"
                      ref={(el) => { menuItemsRef.current[1] = el; }}
                      onKeyDown={(e) => handleMenuItemKeyDown(e, 1)}
                      className="flex items-center gap-3 px-4 py-2.5 text-popover-foreground hover:bg-accent transition-colors"
                    >
                      <Plus className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                      <span className="font-medium font-sans">Create a League</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <div className="w-px h-5 bg-white/15 mx-1" aria-hidden="true" />
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div id="global-mobile-menu" className="md:hidden border-t border-white/10">
          <div className="px-4 py-3 space-y-1">
            <Link
              href="/"
              className={`block px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider transition-all ${
                pathname === "/"
                  ? "bg-white/15 text-board-yellow"
                  : "text-white/80 hover:text-board-yellow hover:bg-white/5"
              }`}
            >
              Home
            </Link>
            <Link
              href="/leagues"
              className={`block px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider transition-all ${
                pathname === "/leagues"
                  ? "bg-white/15 text-board-yellow"
                  : "text-white/80 hover:text-board-yellow hover:bg-white/5"
              }`}
            >
              Find a League
            </Link>
            <Link
              href="/leagues/new"
              className={`block px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider transition-all ${
                pathname === "/leagues/new"
                  ? "bg-white/15 text-board-yellow"
                  : "text-white/80 hover:text-board-yellow hover:bg-white/5"
              }`}
            >
              Create a League
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
