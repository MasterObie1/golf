import Link from "next/link";
import { Logo } from "./Logo";

/** Theme-invariant brand footer (always dark, per the marketing canvas). */
export function SiteFooter() {
  return (
    <footer className="dark bg-rough text-white py-12">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <Link href="/" className="flex items-center gap-3">
            <Logo variant="contour" size="sm" />
            <span className="text-xl font-display font-bold text-board-yellow uppercase tracking-wider">
              LeagueLinks
            </span>
          </Link>

          <div className="flex gap-8 text-white/70 text-sm font-sans">
            <Link
              href="/leagues"
              className="hover:text-board-yellow transition-colors"
            >
              Find a League
            </Link>
            <Link
              href="/leagues/new"
              className="hover:text-board-yellow transition-colors"
            >
              Create a League
            </Link>
          </div>

          <div className="text-sm text-white/60 font-sans">
            &copy; {new Date().getFullYear()} LeagueLinks Golf. All rights
            reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
