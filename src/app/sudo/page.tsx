import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getLeaguesWithStats() {
  const leagues = await prisma.league.findMany({
    include: {
      _count: {
        select: {
          teams: true,
          matchups: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return leagues;
}

export default async function SudoDashboard() {
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
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Total Leagues</div>
          <div className="text-3xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Active</div>
          <div className="text-3xl font-bold text-green-400">{stats.active}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Suspended</div>
          <div className="text-3xl font-bold text-amber-400">
            {stats.suspended}
          </div>
        </div>
      </div>

      {/* Leagues table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">All Leagues</h2>
        </div>

        {leagues.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No leagues created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    League
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Teams
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Matchups
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {leagues.map((league) => (
                  <tr key={league.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-4">
                      <div className="text-white font-medium">{league.name}</div>
                      <div className="text-slate-400 text-sm">/{league.slug}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                          league.status === "active"
                            ? "bg-green-900/50 text-green-400"
                            : league.status === "suspended"
                            ? "bg-amber-900/50 text-amber-400"
                            : "bg-red-900/50 text-red-400"
                        }`}
                      >
                        {league.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {league._count.teams}
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {league._count.matchups}
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-sm">
                      {new Date(league.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/sudo/leagues/${league.id}`}
                          className="text-amber-500 hover:text-amber-400 text-sm font-medium"
                        >
                          Manage
                        </Link>
                        <span className="text-slate-600">|</span>
                        <Link
                          href={`/league/${league.slug}`}
                          target="_blank"
                          className="text-slate-400 hover:text-white text-sm"
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
