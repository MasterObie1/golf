import Link from "next/link";
import { prisma } from "@/lib/db";
import { GolfNews } from "@/components/GolfNews";
import { Logo } from "@/components/Logo";
import { ContourTerrain } from "@/components/grounds/contours/ContourTerrain";

export const revalidate = 60;

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
      select: {
        id: true,
        name: true,
        slug: true,
        courseName: true,
        registrationOpen: true,
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

export default async function Home() {
  const stats = await getStats();
  const featuredLeagues = await getFeaturedLeagues();

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════════════════════
          THE VISTA — Dawn at the first tee
          Full viewport. Layered terrain silhouette. Atmosphere.
          ═══════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-screen flex flex-col justify-center overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #091a12 0%, #0d2818 40%, #142e1a 65%, #1a3a1a 100%)",
        }}
      >
        {/* Ambient horizon glow — warm amber at the treeline */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 120% 25% at 50% 72%, rgba(255,215,0,0.07) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        {/* Terrain SVG — three hills creating parallax depth */}
        <div className="absolute bottom-0 left-0 right-0 h-[28vh] md:h-[32vh]">
          <svg
            className="w-full h-full"
            viewBox="0 0 1440 400"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Ghost contour lines in the sky — topo map DNA */}
            <path
              d="M0,80 C300,50 600,70 900,40 C1100,20 1300,35 1440,15"
              stroke="rgba(255,215,0,0.03)"
              strokeWidth="0.8"
              fill="none"
            />
            <path
              d="M0,140 C200,110 500,130 800,100 C1000,80 1200,90 1440,70"
              stroke="rgba(255,215,0,0.025)"
              strokeWidth="0.8"
              fill="none"
            />
            <path
              d="M0,200 C250,175 450,190 700,165 C950,145 1150,155 1440,135"
              stroke="rgba(255,215,0,0.02)"
              strokeWidth="0.8"
              fill="none"
            />

            {/* Stars — the pre-dawn sky */}
            <circle cx="180" cy="30" r="1" fill="white" opacity="0.15" />
            <circle cx="420" cy="55" r="0.8" fill="white" opacity="0.1" />
            <circle cx="780" cy="20" r="1.2" fill="white" opacity="0.12" />
            <circle cx="1050" cy="45" r="0.8" fill="white" opacity="0.08" />
            <circle cx="1280" cy="15" r="1" fill="white" opacity="0.1" />
            <circle cx="600" cy="70" r="0.6" fill="white" opacity="0.06" />
            <circle cx="950" cy="8" r="0.7" fill="white" opacity="0.07" />

            {/* Layer 1 — far hills (lightest, most atmosphere) */}
            <path
              d="M0,280 C240,230 480,260 720,210 C960,175 1200,200 1440,185 L1440,400 L0,400 Z"
              fill="#2D5A27"
              opacity="0.2"
            />

            {/* Layer 2 — mid hills */}
            <path
              d="M0,310 C180,265 420,290 660,245 C900,215 1080,250 1440,232 L1440,400 L0,400 Z"
              fill="#1F4A20"
              opacity="0.45"
            />
            {/* Flag pin on the mid ridge — the destination */}
            <line
              x1="740"
              y1="197"
              x2="740"
              y2="233"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
            />
            <path d="M740,199 L758,207 L740,215 Z" fill="#FFD700" opacity="0.9" />

            {/* Layer 3 — near hills (darkest, closest) */}
            <path
              d="M0,350 C120,325 360,342 600,315 C840,295 1080,325 1440,305 L1440,400 L0,400 Z"
              fill="#162e17"
              opacity="0.85"
            />

            {/* Ground plane — anchors the bottom */}
            <rect
              x="0"
              y="385"
              width="1440"
              height="15"
              fill="#0f2210"
              opacity="0.5"
            />
          </svg>
        </div>

        {/* Hero content — floating in the sky above the landscape */}
        <div className="relative max-w-5xl mx-auto px-6 pt-20 md:pt-28 pb-[32vh] md:pb-[36vh] w-full">
          {/* Micro label */}
          <p className="text-board-yellow/70 font-display text-xs uppercase tracking-[0.5em] mb-4">
            Est. 2026
          </p>

          {/* Title — tight leading locks the two words into a single mark */}
          <h1 className="font-display font-bold uppercase leading-[0.88] tracking-tight mb-6">
            <span className="block text-white text-6xl md:text-8xl lg:text-[7rem]">
              League
            </span>
            <span className="block text-board-yellow text-6xl md:text-8xl lg:text-[7rem]">
              Links
            </span>
          </h1>

          {/* Gold rule — editorial punctuation */}
          <div
            className="w-16 h-px bg-board-yellow/30 mb-6"
            aria-hidden="true"
          />

          {/* Tagline */}
          <p className="text-white/75 text-lg md:text-xl max-w-lg font-sans leading-relaxed mb-10">
            The modern way to run your golf league. Handicaps, standings,
            scorecards — all handled.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-14">
            <Link
              href="/leagues/new"
              className="inline-flex items-center justify-center px-8 py-4 bg-board-yellow text-rough font-display font-bold uppercase tracking-wider rounded hover:bg-[#FFE066] text-lg"
              style={{
                transition:
                  "background-color 200ms cubic-bezier(0.22, 0.68, 0.36, 1)",
              }}
            >
              Create Your League
            </Link>
            <Link
              href="/leagues"
              className="inline-flex items-center justify-center px-8 py-4 bg-white/[0.06] text-white/90 font-display font-semibold uppercase tracking-wider rounded hover:bg-white/[0.12] border border-white/[0.1] text-lg"
              style={{
                transition: "all 200ms cubic-bezier(0.22, 0.68, 0.36, 1)",
              }}
            >
              Find a League
            </Link>
          </div>

          {/* Stats — clean monospace figures, ambient context */}
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl md:text-2xl font-bold text-board-yellow tabular-nums">
                {stats.leagueCount}
              </span>
              <span className="font-display uppercase tracking-wider text-white/60 text-xs">
                Leagues
              </span>
            </div>
            <div className="w-px h-4 bg-white/15" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl md:text-2xl font-bold text-board-yellow tabular-nums">
                {stats.teamCount}
              </span>
              <span className="font-display uppercase tracking-wider text-white/60 text-xs">
                Teams
              </span>
            </div>
            <div className="w-px h-4 bg-white/15" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl md:text-2xl font-bold text-board-yellow tabular-nums">
                {stats.matchupCount}
              </span>
              <span className="font-display uppercase tracking-wider text-white/60 text-xs">
                Rounds
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          THE BOARD — Active leagues tournament scoreboard
          ═══════════════════════════════════════════════════════ */}
      {featuredLeagues.length > 0 && (
        <section className="relative py-16 md:py-24 bg-board-green overflow-hidden">
          <div
            className="absolute inset-0 text-white opacity-[0.03]"
            aria-hidden="true"
          >
            <ContourTerrain className="w-full h-full" />
          </div>

          <div className="relative max-w-4xl mx-auto px-4">
            <div className="text-center mb-10">
              <p className="text-board-yellow/80 font-display text-xs uppercase tracking-[0.3em] mb-3">
                Now Playing
              </p>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-board-yellow uppercase tracking-wider">
                Active Leagues
              </h2>
            </div>

            {/* Tournament Board */}
            <div className="rounded-lg overflow-hidden shadow-board border-2 border-board-green-dark">
              {/* Board header */}
              <div className="bg-board-green-dark px-6 py-3 flex items-center justify-between">
                <span className="font-display text-board-yellow uppercase tracking-wider text-xs font-semibold">
                  League
                </span>
                <div className="flex gap-8 font-display text-board-yellow uppercase tracking-wider text-xs font-semibold">
                  <span className="w-16 text-center hidden sm:block">
                    Teams
                  </span>
                  <span className="w-16 text-center hidden sm:block">
                    Rounds
                  </span>
                  <span className="w-20 text-center">Status</span>
                </div>
              </div>

              {/* Board rows */}
              <div className="divide-y divide-board-green-dark/30">
                {featuredLeagues.map((league, index) => (
                  <Link
                    key={league.id}
                    href={`/league/${league.slug}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-board-green-dark/20 group"
                    style={{
                      transition:
                        "background-color 200ms cubic-bezier(0.22, 0.68, 0.36, 1)",
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold ${
                          index === 0
                            ? "bg-board-yellow text-rough"
                            : "bg-white/10 text-white/80"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <div className="text-white font-sans font-medium group-hover:text-board-yellow transition-colors">
                          {league.name}
                        </div>
                        {league.courseName && (
                          <div className="text-white/65 text-sm font-sans">
                            {league.courseName}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <span className="w-16 text-center text-white font-mono font-semibold tabular-nums hidden sm:block">
                        {league._count.teams}
                      </span>
                      <span className="w-16 text-center text-white font-mono font-semibold tabular-nums hidden sm:block">
                        {league._count.matchups}
                      </span>
                      <span
                        className={`w-20 text-center text-xs font-display font-semibold uppercase px-2 py-1 rounded ${
                          league.registrationOpen
                            ? "bg-board-yellow/20 text-board-yellow"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        {league.registrationOpen ? "Open" : "In Season"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* View all */}
              <div className="bg-board-green-dark px-6 py-3">
                <Link
                  href="/leagues"
                  className="flex items-center justify-center gap-2 text-board-yellow/90 hover:text-board-yellow transition-colors text-sm font-display uppercase tracking-wider"
                >
                  View All Leagues
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          THE ROUND — Three features as hole markers
          Par values map to feature complexity. Golfers will smile.
          ═══════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-24 bg-scorecard-paper relative">
        {/* Ruled lines — scorecard paper texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(var(--scorecard-line) 1px, transparent 1px)",
            backgroundSize: "100% 2.5rem",
            opacity: 0.15,
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-wood font-display text-xs uppercase tracking-[0.3em] mb-3">
              The Essentials
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-scorecard-pencil uppercase tracking-wider">
              Everything for Your League
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {[
              {
                hole: 1,
                par: 3,
                name: "Auto Handicaps",
                desc: "Your custom formula, applied automatically after every round. No spreadsheets, no math, no arguments at the bar.",
                borderColor: "border-t-fairway",
                badgeColor: "bg-fairway",
              },
              {
                hole: 2,
                par: 4,
                name: "Live Standings",
                desc: "Real-time leaderboards that update the moment scores are entered. Stroke play, match play, or hybrid — your call.",
                borderColor: "border-t-board-yellow",
                badgeColor: "bg-board-yellow",
              },
              {
                hole: 3,
                par: 5,
                name: "Scorecards & History",
                desc: "Hole-by-hole scoring with shareable links. Every round recorded. Track trends across entire seasons.",
                borderColor: "border-t-water",
                badgeColor: "bg-water",
              },
            ].map((feature) => (
              <div
                key={feature.hole}
                className={`bg-surface-white rounded-lg border border-scorecard-line/40 border-t-2 ${feature.borderColor} p-6 hover:shadow-md`}
                style={{
                  transition:
                    "box-shadow 200ms cubic-bezier(0.22, 0.68, 0.36, 1)",
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-9 h-9 rounded-full ${feature.badgeColor} text-white flex items-center justify-center font-display font-bold text-sm`}
                  >
                    {feature.hole}
                  </div>
                  <span className="font-mono text-xs text-text-muted tabular-nums">
                    Par {feature.par}
                  </span>
                </div>
                <h3 className="font-display font-bold text-scorecard-pencil uppercase tracking-wider text-base mb-2">
                  {feature.name}
                </h3>
                <p className="text-text-secondary text-sm font-sans leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          THE CLUBHOUSE — News + final CTA
          Wood grain warmth. The 19th hole.
          ═══════════════════════════════════════════════════════ */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 wood-grain" />

        <div className="relative max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12">
            {/* News bulletin */}
            <div>
              <p className="text-board-yellow font-display text-xs uppercase tracking-[0.3em] mb-3">
                From the Tour
              </p>
              <h2 className="text-2xl md:text-3xl font-display font-bold text-board-yellow uppercase tracking-wider mb-6">
                Clubhouse Bulletin
              </h2>
              <GolfNews />
            </div>

            {/* CTA card */}
            <div className="flex items-center">
              <div className="bg-rough rounded-lg p-8 w-full relative overflow-hidden border border-fairway/20">
                <div
                  className="absolute inset-0 text-fairway opacity-[0.05]"
                  aria-hidden="true"
                >
                  <ContourTerrain className="w-full h-full" />
                </div>

                <div className="relative">
                  <h3 className="text-2xl font-display font-bold text-board-yellow uppercase tracking-wider mb-4">
                    Ready to Tee Off?
                  </h3>
                  <p className="text-white/80 mb-6 font-sans leading-relaxed">
                    Join the growing community of leagues that have traded
                    spreadsheets for something better.
                  </p>
                  <Link
                    href="/leagues/new"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-board-yellow text-rough font-display font-bold uppercase tracking-wider rounded hover:bg-[#FFE066]"
                    style={{
                      transition:
                        "background-color 200ms cubic-bezier(0.22, 0.68, 0.36, 1)",
                    }}
                  >
                    Start Your League
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════ */}
      <footer className="bg-rough text-white py-12">
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
              &copy; {new Date().getFullYear()} LeagueLinks
            </div>
          </div>

          <div className="border-t border-white/10 mt-8 pt-8 text-center text-white/60 text-sm font-sans">
            &copy; {new Date().getFullYear()} LeagueLinks Golf. All rights
            reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
