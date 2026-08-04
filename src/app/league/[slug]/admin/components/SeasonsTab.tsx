"use client";

import { useState, useEffect } from "react";
import {
  createSeason,
  setActiveSeason,
  type SeasonInfo,
} from "@/lib/actions/seasons";
import { notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/composite";

interface SeasonsTabProps {
  slug: string;
  leagueId: number;
  seasons: SeasonInfo[];
  activeSeason: { id: number; name: string } | null;
  onSeasonChanged: () => void;
}

export default function SeasonsTab({
  slug,
  seasons: initialSeasons,
  activeSeason: initialActiveSeason,
  onSeasonChanged,
}: SeasonsTabProps) {
  const [loading, setLoading] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonYear, setNewSeasonYear] = useState(new Date().getFullYear());
  const [seasons, setSeasons] = useState<SeasonInfo[]>(initialSeasons);
  const [activeSeason, setActiveSeasonState] = useState<{ id: number; name: string } | null>(initialActiveSeason);

  // Sync local state when parent passes new seasons
  useEffect(() => {
    setSeasons(initialSeasons);
  }, [initialSeasons]);

  useEffect(() => {
    setActiveSeasonState(initialActiveSeason);
  }, [initialActiveSeason]);

  async function handleCreateSeason() {
    if (!newSeasonName.trim()) {
      notify.error("Please enter a season name.");
      return;
    }
    setLoading(true);
    try {
      const result = await createSeason(slug, newSeasonName, newSeasonYear);
      if (!result.success) {
        notify.error(result.error);
        setLoading(false);
        return;
      }
      // Update local state from the server action response
      setActiveSeasonState({ id: result.data.id, name: result.data.name });
      setSeasons((prev) => [
        { id: result.data.id, name: result.data.name, year: newSeasonYear, seasonNumber: result.data.seasonNumber, isActive: true, scoringType: null, startDate: null, endDate: null, numberOfWeeks: null, teamCount: 0, matchupCount: 0 },
        ...prev.map((s) => ({ ...s, isActive: false })),
      ]);
      setNewSeasonName("");
      notify.success(`Season "${newSeasonName}" created and set as active!`);
      // Let the parent re-fetch all data (teams, matchups, etc.)
      onSeasonChanged();
    } catch (error) {
      console.error("handleCreateSeason error:", error);
      notify.error("Failed to create season.");
    }
    setLoading(false);
  }

  async function handleSetActiveSeason(seasonId: number) {
    setLoading(true);
    try {
      const result = await setActiveSeason(slug, seasonId);
      if (!result.success) {
        notify.error(result.error);
        setLoading(false);
        return;
      }
      // Update local state from what we already know
      const targetSeason = seasons.find((s) => s.id === seasonId);
      if (targetSeason) {
        setActiveSeasonState({ id: targetSeason.id, name: targetSeason.name });
        setSeasons((prev) =>
          prev.map((s) => ({ ...s, isActive: s.id === seasonId }))
        );
        notify.success(`Active season changed to "${targetSeason.name}".`);
      }
      // Let the parent re-fetch all data (teams, matchups, etc.)
      onSeasonChanged();
    } catch (error) {
      console.error("handleSetActiveSeason error:", error);
      notify.error("Failed to set active season.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Active Season Indicator */}
      {activeSeason && (
        <div className="bg-fairway/10 border border-fairway/30 rounded-lg p-4">
          <p className="text-primary font-sans">
            <span className="font-display font-medium uppercase tracking-wider">Active Season:</span> {activeSeason.name}
          </p>
          <p className="text-sm text-putting mt-1 font-sans">
            Teams and matchups are being entered for this season.
          </p>
        </div>
      )}

      {/* Create New Season */}
      <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
        <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-scorecard-pencil">Create New Season</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Season Name
            </label>
            <input
              type="text"
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="e.g., 2025 Spring Season"
              className="pencil-input w-64"
            />
          </div>
          <div>
            <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Year
            </label>
            <input
              type="number"
              value={newSeasonYear}
              onChange={(e) => setNewSeasonYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="pencil-input w-24"
            />
          </div>
          <SubmitButton
            type="button"
            pending={loading}
            onClick={handleCreateSeason}
            disabled={loading || !newSeasonName.trim()}
          >
            {loading ? "Creating..." : "Create Season"}
          </SubmitButton>
        </div>
        <p className="mt-2 text-sm text-text-muted font-sans">
          Creating a new season will automatically set it as the active season.
        </p>
      </div>

      {/* All Seasons */}
      <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
        <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-scorecard-pencil">All Seasons</h2>
        {seasons.length === 0 ? (
          <p className="text-text-muted font-sans">No seasons have been created yet. Create your first season above.</p>
        ) : (
          <div className="space-y-3">
            {seasons.map((season) => (
              <div
                key={season.id}
                className={`p-4 rounded-lg border ${
                  season.isActive
                    ? "bg-fairway/10 border-fairway/30"
                    : "bg-surface border-border"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold uppercase tracking-wider text-scorecard-pencil">{season.name}</h3>
                      {season.isActive && (
                        <span className="px-2 py-0.5 text-xs bg-fairway text-white rounded-full font-display uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted mt-1 font-sans">
                      Season <span className="font-mono tabular-nums">#{season.seasonNumber}</span> &bull; <span className="font-mono tabular-nums">{season.year}</span>
                    </p>
                    <div className="flex gap-4 mt-2 text-sm text-text-secondary font-sans">
                      <span><span className="font-mono tabular-nums">{season.teamCount}</span> team{season.teamCount !== 1 ? "s" : ""}</span>
                      <span><span className="font-mono tabular-nums">{season.matchupCount}</span> matchup{season.matchupCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  {!season.isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSetActiveSeason(season.id)}
                      disabled={loading}
                    >
                      Set Active
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How Seasons Work */}
      <div className="bg-info-bg border border-info-border rounded-lg p-4">
        <h3 className="font-display font-medium uppercase tracking-wider text-info-text mb-2">How Seasons Work</h3>
        <ul className="text-sm text-info-text space-y-1 font-sans">
          <li>&bull; Teams register for the active season only</li>
          <li>&bull; Matchups are entered for the active season</li>
          <li>&bull; Previous season stats are preserved for historical viewing</li>
          <li>&bull; Teams can re-register with the same name in new seasons</li>
        </ul>
      </div>
    </div>
  );
}
