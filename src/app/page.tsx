import Link from "next/link";
import { prisma } from "@/lib/db";
import { GolfNews } from "@/components/GolfNews";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [leagueCount, teamCount, matchupCount] = await Promise.all([
      prisma.league.count({ where: { status: "active" } }),
      prisma.team.count({ where: { status: "approved" } }),
      prisma.matchup.count(),
    ]);
    return { leagueCount, teamCount, matchupCount };
  } catch (error) {
    console.error("Error fetching stats:", error);
    return { leagueCount: 0, teamCount: 0, matchupCount: 0 };
  }
}

async function getFeaturedLeagues() {
  try {
    const leagues = await prisma.league.findMany({
      where: { status: "active" },
      include: {
        _count: {
          select: { teams: true, matchups: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return leagues;
  } catch (error) {
    console.error("Error fetching featured leagues:", error);
    return [];
  }
}

// Golf Flag SVG Component
function GolfFlag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M32 0V128" stroke="currentColor" strokeWidth="3" />
      <path d="M32 4L58 20L32 36V4Z" fill="#FDB913" stroke="#E5A811" strokeWidth="1" />
      <ellipse cx="32" cy="124" rx="16" ry="4" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// Scorecard Cell Component
function ScorecardCell({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className={`text-center p-4 border-r border-[var(--green-dark)] last:border-r-0 ${
      highlight ? "bg-[var(--gold-primary)]/20" : ""
    }`}>
      <div className="text-xs uppercase tracking-wider text-white/60 mb-1">{label}</div>
      <div className={`text-2xl md:text-3xl font-bold ${
        highlight ? "text-[var(--gold-primary)]" : "text-white"
      }`} style={{ fontFamily: "var(--font-playfair)" }}>
        {value}
      </div>
    </div>
  );
}

export default async function Home() {
  const stats = await getStats();
  const featuredLeagues = await getFeaturedLeagues();

  return (
    <div className="min-h-screen bg-[#F8FAF9]">
      {/* Hero Section - Clubhouse Style */}
      <section className="relative bg-[var(--green-primary)] overflow-hidden">
        {/* Grass texture pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Course horizon line */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--green-dark)] to-transparent" />

        {/* Decorative flags */}
        <div className="absolute top-20 right-[10%] hidden lg:block">
          <GolfFlag className="w-8 h-16 text-white/20" />
        </div>
        <div className="absolute top-32 right-[25%] hidden lg:block">
          <GolfFlag className="w-6 h-12 text-white/10" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-16 md:py-24">
          {/* Clubhouse Crest/Badge */}
          <div className="flex justify-center mb-8">
            <Logo variant="badge" size="lg" />
          </div>

          {/* Main Title - Classic Style */}
          <div className="text-center mb-12">
            <p className="text-[var(--gold-primary)] uppercase tracking-[0.3em] text-sm mb-4">
              Est. 2026
            </p>
            <h1
              className="text-4xl md:text-6xl lg:text-7xl text-white mb-4"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              LeagueLinks
            </h1>
            <div className="w-32 h-1 bg-[var(--gold-primary)] mx-auto mb-6" />
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto">
              Where tradition meets technology. The modern way to manage your golf league.
            </p>
          </div>

          {/* Scorecard-Style Stats */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-[var(--green-dark)] rounded-lg overflow-hidden shadow-2xl border border-[var(--green-light)]/30">
              {/* Scorecard Header */}
              <div className="bg-[var(--green-dark)] border-b border-[var(--green-light)]/30 px-4 py-2">
                <div className="text-center text-xs uppercase tracking-wider text-white/50">
                  Season Statistics
                </div>
              </div>
              {/* Scorecard Row */}
              <div className="grid grid-cols-3 bg-[var(--green-primary)]">
                <ScorecardCell label="Leagues" value={stats.leagueCount} />
                <ScorecardCell label="Teams" value={stats.teamCount} highlight />
                <ScorecardCell label="Rounds" value={stats.matchupCount} />
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/leagues/new"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--gold-primary)] text-[var(--green-dark)] font-semibold rounded-sm hover:bg-[var(--gold-light)] transition-colors shadow-lg text-lg"
            >
              Create Your League
            </Link>
            <Link
              href="/leagues"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-transparent text-white font-semibold rounded-sm hover:bg-white/10 transition-colors border-2 border-white/30 text-lg"
            >
              Find a League
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Leagues - Tournament Leaderboard Style */}
      {featuredLeagues.length > 0 && (
        <section className="py-16 md:py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4">
            {/* Section Header */}
            <div className="text-center mb-10">
              <p className="text-[var(--gold-dark)] uppercase tracking-[0.2em] text-sm mb-2">
                Now Playing
              </p>
              <h2
                className="text-3xl md:text-4xl text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Active Leagues
              </h2>
            </div>

            {/* Tournament Leaderboard */}
            <div className="bg-[var(--green-primary)] rounded-t-lg overflow-hidden shadow-xl">
              {/* Leaderboard Header */}
              <div className="bg-[var(--green-dark)] px-6 py-3 flex items-center justify-between">
                <span className="text-[var(--gold-primary)] uppercase tracking-wider text-xs font-semibold">
                  League
                </span>
                <div className="flex gap-8 text-[var(--gold-primary)] uppercase tracking-wider text-xs font-semibold">
                  <span className="w-16 text-center">Teams</span>
                  <span className="w-16 text-center">Rounds</span>
                  <span className="w-20 text-center">Status</span>
                </div>
              </div>

              {/* Leaderboard Rows */}
              <div className="divide-y divide-[var(--green-dark)]/50">
                {featuredLeagues.map((league, index) => (
                  <Link
                    key={league.id}
                    href={`/league/${league.slug}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-[var(--green-dark)]/30 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      {/* Position Number */}
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0
                          ? "bg-[var(--gold-primary)] text-[var(--green-dark)]"
                          : "bg-white/10 text-white"
                      }`}>
                        {index + 1}
                      </span>
                      {/* League Name */}
                      <div>
                        <div className="text-white font-medium group-hover:text-[var(--gold-primary)] transition-colors">
                          {league.name}
                        </div>
                        {league.courseName && (
                          <div className="text-white/50 text-sm">{league.courseName}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <span className="w-16 text-center text-white font-semibold">
                        {league._count.teams}
                      </span>
                      <span className="w-16 text-center text-white font-semibold">
                        {league._count.matchups}
                      </span>
                      <span className={`w-20 text-center text-xs font-medium px-2 py-1 rounded ${
                        league.registrationOpen
                          ? "bg-[var(--gold-primary)]/20 text-[var(--gold-primary)]"
                          : "bg-white/10 text-white/70"
                      }`}>
                        {league.registrationOpen ? "Open" : "In Season"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* View All Link */}
            <div className="bg-[var(--green-dark)] rounded-b-lg px-6 py-3">
              <Link
                href="/leagues"
                className="flex items-center justify-center gap-2 text-[var(--gold-primary)] hover:text-[var(--gold-light)] transition-colors text-sm font-medium"
              >
                View All Leagues
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Features - Scorecard Style */}
      <section className="py-16 md:py-20 bg-[#F8FAF9]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[var(--gold-dark)] uppercase tracking-[0.2em] text-sm mb-2">
              The Essentials
            </p>
            <h2
              className="text-3xl md:text-4xl text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Everything for Your League
            </h2>
          </div>

          {/* Feature Cards - Golf Tee Markers Style */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--border-color)] hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-red-500" />
              <div className="pl-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Auto Handicaps
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Handicaps calculate automatically based on your league&apos;s custom formula. Scores in, handicaps out.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--border-color)] hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-white border-l-2 border-[var(--border-color)]" />
              <div className="pl-4">
                <div className="w-10 h-10 rounded-full bg-[var(--green-primary)]/10 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-[var(--green-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Live Standings
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Real-time leaderboards update instantly. See who&apos;s leading, who&apos;s climbing, and who needs to buy drinks.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--border-color)] hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-[var(--gold-primary)]" />
              <div className="pl-4">
                <div className="w-10 h-10 rounded-full bg-[var(--gold-primary)]/10 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-[var(--gold-dark)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Full History
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Every round recorded. Track handicap trends, head-to-head records, and season-long performance.
                </p>
              </div>
            </div>
          </div>

          {/* Additional Features Row */}
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--border-color)] flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-[var(--text-primary)] mb-1">Online Registration</h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Share your league link. Teams sign up online — approve with one click.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-[var(--border-color)] flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-[var(--text-primary)] mb-1">Mobile Ready</h3>
                <p className="text-[var(--text-secondary)] text-sm">
                  Check standings and enter scores from the clubhouse, the course, or the 19th hole.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Hole by Hole */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[var(--gold-dark)] uppercase tracking-[0.2em] text-sm mb-2">
              The Course
            </p>
            <h2
              className="text-3xl md:text-4xl text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Three Simple Holes
            </h2>
          </div>

          <div className="relative">
            {/* Connecting Line */}
            <div className="absolute top-12 left-1/2 w-px h-[calc(100%-6rem)] bg-[var(--border-color)] hidden md:block" />

            <div className="space-y-12">
              {/* Hole 1 */}
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">
                <div className="flex-1 text-center md:text-right order-2 md:order-1">
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Create Your League</h3>
                  <p className="text-[var(--text-secondary)]">
                    Name it, set your handicap formula, and you&apos;re on the tee. Takes about 60 seconds.
                  </p>
                </div>
                <div className="relative order-1 md:order-2">
                  <div className="w-16 h-16 rounded-full bg-[var(--green-primary)] flex items-center justify-center text-white text-2xl font-bold shadow-lg" style={{ fontFamily: "var(--font-playfair)" }}>
                    1
                  </div>
                  <GolfFlag className="absolute -top-2 -right-2 w-4 h-8 text-[var(--green-dark)]" />
                </div>
                <div className="flex-1 order-3 hidden md:block" />
              </div>

              {/* Hole 2 */}
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">
                <div className="flex-1 hidden md:block" />
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-[var(--green-primary)] flex items-center justify-center text-white text-2xl font-bold shadow-lg" style={{ fontFamily: "var(--font-playfair)" }}>
                    2
                  </div>
                  <GolfFlag className="absolute -top-2 -right-2 w-4 h-8 text-[var(--green-dark)]" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Add Your Teams</h3>
                  <p className="text-[var(--text-secondary)]">
                    Share the signup link or add teams manually. Approve who&apos;s in your foursome.
                  </p>
                </div>
              </div>

              {/* Hole 3 */}
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">
                <div className="flex-1 text-center md:text-right order-2 md:order-1">
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Play & Track</h3>
                  <p className="text-[var(--text-secondary)]">
                    Enter scores each week. We handle the math. You enjoy the competition.
                  </p>
                </div>
                <div className="relative order-1 md:order-2">
                  <div className="w-16 h-16 rounded-full bg-[var(--gold-primary)] flex items-center justify-center text-[var(--green-dark)] text-2xl font-bold shadow-lg" style={{ fontFamily: "var(--font-playfair)" }}>
                    3
                  </div>
                  <GolfFlag className="absolute -top-2 -right-2 w-4 h-8 text-[var(--gold-dark)]" />
                </div>
                <div className="flex-1 order-3 hidden md:block" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Golf News & CTA */}
      <section className="py-16 md:py-20 bg-[#F8FAF9]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12">
            {/* News */}
            <div>
              <p className="text-[var(--gold-dark)] uppercase tracking-[0.2em] text-sm mb-2">
                From the Tour
              </p>
              <h2
                className="text-2xl md:text-3xl text-[var(--text-primary)] mb-6"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Golf News
              </h2>
              <GolfNews />
            </div>

            {/* CTA Card */}
            <div className="flex items-center">
              <div className="bg-[var(--green-primary)] rounded-lg p-8 w-full relative overflow-hidden">
                {/* Subtle pattern */}
                <div
                  className="absolute inset-0 opacity-5"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='2' fill='%23ffffff'/%3E%3C/svg%3E")`,
                  }}
                />

                <div className="relative">
                  <h3
                    className="text-2xl text-white mb-4"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    Ready to Tee Off?
                  </h3>
                  <p className="text-white/80 mb-6">
                    Join the growing community of leagues that have traded spreadsheets for something better.
                  </p>
                  <Link
                    href="/leagues/new"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--gold-primary)] text-[var(--green-dark)] font-semibold rounded-sm hover:bg-[var(--gold-light)] transition-colors"
                  >
                    Start Your League
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer - Clubhouse Style */}
      <footer className="bg-[var(--green-dark)] text-white py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Logo variant="badge" size="sm" />
              <span className="text-xl" style={{ fontFamily: "var(--font-playfair)" }}>
                LeagueLinks
              </span>
            </div>

            {/* Links */}
            <div className="flex gap-8 text-white/70 text-sm">
              <Link href="/leagues" className="hover:text-white transition-colors">
                Find a League
              </Link>
              <Link href="/leagues/new" className="hover:text-white transition-colors">
                Create a League
              </Link>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 text-sm text-white/50">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              All Systems Operational
            </div>
          </div>

          <div className="border-t border-white/10 mt-8 pt-8 text-center text-white/40 text-sm">
            &copy; {new Date().getFullYear()} LeagueLinks Golf. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
