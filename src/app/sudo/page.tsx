import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getLeaguesWithStats() {
  const leagues = await prisma.league.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      scoringType: true,
      scheduleType: true,
      createdAt: true,
      _count: {
        select: {
          teams: true,
          matchups: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return leagues;
}

export default async function SudoDashboard() {
  await requireSuperAdmin();
  const leagues = await getLeaguesWithStats();

  const stats = {
    total: leagues.length,
    active: leagues.filter((l) => l.status === "active").length,
    suspended: leagues.filter((l) => l.status === "suspended").length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/70 text-sm font-display uppercase tracking-wider">Total Leagues</div>
          <div className="text-3xl font-bold text-white font-mono tabular-nums">{stats.total}</div>
        </div>
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/70 text-sm font-display uppercase tracking-wider">Active</div>
          <div className="text-3xl font-bold text-fairway font-mono tabular-nums">{stats.active}</div>
        </div>
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/70 text-sm font-display uppercase tracking-wider">Suspended</div>
          <div className="text-3xl font-bold text-board-yellow font-mono tabular-nums">
            {stats.suspended}
          </div>
        </div>
      </div>

      {/* Leagues table */}
      <div className="bg-board-green border border-board-green/80 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-putting/20">
          <h2 className="text-lg font-display font-semibold text-board-yellow uppercase tracking-wider">All Leagues</h2>
        </div>

        {leagues.length === 0 ? (
          <div className="p-8 text-center text-putting/60 font-sans">
            No leagues created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-rough/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    League
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    Teams
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    Matchups
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-display font-medium text-putting/70 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-putting/15">
                {leagues.map((league) => (
                  <tr key={league.id} className="hover:bg-rough/30">
                    <td className="px-4 py-4">
                      <div className="text-white font-medium font-sans">{league.name}</div>
                      <div className="text-putting/60 text-sm font-mono">/{league.slug}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-display font-medium rounded uppercase tracking-wider ${
                          league.status === "active"
                            ? "bg-fairway/20 text-fairway"
                            : league.status === "suspended"
                            ? "bg-board-yellow/20 text-board-yellow"
                            : "bg-board-red/20 text-board-red"
                        }`}
                      >
                        {league.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-display font-medium rounded uppercase tracking-wider ${
                        league.scoringType === "stroke_play"
                          ? "bg-water/20 text-water"
                          : league.scoringType === "hybrid"
                          ? "bg-putting/20 text-putting"
                          : "bg-rough text-putting/70"
                      }`}>
                        {league.scoringType === "stroke_play" ? "Stroke"
                          : league.scoringType === "hybrid" ? "Hybrid"
                          : "Match"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-putting/70 font-mono tabular-nums">
                      {league._count.teams}
                    </td>
                    <td className="px-4 py-4 text-putting/70 font-mono tabular-nums">
                      {league._count.matchups}
                    </td>
                    <td className="px-4 py-4 text-putting/60 text-sm font-sans">
                      {new Date(league.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/sudo/leagues/${league.id}`}
                          className="text-board-yellow hover:text-board-yellow/80 text-sm font-display font-medium uppercase tracking-wider"
                        >
                          Manage
                        </Link>
                        <span className="text-putting/20">|</span>
                        <Link
                          href={`/league/${league.slug}`}
                          target="_blank"
                          className="text-putting/60 hover:text-white text-sm font-sans"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
