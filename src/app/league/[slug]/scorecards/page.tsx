import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeaguePublicInfo } from "@/lib/actions/leagues";
import { getPublicScorecardsForWeek } from "@/lib/actions/scorecards";
import { getActiveSeason, getCurrentWeekNumberForSeason } from "@/lib/actions/seasons";
import { getCurrentWeekNumber } from "@/lib/actions/teams";
import ScorecardGrid from "@/components/ScorecardGrid";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeaguePublicInfo(slug);
  if (!league) {
    return { title: "Scorecards" };
  }
  return {
    title: `Scorecards - ${league.name}`,
  };
}

export default async function PublicScorecardsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const search = await searchParams;

  const league = await getLeaguePublicInfo(slug);
  if (!league) {
    notFound();
  }

  if (league.scorecardMode === "disabled") {
    notFound();
  }

  // Determine week number
  let currentWeek = 1;
  const activeSeason = await getActiveSeason(league.id);
  if (activeSeason) {
    currentWeek = await getCurrentWeekNumberForSeason(activeSeason.id);
  } else {
    currentWeek = await getCurrentWeekNumber(league.id);
  }
  const parsedWeek = search.week ? parseInt(search.week) : NaN;
  const weekNumber = !isNaN(parsedWeek) && parsedWeek >= 1 ? parsedWeek : Math.max(1, currentWeek - 1);

  const scorecards = await getPublicScorecardsForWeek(league.id, weekNumber);

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/league/${slug}`}
            className="text-fairway hover:text-rough text-sm font-display uppercase tracking-wider transition-colors"
          >
            &larr; Back to {league.name}
          </Link>
          <h1 className="text-3xl md:text-4xl font-display uppercase tracking-wider text-text-primary mt-2">
            Scorecards
          </h1>
          <p className="text-text-secondary font-sans mt-1">Week {weekNumber}</p>
        </div>

        {/* Week Navigator */}
        <div className="flex items-center gap-4 mb-8">
          {weekNumber > 1 && (
            <Link
              href={`/league/${slug}/scorecards?week=${weekNumber - 1}`}
              className="px-4 py-2 bg-surface-white border border-border rounded-lg font-display font-semibold uppercase tracking-wider text-sm text-text-secondary hover:border-fairway transition-colors"
            >
              Week {weekNumber - 1}
            </Link>
          )}
          <span className="px-4 py-2 bg-fairway text-white rounded-lg font-display font-semibold uppercase tracking-wider text-sm">
            Week {weekNumber}
          </span>
          <Link
            href={`/league/${slug}/scorecards?week=${weekNumber + 1}`}
            className="px-4 py-2 bg-surface-white border border-border rounded-lg font-display font-semibold uppercase tracking-wider text-sm text-text-secondary hover:border-fairway transition-colors"
          >
            Week {weekNumber + 1}
          </Link>
        </div>

        {/* Scorecards */}
        {scorecards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted font-sans">No approved scorecards for this week.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {scorecards.map((sc) => (
              <div key={sc.id}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-display font-semibold uppercase tracking-wider text-scorecard-pencil">
                    {sc.teamName}
                  </h2>
                  <div className="flex items-center gap-3">
                    {sc.grossTotal !== null && sc.course.totalPar !== null && (
                      <span className={`font-mono tabular-nums font-semibold ${
                        sc.grossTotal - sc.course.totalPar === 0
                          ? "text-fairway"
                          : sc.grossTotal - sc.course.totalPar > 0
                            ? "text-board-red"
                            : "text-info-text"
                      }`}>
                        {sc.grossTotal - sc.course.totalPar === 0
                          ? "Even"
                          : sc.grossTotal - sc.course.totalPar > 0
                            ? `+${sc.grossTotal - sc.course.totalPar}`
                            : sc.grossTotal - sc.course.totalPar}
                      </span>
                    )}
                    <span className="font-mono tabular-nums text-lg font-bold text-scorecard-pencil">
                      {sc.grossTotal ?? "-"}
                    </span>
                  </div>
                </div>
                <ScorecardGrid
                  holes={sc.course.holes}
                  holeScores={sc.holeScores}
                  courseName={sc.course.name}
                  totalPar={sc.course.totalPar}
                  grossTotal={sc.grossTotal}
                  frontNine={sc.frontNine}
                  backNine={sc.backNine}
                  compact
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
