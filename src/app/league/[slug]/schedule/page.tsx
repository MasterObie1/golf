import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import { getSeasons, getActiveSeason } from "@/lib/actions/seasons";
import { getSchedule, getScheduleStatus } from "@/lib/actions/schedule";
import { getCurrentWeekNumber } from "@/lib/actions/teams";
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
  if (!league) return { title: "Schedule" };
  return {
    title: `Schedule - ${league.name}`,
    description: `Season schedule for ${league.name}`,
  };
}

export default async function LeagueSchedulePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { seasonId } = await searchParams;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  // Handle hidden visibility
  if (league.scheduleVisibility === "hidden") {
    return (
      <div className="min-h-screen bg-surface relative">
        <ContourBackground variant="hills" color="text-fairway" opacity="opacity-[0.04]" />
        <div className="relative max-w-4xl mx-auto px-4 py-8">
          <div className="mb-6">
            <Link href={`/league/${slug}`} className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider">
              &larr; Back to {league.name}
            </Link>
          </div>
          <div className="bg-scorecard-paper rounded-lg shadow-md p-8 text-center border border-scorecard-line/50">
            <p className="text-text-muted font-sans">This league&apos;s schedule is not publicly available.</p>
          </div>
        </div>
      </div>
    );
  }

  // Stroke play leagues have no schedule
  if (league.scoringType === "stroke_play") {
    redirect(`/league/${slug}`);
  }

  const [seasons, activeSeason] = await Promise.all([
    getSeasons(league.id),
    getActiveSeason(league.id),
  ]);

  let currentSeasonId: number | null = null;
  if (seasonId) {
    const parsed = parseInt(seasonId, 10);
    if (!isNaN(parsed)) currentSeasonId = parsed;
  }
  if (currentSeasonId === null && activeSeason) {
    currentSeasonId = activeSeason.id;
  } else if (currentSeasonId === null && seasons.length > 0) {
    currentSeasonId = seasons[0].id;
  }

  const [schedule, scheduleStatus, currentWeek] = await Promise.all([
    getSchedule(league.id, currentSeasonId ?? undefined),
    getScheduleStatus(league.id, currentSeasonId ?? undefined),
    getCurrentWeekNumber(league.id),
  ]);

  const currentSeason = currentSeasonId ? seasons.find((s) => s.id === currentSeasonId) : null;
  const isCurrentWeekOnly = league.scheduleVisibility === "current_week";

  const visibleSchedule = isCurrentWeekOnly
    ? schedule.filter((w) => w.weekNumber <= currentWeek)
    : schedule;

  return (
    <div className="min-h-screen bg-surface relative">
      <ContourBackground variant="hills" color="text-fairway" opacity="opacity-[0.04]" />

      <div className="relative max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/league/${slug}`} className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider">
            &larr; Back to {league.name}
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-scorecard-pencil font-display uppercase tracking-wider">Schedule</h1>
          {seasons.length > 0 && (
            <SeasonSelector
              seasons={seasons}
              currentSeasonId={currentSeasonId}
              leagueSlug={slug}
            />
          )}
        </div>
        <p className="text-text-secondary mb-6 font-sans">
          {league.name}
          {currentSeason && ` \u2014 ${currentSeason.name}`}
        </p>

        {scheduleStatus && scheduleStatus.hasSchedule && (
          <div className="flex gap-4 mb-6 text-sm text-text-muted font-mono">
            <span>{scheduleStatus.totalWeeks} weeks</span>
            <span>{scheduleStatus.completedWeeks}/{scheduleStatus.totalWeeks} completed</span>
            <span>{scheduleStatus.teamCount} teams</span>
          </div>
        )}

        {schedule.length === 0 ? (
          <div className="bg-scorecard-paper rounded-lg shadow-md p-8 text-center border border-scorecard-line/50">
            <p className="text-text-muted font-sans">No schedule has been generated for this season yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleSchedule.map((week) => {
              const isCurrentWeekRow = week.weekNumber === currentWeek;
              const allCompleted = week.matches.every(
                (m) => m.status === "completed" || m.status === "cancelled"
              );
              const isPast = week.weekNumber < currentWeek;

              return (
                <div
                  key={week.weekNumber}
                  id={`week-${week.weekNumber}`}
                  className={`bg-scorecard-paper rounded-lg shadow-sm overflow-hidden border ${
                    isCurrentWeekRow ? "border-fairway ring-2 ring-fairway/30" : "border-scorecard-line/50"
                  }`}
                >
                  {/* Week header */}
                  <div
                    className={`px-4 py-3 flex items-center justify-between ${
                      isCurrentWeekRow
                        ? "bg-fairway text-white"
                        : isPast && allCompleted
                        ? "bg-bunker/30 text-text-secondary"
                        : "bg-scorecard-paper text-scorecard-pencil"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold uppercase tracking-wider text-sm">
                        Round {week.weekNumber}
                      </span>
                      {isCurrentWeekRow && (
                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-sans">
                          Current
                        </span>
                      )}
                    </div>
                    {isPast && allCompleted && (
                      <span className="text-xs text-fairway font-display uppercase tracking-wider">Completed</span>
                    )}
                  </div>

                  {/* Matches */}
                  <div className="divide-y divide-scorecard-line/30">
                    {week.matches.map((match) => {
                      const isBye = !match.teamB;
                      const isCompleted = match.status === "completed";
                      const isCancelled = match.status === "cancelled";

                      if (isBye) {
                        return (
                          <div key={match.id} className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/league/${slug}/team/${match.teamA.id}`}
                                className="font-medium font-sans text-fairway hover:text-rough"
                              >
                                {match.teamA.name}
                              </Link>
                              <span className="text-xs bg-bunker/40 text-text-secondary px-2 py-0.5 rounded font-display uppercase tracking-wider">
                                BYE
                              </span>
                            </div>
                          </div>
                        );
                      }

                      if (isCancelled) {
                        return (
                          <div key={match.id} className="px-4 py-3 text-text-light line-through font-sans">
                            {match.teamA.name} vs {match.teamB!.name}
                            <span className="ml-2 text-xs no-underline font-display uppercase">Cancelled</span>
                          </div>
                        );
                      }

                      if (isCompleted && match.matchup) {
                        const teamAWon = match.matchup.teamAPoints > match.matchup.teamBPoints;
                        const teamBWon = match.matchup.teamBPoints > match.matchup.teamAPoints;

                        return (
                          <div key={match.id} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1 font-sans">
                                <Link
                                  href={`/league/${slug}/team/${match.teamA.id}`}
                                  className={`font-medium hover:text-rough ${
                                    teamAWon ? "text-fairway" : "text-text-primary"
                                  }`}
                                >
                                  {match.teamA.name}
                                </Link>
                                <span className="text-sm text-text-light">vs</span>
                                <Link
                                  href={`/league/${slug}/team/${match.teamB!.id}`}
                                  className={`font-medium hover:text-rough ${
                                    teamBWon ? "text-fairway" : "text-text-primary"
                                  }`}
                                >
                                  {match.teamB!.name}
                                </Link>
                              </div>
                              <div className="text-sm font-mono font-medium text-text-secondary tabular-nums">
                                {match.matchup.teamAPoints} - {match.matchup.teamBPoints}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Scheduled (pending)
                      return (
                        <div key={match.id} className="px-4 py-3">
                          <div className="flex items-center justify-between font-sans">
                            <div className="flex items-center gap-3">
                              <Link
                                href={`/league/${slug}/team/${match.teamA.id}`}
                                className="font-medium text-text-primary hover:text-rough"
                              >
                                {match.teamA.name}
                              </Link>
                              <span className="text-sm text-text-light">vs</span>
                              <Link
                                href={`/league/${slug}/team/${match.teamB!.id}`}
                                className="font-medium text-text-primary hover:text-rough"
                              >
                                {match.teamB!.name}
                              </Link>
                            </div>
                            <span className="text-xs text-text-light font-display uppercase tracking-wider">Pending</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {isCurrentWeekOnly && schedule.length > visibleSchedule.length && (
              <div className="bg-scorecard-paper rounded-lg shadow-sm p-6 text-center border border-scorecard-line/50">
                <p className="text-text-muted text-sm font-sans">
                  Schedule for upcoming weeks will be revealed each week.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
