"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function Navigation() {
  const pathname = usePathname();
  const [leaguesOpen, setLeaguesOpen] = useState(false);

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
      <nav className="bg-green-primary shadow-md">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            {/* Logo/Brand */}
            <Link
              href="/"
              className="flex items-center h-full"
            >
              <Image
                src="/images/logo.png"
                alt="LeagueLinks"
                width={240}
                height={80}
                className="h-full w-auto"
                priority
              />
            </Link>

            {/* Navigation Links */}
            <div className="flex items-center gap-1">
              <Link
                href="/"
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  pathname === "/"
                    ? "bg-white/20 text-white"
                    : "text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                Home
              </Link>

              {/* Leagues Dropdown */}
              <div
                className="relative"
                onMouseEnter={() => setLeaguesOpen(true)}
                onMouseLeave={() => setLeaguesOpen(false)}
              >
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1 ${
                    pathname.startsWith("/leagues")
                      ? "bg-white/20 text-white"
                      : "text-white/90 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  Leagues
                  <svg
                    className={`w-4 h-4 transition-transform ${leaguesOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {leaguesOpen && (
                  <div className="absolute top-full left-0 pt-2 z-50">
                    <div className="w-52 bg-bg-white rounded-lg shadow-lg py-2 border border-border">
                      <Link
                        href="/leagues"
                        className="flex items-center gap-3 px-4 py-2.5 text-text-primary hover:bg-bg-primary transition-colors"
                      >
                        <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="font-medium">Find a League</span>
                      </Link>
                      <Link
                        href="/leagues/new"
                        className="flex items-center gap-3 px-4 py-2.5 text-text-primary hover:bg-bg-primary transition-colors"
                      >
                        <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="font-medium">Create a League</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // League-specific navigation
  const leagueLinks = [
    { href: `/league/${leagueSlug}`, label: "Home", icon: null },
    { href: `/league/${leagueSlug}/leaderboard`, label: "Leaderboard", icon: null },
    { href: `/league/${leagueSlug}/history`, label: "History", icon: null },
    { href: `/league/${leagueSlug}/signup`, label: "Sign Up", icon: null },
    { href: `/league/${leagueSlug}/admin`, label: "Admin", icon: null },
  ];

  return (
    <nav className="bg-green-primary shadow-md">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo/Brand with link back to leagues */}
          <div className="flex items-center gap-4">
            <Link
              href="/leagues"
              className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              All Leagues
            </Link>
            <div className="w-px h-10 bg-white/30" />
            <Link
              href={`/league/${leagueSlug}`}
              className="flex items-center h-full"
            >
              <Image
                src="/images/logo.png"
                alt="LeagueLinks"
                width={240}
                height={80}
                className="h-full w-auto"
              />
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {leagueLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href.includes("/admin") && pathname.startsWith(link.href));
              const isAdmin = link.href.includes("/admin");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? isAdmin
                        ? "bg-gold-primary text-green-primary"
                        : "bg-white/20 text-white"
                      : isAdmin
                      ? "bg-gold-primary/80 text-green-primary hover:bg-gold-primary"
                      : "text-white/90 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
