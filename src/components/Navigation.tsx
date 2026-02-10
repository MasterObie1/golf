"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { useState, useEffect, useRef, useCallback } from "react";

interface AdminSession {
  leagueSlug: string;
}

interface NavigationProps {
  adminSession?: AdminSession | null;
}

export function Navigation({ adminSession }: NavigationProps) {
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

  // Don't show navigation on admin login pages
  if (pathname.includes("/admin/login")) {
    return null;
  }

  // Check if we're on a league-specific page
  const leagueMatch = pathname.match(/^\/league\/([^/]+)/);
  const leagueSlug = leagueMatch ? leagueMatch[1] : null;

  // Global navigation (home page and /leagues pages)
  if (!leagueSlug) {
    return (
      <nav className="wood-grain shadow-lg" aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo/Brand */}
            <Link href="/" className="flex items-center gap-3 h-full">
              <Logo size="sm" variant="contour" />
              <span className="text-board-yellow font-display text-lg font-bold tracking-wider uppercase hidden sm:block">
                LeagueLinks
              </span>
            </Link>

            {/* Mobile hamburger toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="global-mobile-menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

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
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${leaguesOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {leaguesOpen && (
                  <div className="absolute top-full left-0 pt-2 z-50">
                    <div
                      id="leagues-dropdown-menu"
                      role="menu"
                      className="w-52 bg-surface-white rounded-lg shadow-lg py-2 border border-border"
                    >
                      <Link
                        href="/leagues"
                        role="menuitem"
                        ref={(el) => { menuItemsRef.current[0] = el; }}
                        onKeyDown={(e) => handleMenuItemKeyDown(e, 0)}
                        className="flex items-center gap-3 px-4 py-2.5 text-text-primary hover:bg-surface transition-colors"
                      >
                        <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="font-medium font-sans">Find a League</span>
                      </Link>
                      <Link
                        href="/leagues/new"
                        role="menuitem"
                        ref={(el) => { menuItemsRef.current[1] = el; }}
                        onKeyDown={(e) => handleMenuItemKeyDown(e, 1)}
                        className="flex items-center gap-3 px-4 py-2.5 text-text-primary hover:bg-surface transition-colors"
                      >
                        <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="font-medium font-sans">Create a League</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
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

  // Check if user is admin for this specific league
  const isAdminForThisLeague = adminSession?.leagueSlug === leagueSlug;

  // League-specific navigation
  const leagueLinks = [
    { href: `/league/${leagueSlug}`, label: "Home" },
    { href: `/league/${leagueSlug}/leaderboard`, label: "Leaderboard" },
    { href: `/league/${leagueSlug}/history`, label: "History" },
    { href: `/league/${leagueSlug}/schedule`, label: "Schedule" },
    { href: `/league/${leagueSlug}/signup`, label: "Sign Up" },
    ...(isAdminForThisLeague ? [{ href: `/league/${leagueSlug}/admin`, label: "Admin" }] : []),
  ];

  return (
    <nav className="wood-grain shadow-lg" aria-label="League navigation">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand — always goes to site home */}
          <Link href="/" className="flex items-center gap-3 h-full" title="LeagueLinks Home">
            <Logo size="sm" variant="contour" />
          </Link>

          {/* Mobile hamburger toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="league-mobile-menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {/* Desktop Navigation Links — tab dividers */}
          <div className="hidden md:flex items-center">
            {/* All Leagues link */}
            <Link
              href="/leagues"
              className="px-3 py-1.5 text-xs font-display font-semibold uppercase tracking-wider text-white/70 hover:text-board-yellow transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Leagues
            </Link>
            <div className="w-px h-5 bg-white/15 mx-1" aria-hidden="true" />

            {leagueLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href.includes("/admin") && pathname.startsWith(link.href));
              const isAdmin = link.href.includes("/admin");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 text-sm font-display font-semibold uppercase tracking-wider transition-all relative rounded ${
                    isActive
                      ? isAdmin
                        ? "bg-board-yellow/20 text-board-yellow"
                        : "bg-white/15 text-board-yellow shadow-sm -translate-y-px"
                      : isAdmin
                      ? "text-board-yellow/70 hover:text-board-yellow hover:bg-board-yellow/10"
                      : "text-white/80 hover:text-board-yellow hover:bg-white/5"
                  }`}
                >
                  {isAdmin && (
                    <svg className="w-3 h-3 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  )}
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div id="league-mobile-menu" className="md:hidden border-t border-white/10">
          <div className="px-4 py-3 space-y-1">
            <Link
              href="/leagues"
              className="block px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider text-white/70 hover:text-board-yellow transition-colors"
            >
              &larr; All Leagues
            </Link>
            <div className="border-t border-white/10 my-1" />
            {leagueLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href.includes("/admin") && pathname.startsWith(link.href));
              const isAdmin = link.href.includes("/admin");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block px-4 py-3 rounded text-sm font-display font-semibold uppercase tracking-wider transition-all ${
                    isActive
                      ? isAdmin
                        ? "bg-board-yellow/20 text-board-yellow"
                        : "bg-white/15 text-board-yellow"
                      : isAdmin
                      ? "text-board-yellow/70 hover:text-board-yellow"
                      : "text-white/80 hover:text-board-yellow hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
