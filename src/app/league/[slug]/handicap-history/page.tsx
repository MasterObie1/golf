import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import { getSeasons, getActiveSeason } from "@/lib/actions/seasons";
import { getHandicapHistoryForSeason } from "@/lib/actions/handicap-settings";
import { SeasonSelector } from "@/components/SeasonSelector";
import { ContourBackground } from "@/components/grounds/ContourBackground";
import type { Metadata } from "next";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ seasonId?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Handicap History" };
  return {
    title: `Handicap History - ${league.name}`,
    description: `Handicap trends and history for ${league.name}`,
  };
}

export default async function HandicapHistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { seasonId } = await searchParams;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const [seasons, activeSeason] = await Promise.all([
    getSeasons(league.id),
    getActiveSeason(league.id),
  ]);

  // Determine which season to show
  let currentSeasonId: number | null = null;
  if (seasonId) {
    const parsed = parseInt(seasonId, 10);
    if (!isNaN(parsed)) currentSeasonId = parsed;
  }
  if (currentSeasonId === null && activeSeason) {
    currentSeasonId = activeSeason.id;
  } else if (seasons.length > 0) {
    currentSeasonId = seasons[0].id;
  }

  // Get handicap history for the current season
  const handicapHistory = currentSeasonId
    ? await getHandicapHistoryForSeason(currentSeasonId)
    : [];

  // Get all unique week numbers
  const allWeeks = new Set<number>();
  for (const team of handicapHistory) {
    for (const entry of team.weeklyHandicaps) {
      allWeeks.add(entry.week);
    }
  }
  const weekNumbers = [...allWeeks].sort((a, b) => a - b);

  // Build lookup for quick access
  const handicapLookup: Record<number, Record<number, number>> = {};
  for (const team of handicapHistory) {
    handicapLookup[team.teamId] = {};
    for (const entry of team.weeklyHandicaps) {
      handicapLookup[team.teamId][entry.week] = entry.handicap;
    }
  }

  // Calculate week-over-week changes for each team
  const getChange = (teamId: number, week: number): number | null => {
    const weekIndex = weekNumbers.indexOf(week);
    if (weekIndex <= 0) return null;

    const currentHcp = handicapLookup[teamId]?.[week];
    const prevWeek = weekNumbers[weekIndex - 1];
    const prevHcp = handicapLookup[teamId]?.[prevWeek];

    if (currentHcp === undefined || prevHcp === undefined) return null;
    return currentHcp - prevHcp;
  };

  const currentSeason = currentSeasonId
    ? seasons.find((s) => s.id === currentSeasonId)
    : null;

  return (
    <div className="min-h-screen bg-surface relative">
      <ContourBackground variant="hills" color="text-fairway" opacity="opacity-[0.04]" />

      <div className="relative max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/league/${slug}/leaderboard${currentSeasonId ? `?seasonId=${currentSeasonId}` : ""}`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider transition-colors"
          >
            &larr; Back to Leaderboard
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-scorecard-pencil font-display uppercase tracking-wider">Handicap History</h1>
          {seasons.length > 0 && (
            <SeasonSelector
              seasons={seasons}
              currentSeasonId={currentSeasonId}
              leagueSlug={slug}
            />
          )}
        </div>
        <p className="text-text-secondary mb-8 font-sans">
          {league.name}
          {currentSeason && ` \u2014 ${currentSeason.name}`}
        </p>

        {seasons.length === 0 ? (
          <div className="bg-scorecard-paper rounded-lg shadow-sm border border-scorecard-line/50 p-8 text-center">
            <p className="text-text-muted font-sans">No seasons have been created yet.</p>
          </div>
        ) : handicapHistory.length === 0 || weekNumbers.length === 0 ? (
          <div className="bg-scorecard-paper rounded-lg shadow-sm border border-scorecard-line/50 p-8 text-center">
            <p className="text-text-muted font-sans">No handicap data available yet.</p>
          </div>
        ) : (
          <div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-rough text-white">
                  <tr>
                    <th className="py-3 px-4 text-left font-display font-semibold uppercase tracking-wider text-xs sticky left-0 bg-rough z-10">
                      Team
                    </th>
                    {weekNumbers.map((week) => (
                      <th key={week} className="py-3 px-3 text-center font-display font-semibold uppercase tracking-wider text-xs min-w-[70px]">
                        Wk {week}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs bg-fairway">
                      Current
                    </th>
                  </tr>
                </thead>
                <tbody className="text-scorecard-pencil">
                  {handicapHistory.map((team, idx) => (
                    <tr
                      key={team.teamId}
                      className={`border-b border-scorecard-line/30 ${
                        idx % 2 === 0 ? "bg-scorecard-paper" : "bg-bunker/10"
                      } hover:bg-bunker/20`}
                    >
                      <td className="py-3 px-4 font-medium font-sans sticky left-0 bg-inherit z-10">
                        <Link
                          href={`/league/${slug}/team/${team.teamId}`}
                          className="text-fairway hover:text-rough hover:underline transition-colors"
                        >
                          {team.teamName}
                        </Link>
                      </td>
                      {weekNumbers.map((week) => {
                        const hcp = handicapLookup[team.teamId]?.[week];
                        const change = getChange(team.teamId, week);

                        return (
                          <td key={week} className="py-3 px-3 text-center font-mono tabular-nums">
                            {hcp !== undefined ? (
                              <div className="flex items-center justify-center gap-1">
                                <span>{hcp}</span>
                                {change !== null && change !== 0 && (
                                  <span
                                    className={`text-xs ${
                                      change < 0 ? "text-fairway" : "text-board-red"
                                    }`}
                                  >
                                    {change < 0 ? (
                                      <span className="inline-flex items-center">
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {Math.abs(change)}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center">
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {Math.abs(change)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-light" title="No handicap data for this week">&mdash;</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 text-center font-mono font-bold tabular-nums text-fairway bg-fairway/10">
                        {team.currentHandicap != null ? team.currentHandicap : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-text-muted font-sans">
          <p className="flex items-center gap-2">
            <span className="inline-flex items-center text-fairway">
              <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </span>
            = Handicap decreased (improved)
            <span className="ml-4 inline-flex items-center text-board-red">
              <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
            = Handicap increased
          </p>
        </div>
      </div>
    </div>
  );
}
