"use client";

import { useState } from "react";
import {
  createSeason,
  getSeasons,
  getActiveSeason,
  setActiveSeason,
  getTeamsForSeason,
  getCurrentWeekNumberForSeason,
  getMatchupHistoryForSeason,
} from "@/lib/actions";

interface SeasonInfo {
  id: number;
  name: string;
  year: number;
  seasonNumber: number;
  isActive: boolean;
  teamCount: number;
  matchupCount: number;
}

interface SeasonsTabProps {
  slug: string;
  leagueId: number;
  seasons: SeasonInfo[];
  activeSeason: { id: number; name: string } | null;
  onSeasonChanged: () => void;
}

export default function SeasonsTab({
  slug,
  leagueId,
  seasons: initialSeasons,
  activeSeason: initialActiveSeason,
  onSeasonChanged,
}: SeasonsTabProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonYear, setNewSeasonYear] = useState(new Date().getFullYear());
  const [seasons, setSeasons] = useState<SeasonInfo[]>(initialSeasons);
  const [activeSeason, setActiveSeasonState] = useState<{ id: number; name: string } | null>(initialActiveSeason);

  async function handleCreateSeason() {
    if (!newSeasonName.trim()) {
      setMessage({ type: "error", text: "Please enter a season name." });
      return;
    }
    setLoading(true);
    try {
      await createSeason(slug, newSeasonName, newSeasonYear);
      const [seasonsData, activeSeasonData] = await Promise.all([
        getSeasons(leagueId),
        getActiveSeason(leagueId),
      ]);
      setSeasons(seasonsData);
      setActiveSeasonState(activeSeasonData ? { id: activeSeasonData.id, name: activeSeasonData.name } : null);
      setNewSeasonName("");
      setMessage({ type: "success", text: `Season "${newSeasonName}" created and set as active!` });
      onSeasonChanged();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to create season." });
    }
    setLoading(false);
  }

  async function handleSetActiveSeason(seasonId: number) {
    setLoading(true);
    try {
      await setActiveSeason(slug, seasonId);
      const [seasonsData, activeSeasonData] = await Promise.all([
        getSeasons(leagueId),
        getActiveSeason(leagueId),
      ]);
      setSeasons(seasonsData);
      setActiveSeasonState(activeSeasonData ? { id: activeSeasonData.id, name: activeSeasonData.name } : null);
      setMessage({ type: "success", text: `Active season changed to "${activeSeasonData?.name}".` });
      onSeasonChanged();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to set active season." });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Active Season Indicator */}
      {activeSeason && (
        <div className="bg-green-100 border border-green-300 rounded-lg p-4">
          <p className="text-green-800">
            <span className="font-medium">Active Season:</span> {activeSeason.name}
          </p>
          <p className="text-sm text-green-600 mt-1">
            Teams and matchups are being entered for this season.
          </p>
        </div>
      )}

      {/* Create New Season */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Create New Season</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Season Name
            </label>
            <input
              type="text"
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="e.g., 2025 Spring Season"
              className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <input
              type="number"
              value={newSeasonYear}
              onChange={(e) => setNewSeasonYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={handleCreateSeason}
            disabled={loading || !newSeasonName.trim()}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Season"}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Creating a new season will automatically set it as the active season.
        </p>
      </div>

      {/* All Seasons */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">All Seasons</h2>
        {seasons.length === 0 ? (
          <p className="text-gray-500">No seasons have been created yet. Create your first season above.</p>
        ) : (
          <div className="space-y-3">
            {seasons.map((season) => (
              <div
                key={season.id}
                className={`p-4 rounded-lg border ${
                  season.isActive
                    ? "bg-green-50 border-green-300"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800">{season.name}</h3>
                      {season.isActive && (
                        <span className="px-2 py-0.5 text-xs bg-green-600 text-white rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Season #{season.seasonNumber} • {season.year}
                    </p>
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>{season.teamCount} team{season.teamCount !== 1 ? "s" : ""}</span>
                      <span>{season.matchupCount} matchup{season.matchupCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  {!season.isActive && (
                    <button
                      onClick={() => handleSetActiveSeason(season.id)}
                      disabled={loading}
                      className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                    >
                      Set Active
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How Seasons Work */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">How Seasons Work</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Teams register for the active season only</li>
          <li>• Matchups are entered for the active season</li>
          <li>• Previous season stats are preserved for historical viewing</li>
          <li>• Teams can re-register with the same name in new seasons</li>
        </ul>
      </div>
    </div>
  );
}
