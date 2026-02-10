import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeaguePublicInfo } from "@/lib/actions/leagues";
import {
  getLeaderboardWithMovement,
  type LeaderboardWithMovement,
} from "@/lib/actions/standings";
import { getSchedule, type ScheduleWeek } from "@/lib/actions/schedule";
import { getMatchupHistory } from "@/lib/actions/matchups";
import {
  getWeeklyScoreHistory,
  type WeeklyScoreRecord,
} from "@/lib/actions/weekly-scores";
import { isLeagueAdmin } from "@/lib/auth";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeaguePublicInfo(slug);
  if (!league) {
    return { title: "League" };
  }
  return {
    title: league.name,
    description: league.description || `${league.name} golf league on LeagueLinks`,
  };
}

/* ── Inline SVG Icons ─────────────────────────────────────── */

function IconTrophy({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function IconClipboard({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

function IconCalendar({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconPen({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function IconGear({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconScorecard({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

function IconClock({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconUsers({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconMail({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IconPhone({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function IconAward({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

function IconArrowLeft({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ── Page Component ───────────────────────────────────────── */

export default async function LeagueHomePage({ params }: Props) {
  const { slug } = await params;

  const league = await getLeaguePublicInfo(slug);
  if (!league) {
    notFound();
  }

  // Parallel data fetching
  const [isAdmin, leaders, schedule, matchupHistory, weeklyScores] = await Promise.all([
    isLeagueAdmin(slug),
    getLeaderboardWithMovement(league.id).catch(() => [] as LeaderboardWithMovement[]),
    getSchedule(league.id).catch(() => [] as ScheduleWeek[]),
    league.scoringType !== "stroke_play"
      ? getMatchupHistory(league.id).then(r => r.matchups).catch(() => [])
      : Promise.resolve([]),
    league.scoringType === "stroke_play"
      ? getWeeklyScoreHistory(league.id).catch(() => [] as WeeklyScoreRecord[])
      : Promise.resolve([] as WeeklyScoreRecord[]),
  ]);

  const currentSeason = (league as { seasons?: { name: string }[] }).seasons?.[0];

  // Derive snapshots
  const topLeaders = leaders.slice(0, 5);

  // Find next upcoming week (first week with all "scheduled" matches)
  const upcomingWeek = schedule.find((w) =>
    w.matches.every((m) => m.status === "scheduled")
  );

  // Find most recent completed week (last week where at least one match is completed)
  const recentWeek = [...schedule].reverse().find((w) =>
    w.matches.some((m) => m.status === "completed")
  );

  // For match play: get the most recent week's matchups
  const recentMatchups = matchupHistory.length > 0
    ? (() => {
        const latestWeek = matchupHistory[0].weekNumber;
        return matchupHistory.filter((m) => m.weekNumber === latestWeek);
      })()
    : [];

  // For stroke play: get the most recent week's scores
  const recentScores = weeklyScores.length > 0
    ? (() => {
        const latestWeek = weeklyScores[0].weekNumber;
        return weeklyScores.filter((s) => s.weekNumber === latestWeek).slice(0, 5);
      })()
    : [];

  const isStrokePlay = league.scoringType === "stroke_play";

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-scorecard-paper relative">
      {/* Ruled-line texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(var(--scorecard-line) 1px, transparent 1px)",
          backgroundSize: "100% 2rem",
          opacity: 0.08,
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-4xl mx-auto px-4 py-10 md:py-14">

        {/* ── Masthead ──────────────────────────────────── */}
        <header className="mb-8 pb-8 border-b-2 border-fairway/20">
          {/* Season badge */}
          {currentSeason && (
            <div className="mb-4">
              <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-display uppercase tracking-[0.15em] border ${
                league.registrationOpen
                  ? "bg-success-bg text-fairway border-success-border registration-pulse"
                  : "bg-surface text-text-muted border-border-light"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${league.registrationOpen ? "bg-fairway" : "bg-text-light"}`} aria-hidden="true" />
                {currentSeason.name}
              </span>
            </div>
          )}

          {/* League name */}
          <h1 className="text-4xl md:text-5xl font-display font-bold uppercase tracking-wider text-scorecard-pencil mb-2">
            {league.name}
          </h1>

          {/* Course + location */}
          {league.courseName && (
            <p className="text-base text-text-secondary font-sans">
              {league.courseName}
              {league.courseLocation && (
                <span className="text-text-muted"> &mdash; {league.courseLocation}</span>
              )}
            </p>
          )}

          {/* Quick stats */}
          <div className="flex items-center gap-3 mt-4 flex-wrap text-sm font-sans text-text-muted">
            <span>
              <span className="font-mono text-scorecard-pencil tabular-nums">{league._count.teams}</span>
              <span className="text-text-light"> / </span>
              <span className="font-mono tabular-nums">{league.maxTeams}</span> teams
            </span>
            {league.playDay && (
              <>
                <span className="text-scorecard-line">&middot;</span>
                <span>{league.playDay}s{league.playTime ? ` at ${league.playTime}` : ""}</span>
              </>
            )}
            {league.registrationOpen && (
              <>
                <span className="text-scorecard-line">&middot;</span>
                <span className="text-fairway font-medium">Registration Open</span>
              </>
            )}
          </div>
        </header>

        {/* ── Navigation ────────────────────────────────── */}
        <nav className="mb-10">
          <p className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-3">
            Quick Links
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              {
                href: `/league/${slug}/leaderboard`,
                label: "Leaderboard",
                icon: <IconTrophy />,
                accent: "border-l-board-yellow",
              },
              {
                href: `/league/${slug}/history`,
                label: isStrokePlay ? "Score History" : "Match History",
                icon: <IconClipboard />,
                accent: "border-l-fairway",
              },
              ...(!isStrokePlay
                ? [{
                    href: `/league/${slug}/schedule`,
                    label: "Schedule",
                    icon: <IconCalendar />,
                    accent: "border-l-water",
                  }]
                : []),
              ...(league.scorecardMode !== "disabled"
                ? [{
                    href: `/league/${slug}/scorecards`,
                    label: "Scorecards",
                    icon: <IconScorecard />,
                    accent: "border-l-putting",
                  }]
                : []),
              {
                href: `/league/${slug}/signup`,
                label: "Team Signup",
                icon: <IconPen />,
                accent: "border-l-wood",
              },
              ...(isAdmin
                ? [{
                    href: `/league/${slug}/admin`,
                    label: "Admin",
                    icon: <IconGear />,
                    accent: "border-l-board-yellow",
                  }]
                : []),
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded border border-scorecard-line/50 border-l-2 ${link.accent} bg-surface-white hover:bg-surface-warm group`}
                style={{ transition: "background-color 200ms cubic-bezier(0.22, 0.68, 0.36, 1)" }}
              >
                <span className="text-text-muted group-hover:text-fairway" style={{ transition: "color 200ms" }}>
                  {link.icon}
                </span>
                <span className="font-display uppercase tracking-wider text-xs text-scorecard-pencil">
                  {link.label}
                </span>
              </Link>
            ))}
          </div>
        </nav>

        {/* ── League Snapshot ───────────────────────────── */}
        {(topLeaders.length > 0 || upcomingWeek || recentWeek || recentMatchups.length > 0 || recentScores.length > 0) && (
          <div className="mb-10">
            <p className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-4">
              League Snapshot
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Leaders */}
              {topLeaders.length > 0 && (
                <div className="bg-scorecard-paper rounded-lg overflow-hidden shadow-md border border-scorecard-line/50">
                  <div className="px-4 py-2.5 bg-rough flex items-center justify-between">
                    <span className="text-white font-display text-xs uppercase tracking-wider font-semibold">
                      Standings
                    </span>
                    <Link
                      href={`/league/${slug}/leaderboard`}
                      className="text-white/70 hover:text-white text-xs font-display uppercase tracking-wider flex items-center gap-1 transition-colors"
                    >
                      Full <IconChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="divide-y divide-scorecard-line/30">
                    {topLeaders.map((team, i) => (
                      <div key={team.id} className={`px-4 py-2 flex items-center gap-3 ${i % 2 === 0 ? "bg-scorecard-paper" : "bg-bunker/10"}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-display font-bold ${
                          i === 0
                            ? "bg-board-yellow text-rough"
                            : i === 1
                            ? "bg-[#C0C0C0] text-[#333]"
                            : i === 2
                            ? "bg-[#CD7F32] text-white"
                            : "text-text-muted"
                        }`}>
                          {i + 1}
                        </span>
                        <Link
                          href={`/league/${slug}/team/${team.id}`}
                          className="flex-1 text-fairway hover:text-rough text-sm font-sans font-medium truncate transition-colors"
                        >
                          {team.name}
                        </Link>
                        <span className="font-mono text-fairway text-sm tabular-nums font-bold">
                          {team.totalPoints}
                        </span>
                        {!isStrokePlay && (
                          <span className="text-text-muted text-xs font-mono tabular-nums w-16 text-right">
                            {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                          </span>
                        )}
                        {team.rankChange !== null && team.rankChange !== 0 && (
                          <span className={`text-xs font-mono ${team.rankChange > 0 ? "text-fairway" : "text-board-red"}`}>
                            {team.rankChange > 0 ? `+${team.rankChange}` : team.rankChange}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Right column: Upcoming + Recent */}
              <div className="space-y-4">
                {/* Upcoming Schedule */}
                {upcomingWeek && (
                  <div className="bg-surface-white rounded-lg border border-scorecard-line overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-scorecard-line flex items-center justify-between">
                      <span className="text-scorecard-pencil font-display text-xs uppercase tracking-wider font-semibold">
                        Up Next &mdash; Week {upcomingWeek.weekNumber}
                      </span>
                      {!isStrokePlay && (
                        <Link
                          href={`/league/${slug}/schedule`}
                          className="text-fairway/70 hover:text-fairway text-xs font-display uppercase tracking-wider flex items-center gap-1 transition-colors"
                        >
                          Full <IconChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                    <div className="divide-y divide-scorecard-line/50">
                      {upcomingWeek.matches.map((match) => (
                        <div key={match.id} className="px-4 py-2 flex items-center text-sm font-sans">
                          <span className="flex-1 text-scorecard-pencil">{match.teamA.name}</span>
                          <span className="text-text-light text-xs mx-2">vs</span>
                          <span className="flex-1 text-scorecard-pencil text-right">
                            {match.teamB?.name ?? "BYE"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Results — Match Play */}
                {!isStrokePlay && recentMatchups.length > 0 && (
                  <div className="bg-surface-white rounded-lg border border-scorecard-line overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-scorecard-line flex items-center justify-between">
                      <span className="text-scorecard-pencil font-display text-xs uppercase tracking-wider font-semibold">
                        Last Results &mdash; Week {recentMatchups[0].weekNumber}
                      </span>
                      <Link
                        href={`/league/${slug}/history`}
                        className="text-fairway/70 hover:text-fairway text-xs font-display uppercase tracking-wider flex items-center gap-1 transition-colors"
                      >
                        All <IconChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                    <div className="divide-y divide-scorecard-line/50">
                      {recentMatchups.map((m) => {
                        const aWon = m.teamAPoints > m.teamBPoints;
                        const bWon = m.teamBPoints > m.teamAPoints;
                        return (
                          <div key={m.id} className="px-4 py-2 flex items-center text-sm font-sans">
                            <span className={`flex-1 ${aWon ? "text-scorecard-pencil font-medium" : "text-text-muted"}`}>
                              {m.teamA.name}
                            </span>
                            <span className="font-mono tabular-nums text-xs mx-2 text-scorecard-pencil">
                              {m.teamAPoints} &ndash; {m.teamBPoints}
                            </span>
                            <span className={`flex-1 text-right ${bWon ? "text-scorecard-pencil font-medium" : "text-text-muted"}`}>
                              {m.teamB.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Results — Stroke Play */}
                {isStrokePlay && recentScores.length > 0 && (
                  <div className="bg-surface-white rounded-lg border border-scorecard-line overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-scorecard-line flex items-center justify-between">
                      <span className="text-scorecard-pencil font-display text-xs uppercase tracking-wider font-semibold">
                        Last Round &mdash; Week {recentScores[0].weekNumber}
                      </span>
                      <Link
                        href={`/league/${slug}/history`}
                        className="text-fairway/70 hover:text-fairway text-xs font-display uppercase tracking-wider flex items-center gap-1 transition-colors"
                      >
                        All <IconChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                    <div className="divide-y divide-scorecard-line/50">
                      {recentScores.map((s) => (
                        <div key={s.id} className="px-4 py-2 flex items-center text-sm font-sans">
                          <span className="w-5 text-text-light text-xs font-mono">{s.position}.</span>
                          <span className="flex-1 text-scorecard-pencil">{s.team.name}</span>
                          <span className="font-mono tabular-nums text-xs text-text-muted mr-3">
                            {s.grossScore} gross
                          </span>
                          <span className="font-mono tabular-nums text-sm text-scorecard-pencil font-medium">
                            {s.netScore} net
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback if no schedule or results yet */}
                {!upcomingWeek && recentMatchups.length === 0 && recentScores.length === 0 && (
                  <div className="bg-surface-white rounded-lg border border-scorecard-line p-6 text-center">
                    <p className="text-text-muted text-sm font-sans">
                      No schedule or results yet this season.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Divider ───────────────────────────────────── */}
        <div className="border-t border-scorecard-line mb-10" aria-hidden="true" />

        {/* ── About ─────────────────────────────────────── */}
        {league.description && (
          <section className="mb-8">
            <h2 className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-3">
              About
            </h2>
            <p className="text-text-secondary font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {league.description}
            </p>
          </section>
        )}

        {/* ── Schedule & Details ─────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {(league.playDay || league.playTime || league.startDate || league.endDate || league.numberOfWeeks) && (
            <section>
              <h2 className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-3 flex items-center gap-1.5">
                <IconClock className="w-3.5 h-3.5" />
                Schedule
              </h2>
              <div className="space-y-1.5 text-sm font-sans">
                {league.playDay && (
                  <p>
                    <span className="text-text-muted">Plays:</span>{" "}
                    <span className="text-scorecard-pencil">{league.playDay}s</span>
                  </p>
                )}
                {league.playTime && (
                  <p>
                    <span className="text-text-muted">Time:</span>{" "}
                    <span className="text-scorecard-pencil">{league.playTime}</span>
                  </p>
                )}
                {league.startDate && (
                  <p>
                    <span className="text-text-muted">Starts:</span>{" "}
                    <span className="text-scorecard-pencil">{formatDate(league.startDate)}</span>
                  </p>
                )}
                {league.endDate && (
                  <p>
                    <span className="text-text-muted">Ends:</span>{" "}
                    <span className="text-scorecard-pencil">{formatDate(league.endDate)}</span>
                  </p>
                )}
                {league.numberOfWeeks && (
                  <p>
                    <span className="text-text-muted">Duration:</span>{" "}
                    <span className="text-scorecard-pencil">{league.numberOfWeeks} weeks</span>
                  </p>
                )}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-3 flex items-center gap-1.5">
              <IconUsers className="w-3.5 h-3.5" />
              Details
            </h2>
            <div className="space-y-1.5 text-sm font-sans">
              <p>
                <span className="text-text-muted">Teams:</span>{" "}
                <span className="text-scorecard-pencil font-mono tabular-nums">
                  {league._count.teams} / {league.maxTeams}
                </span>
              </p>
              <p>
                <span className="text-text-muted">Registration:</span>{" "}
                <span className={`font-medium ${league.registrationOpen ? "text-fairway" : "text-error"}`}>
                  {league.registrationOpen ? "Open" : "Closed"}
                </span>
              </p>
              {league.entryFee !== null && league.entryFee > 0 && (
                <p>
                  <span className="text-text-muted">Entry Fee:</span>{" "}
                  <span className="text-scorecard-pencil font-mono">${league.entryFee}</span>
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ── Prizes ────────────────────────────────────── */}
        {league.prizeInfo && (
          <section className="mb-8">
            <h2 className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-3 flex items-center gap-1.5">
              <IconAward className="w-3.5 h-3.5" />
              Prizes
            </h2>
            <p className="text-text-secondary font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {league.prizeInfo}
            </p>
          </section>
        )}

        {/* ── Contact ───────────────────────────────────── */}
        {(league.contactEmail || league.contactPhone) && (
          <section className="pt-6 border-t border-scorecard-line mb-8">
            <h2 className="text-xs font-display uppercase tracking-[0.2em] text-wood mb-3">
              Contact
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 text-sm font-sans">
              {league.contactEmail && (
                <span className="flex items-center gap-2 text-text-secondary">
                  <IconMail className="w-4 h-4 text-text-muted" />
                  {league.contactEmail}
                </span>
              )}
              {league.contactPhone && (
                <span className="flex items-center gap-2 text-text-secondary">
                  <IconPhone className="w-4 h-4 text-text-muted" />
                  {league.contactPhone}
                </span>
              )}
            </div>
          </section>
        )}

        {/* ── Footer link ───────────────────────────────── */}
        <div className="pt-6 border-t border-scorecard-line">
          <Link
            href="/leagues"
            className="inline-flex items-center gap-2 text-fairway hover:text-rough font-display text-sm uppercase tracking-wider transition-colors"
          >
            <IconArrowLeft className="w-4 h-4" />
            Browse All Leagues
          </Link>
        </div>
      </div>
    </div>
  );
}
