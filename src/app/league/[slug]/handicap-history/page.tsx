import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, getHandicapHistory } from "@/lib/actions";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function HandicapHistoryPage({ params }: Props) {
  const { slug } = await params;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const handicapHistory = await getHandicapHistory(league.id);

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

  return (
    <div className="min-h-screen bg-green-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/league/${slug}/leaderboard`}
            className="text-green-600 hover:text-green-700"
          >
            &larr; Back to Leaderboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-green-800 mb-2">Handicap History</h1>
        <p className="text-gray-600 mb-8">{league.name}</p>

        {handicapHistory.length === 0 || weekNumbers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No handicap data available yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-green-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-green-700 text-white">
                  <tr>
                    <th className="py-3 px-4 text-left font-semibold sticky left-0 bg-green-700 z-10">
                      Team
                    </th>
                    {weekNumbers.map((week) => (
                      <th key={week} className="py-3 px-3 text-center font-semibold min-w-[70px]">
                        Wk {week}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-center font-semibold bg-green-800">
                      Current
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  {handicapHistory.map((team, idx) => (
                    <tr
                      key={team.teamId}
                      className={`border-b border-gray-100 ${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } hover:bg-green-50`}
                    >
                      <td className="py-3 px-4 font-medium sticky left-0 bg-inherit z-10">
                        <Link
                          href={`/league/${slug}/team/${team.teamId}`}
                          className="text-green-700 hover:text-green-800 hover:underline"
                        >
                          {team.teamName}
                        </Link>
                      </td>
                      {weekNumbers.map((week) => {
                        const hcp = handicapLookup[team.teamId]?.[week];
                        const change = getChange(team.teamId, week);

                        return (
                          <td key={week} className="py-3 px-3 text-center">
                            {hcp !== undefined ? (
                              <div className="flex items-center justify-center gap-1">
                                <span>{hcp}</span>
                                {change !== null && change !== 0 && (
                                  <span
                                    className={`text-xs ${
                                      change < 0 ? "text-green-600" : "text-red-500"
                                    }`}
                                  >
                                    {change < 0 ? (
                                      <span className="inline-flex items-center">
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {Math.abs(change)}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center">
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {Math.abs(change)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 text-center font-bold text-green-700 bg-green-50">
                        {team.currentHandicap}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-gray-500">
          <p className="flex items-center gap-2">
            <span className="inline-flex items-center text-green-600">
              <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </span>
            = Handicap decreased (improved)
            <span className="ml-4 inline-flex items-center text-red-500">
              <svg className="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
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
