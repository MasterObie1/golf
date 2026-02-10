"use client";

import { useState, useEffect } from "react";
import {
  previewWeeklyScores,
  submitWeeklyScores,
  deleteWeeklyScores,
  getCurrentStrokePlayWeek,
  getWeeklyScoreHistory,
  type WeeklyScorePreview,
  type WeeklyScorePreviewEntry,
  type WeeklyScoreRecord,
} from "@/lib/actions/weekly-scores";
import { formatPosition } from "@/lib/format-utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { AdminTeam } from "@/lib/types/admin";

interface WeeklyScoresTabProps {
  slug: string;
  leagueId: number;
  teams: AdminTeam[];
  weekNumber: number;
  weeklyScores: WeeklyScoreRecord[];
  onDataRefresh: (data: { weekNumber?: number; weeklyScores?: WeeklyScoreRecord[] }) => void;
}

interface ScoreEntry {
  teamId: number;
  grossScore: number | "";
  isSub: boolean;
  isDnp: boolean;
  manualHandicap: number | "";
}

export default function WeeklyScoresTab({
  slug,
  leagueId,
  teams,
  weekNumber: initialWeekNumber,
  weeklyScores,
  onDataRefresh,
}: WeeklyScoresTabProps) {
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber);
  const [entries, setEntries] = useState<ScoreEntry[]>(
    teams.map((t) => ({
      teamId: t.id,
      grossScore: "",
      isSub: false,
      isDnp: false,
      manualHandicap: "",
    }))
  );
  const [preview, setPreview] = useState<WeeklyScorePreview | null>(null);
  const [pointOverrides, setPointOverrides] = useState<Map<number, number>>(new Map());

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; weekNumber: number }>({ open: false, weekNumber: 0 });
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());

  // Re-sync entries when team IDs change (e.g., team added/removed)
  // Use a stable key derived from team IDs to avoid re-triggering on array reference changes
  const teamIdsKey = teams.map((t) => t.id).join(",");
  useEffect(() => {
    setEntries(
      teams.map((t) => ({
        teamId: t.id,
        grossScore: "",
        isSub: false,
        isDnp: false,
        manualHandicap: "",
      }))
    );
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIdsKey]);

  const isWeekOne = weekNumber === 1;

  function updateEntry(teamId: number, field: keyof ScoreEntry, value: number | string | boolean) {
    setEntries((prev) =>
      prev.map((e) => (e.teamId === teamId ? { ...e, [field]: value } : e))
    );
  }

  async function handlePreview() {
    // Validate: all non-DNP teams need a gross score
    const playing = entries.filter((e) => !e.isDnp);
    if (playing.length === 0) {
      setMessage({ type: "error", text: "At least one team must be playing (not DNP)." });
      return;
    }
    for (const e of playing) {
      if (e.grossScore === "" || e.grossScore < 0) {
        const team = teams.find((t) => t.id === e.teamId);
        setMessage({ type: "error", text: `Please enter a valid gross score for ${team?.name || "all teams"}.` });
        return;
      }
    }
    // Week 1 or subs need manual handicap
    for (const e of playing) {
      if ((isWeekOne || e.isSub) && e.manualHandicap === "") {
        const team = teams.find((t) => t.id === e.teamId);
        setMessage({ type: "error", text: `${isWeekOne ? "Week 1" : "Substitute"} requires manual handicap for ${team?.name || "team"}.` });
        return;
      }
    }

    setLoading(true);
    setMessage(null);
    try {
      const inputs = entries.map((e) => ({
        teamId: e.teamId,
        grossScore: e.isDnp ? 0 : (e.grossScore as number),
        isSub: e.isSub,
        isDnp: e.isDnp,
        manualHandicap: e.manualHandicap === "" ? null : (e.manualHandicap as number),
      }));

      const result = await previewWeeklyScores(slug, leagueId, weekNumber, inputs);
      if (result.success) {
        setPreview(result.data);
        const overrides = new Map<number, number>();
        for (const s of result.data.scores) {
          overrides.set(s.teamId, s.totalPoints);
        }
        setPointOverrides(overrides);
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handlePreview error:", error);
      setMessage({ type: "error", text: "Failed to generate preview." });
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!preview) return;

    setLoading(true);
    try {
      const scores = preview.scores.map((s) => ({
        teamId: s.teamId,
        grossScore: s.grossScore,
        handicap: s.handicap,
        netScore: s.netScore,
        points: s.points,
        bonusPoints: s.bonusPoints,
        isSub: s.isSub,
        isDnp: s.isDnp,
        position: s.position,
      }));

      // Apply overrides: recalculate points/bonus from total override
      for (const score of scores) {
        const override = pointOverrides.get(score.teamId);
        if (override !== undefined) {
          const originalTotal = score.points + score.bonusPoints;
          if (override !== originalTotal) {
            // Shift the difference into bonusPoints to preserve base points
            score.bonusPoints += override - originalTotal;
          }
        }
      }

      const result = await submitWeeklyScores(slug, weekNumber, scores);
      if (result.success) {
        setMessage({ type: "success", text: `Week ${weekNumber} scores submitted!` });
        setPreview(null);
        // Reset entries
        setEntries(
          teams.map((t) => ({
            teamId: t.id,
            grossScore: "",
            isSub: false,
            isDnp: false,
            manualHandicap: "",
          }))
        );
        const [currentWeek, history] = await Promise.all([
          getCurrentStrokePlayWeek(leagueId),
          getWeeklyScoreHistory(leagueId),
        ]);
        setWeekNumber(currentWeek);
        onDataRefresh({ weekNumber: currentWeek, weeklyScores: history });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleSubmit error:", error);
      setMessage({ type: "error", text: "Failed to submit scores." });
    }
    setLoading(false);
  }

  async function executeDeleteWeek() {
    const wk = deleteConfirm.weekNumber;
    setDeleteConfirm({ open: false, weekNumber: 0 });
    setLoading(true);
    try {
      const result = await deleteWeeklyScores(slug, wk);
      if (result.success) {
        setMessage({ type: "success", text: `Week ${wk} scores deleted.` });
        const [currentWeek, history] = await Promise.all([
          getCurrentStrokePlayWeek(leagueId),
          getWeeklyScoreHistory(leagueId),
        ]);
        setWeekNumber(currentWeek);
        onDataRefresh({ weekNumber: currentWeek, weeklyScores: history });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("executeDeleteWeek error:", error);
      setMessage({ type: "error", text: "Failed to delete scores." });
    }
    setLoading(false);
  }

  function formatScorePosition(pos: number, isDnp: boolean): string {
    if (isDnp) return "DNP";
    if (pos === 0) return "-";
    return formatPosition(pos);
  }

  // Group weekly scores by week for history display
  const weekGroups = new Map<number, WeeklyScoreRecord[]>();
  for (const s of weeklyScores) {
    const group = weekGroups.get(s.weekNumber) || [];
    group.push(s);
    weekGroups.set(s.weekNumber, group);
  }
  const sortedWeeks = [...weekGroups.keys()].sort((a, b) => b - a);

  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Week Scores"
        message={`Are you sure you want to delete all scores for Week ${deleteConfirm.weekNumber}? Team points will be reversed.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeDeleteWeek}
        onCancel={() => setDeleteConfirm({ open: false, weekNumber: 0 })}
      />

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg font-sans text-sm ${
            message.type === "success"
              ? "bg-fairway/10 border border-fairway/30 text-fairway"
              : "bg-error-bg border border-error-border text-error-text"
          }`}
        >
          {message.text}
        </div>
      )}

      {!preview ? (
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-scorecard-pencil">Enter Weekly Scores</h2>

          <div className="mb-6">
            <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Week Number</label>
            <input
              type="number"
              value={weekNumber}
              onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
              min={1}
              className="pencil-input w-32 font-mono tabular-nums"
            />
            {isWeekOne && (
              <p className="mt-2 text-sm text-warning-text font-sans font-medium">
                Week 1: Manual handicap entry required for all teams
              </p>
            )}
          </div>

          {/* Score Entry Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-board-green text-white">
                <tr>
                  <th className="py-3 px-3 font-display uppercase tracking-wider text-sm">Team</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Gross Score</th>
                  {(isWeekOne || entries.some((e) => e.isSub)) && (
                    <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Handicap</th>
                  )}
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Sub?</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">DNP?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-scorecard-line/40">
                {entries.map((entry) => {
                  const team = teams.find((t) => t.id === entry.teamId);
                  const needsManualHC = isWeekOne || entry.isSub;
                  return (
                    <tr key={entry.teamId} className={`${entry.isDnp ? "bg-surface opacity-60" : "hover:bg-surface-warm"}`}>
                      <td className="py-3 px-3 font-medium font-sans text-scorecard-pencil">{team?.name || `Team ${entry.teamId}`}</td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          value={entry.grossScore}
                          onChange={(e) => updateEntry(entry.teamId, "grossScore", e.target.value ? parseInt(e.target.value) : "")}
                          disabled={entry.isDnp}
                          className="w-20 px-2 py-1 border-b border-scorecard-line rounded-none text-center font-mono tabular-nums bg-transparent focus:outline-none focus:border-fairway disabled:bg-surface disabled:text-text-muted"
                          min={0}
                        />
                      </td>
                      {(isWeekOne || entries.some((e) => e.isSub)) && (
                        <td className="py-3 px-3 text-center">
                          {needsManualHC ? (
                            <input
                              type="number"
                              value={entry.manualHandicap}
                              onChange={(e) => updateEntry(entry.teamId, "manualHandicap", e.target.value ? parseInt(e.target.value) : "")}
                              disabled={entry.isDnp}
                              className="w-20 px-2 py-1 border-b border-scorecard-line rounded-none text-center font-mono tabular-nums bg-transparent focus:outline-none focus:border-fairway disabled:bg-surface disabled:text-text-muted"
                            />
                          ) : (
                            <span className="text-text-light text-sm font-sans">Auto</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={entry.isSub}
                          onChange={(e) => updateEntry(entry.teamId, "isSub", e.target.checked)}
                          disabled={entry.isDnp}
                          className="w-4 h-4 accent-fairway rounded"
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={entry.isDnp}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEntries(prev => prev.map(ent =>
                              ent.teamId === entry.teamId
                                ? { ...ent, isDnp: checked, grossScore: checked ? "" : ent.grossScore, manualHandicap: checked ? "" : ent.manualHandicap, isSub: checked ? false : ent.isSub }
                                : ent
                            ));
                          }}
                          className="w-4 h-4 accent-board-red rounded"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <button
              onClick={handlePreview}
              disabled={loading || teams.length === 0}
              className="w-full py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough disabled:opacity-50 transition-colors"
            >
              {loading ? "Calculating..." : "Preview Results"}
            </button>
          </div>
        </div>
      ) : (
        /* Preview Panel */
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-6 text-scorecard-pencil">Preview - Week {preview.weekNumber}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-board-green text-white">
                <tr>
                  <th className="py-3 px-3 font-display uppercase tracking-wider text-sm">Pos</th>
                  <th className="py-3 px-3 font-display uppercase tracking-wider text-sm">Team</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Gross</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Handicap</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Net</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Points</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Bonus</th>
                  <th className="py-3 px-3 text-center font-display uppercase tracking-wider text-sm">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-scorecard-line/40">
                {preview.scores.map((score: WeeklyScorePreviewEntry, idx: number) => {
                  // Check if tied with adjacent
                  const isTied =
                    !score.isDnp &&
                    (preview.scores.some(
                      (s, i) => i !== idx && !s.isDnp && s.position === score.position
                    ));

                  return (
                    <tr
                      key={score.teamId}
                      className={`${score.isDnp ? "bg-surface opacity-60" : idx % 2 === 0 ? "bg-surface" : "bg-scorecard-paper"}`}
                    >
                      <td className="py-3 px-3 font-mono tabular-nums font-medium text-scorecard-pencil">
                        {isTied ? `T${score.position}` : formatScorePosition(score.position, score.isDnp)}
                      </td>
                      <td className="py-3 px-3 font-medium font-sans text-scorecard-pencil">
                        {score.teamName}
                        {score.isSub && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-board-yellow/20 text-warning-text rounded font-display uppercase tracking-wider">SUB</span>
                        )}
                        {score.isDnp && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-bunker/20 text-text-muted rounded font-display uppercase tracking-wider">DNP</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums">{score.isDnp ? "-" : score.grossScore}</td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums">{score.isDnp ? "-" : score.handicap}</td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums font-semibold">
                        {score.isDnp ? "-" : score.netScore.toFixed(1)}
                      </td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums">{score.points.toFixed(1)}</td>
                      <td className="py-3 px-3 text-center font-mono tabular-nums">
                        {score.bonusPoints > 0 ? `+${score.bonusPoints.toFixed(1)}` : "-"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          step="0.5"
                          value={pointOverrides.get(score.teamId) ?? score.totalPoints}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : 0;
                            setPointOverrides((prev) => new Map(prev).set(score.teamId, val));
                          }}
                          className="w-20 px-2 py-1 border-b border-scorecard-line rounded-none text-center font-mono tabular-nums bg-transparent focus:outline-none focus:border-fairway"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-surface text-text-secondary text-sm font-sans">
            Total points this week:{" "}
            <span className="font-mono tabular-nums font-semibold">
              {[...pointOverrides.values()].reduce((sum, v) => sum + v, 0).toFixed(1)}
            </span>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => {
                setPreview(null);
                setMessage(null);
              }}
              className="flex-1 py-3 bg-surface-white text-text-secondary border border-border font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-surface transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-3 bg-board-yellow text-scorecard-pencil font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-board-yellow/80 disabled:opacity-50 transition-colors"
            >
              {loading ? "Submitting..." : `Submit Week ${preview.weekNumber} Scores`}
            </button>
          </div>
        </div>
      )}

      {/* Recent Weeks History */}
      {sortedWeeks.length > 0 && (
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 mt-6 border border-scorecard-line/50">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-scorecard-pencil">Score History</h2>
          <div className="space-y-2">
            {sortedWeeks.map((wk) => {
              const scores = weekGroups.get(wk) || [];
              const isExpanded = expandedWeeks.has(wk);

              return (
                <div key={wk} className="border border-scorecard-line/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setExpandedWeeks((prev) => {
                        const next = new Set(prev);
                        if (next.has(wk)) next.delete(wk);
                        else next.add(wk);
                        return next;
                      });
                    }}
                    className="w-full px-4 py-3 bg-surface text-left font-display font-medium uppercase tracking-wider text-scorecard-pencil flex justify-between items-center hover:bg-surface-warm transition-colors"
                  >
                    <span>Week {wk} <span className="font-sans normal-case tracking-normal text-text-muted text-sm">({scores.filter((s) => !s.isDnp).length} played)</span></span>
                    <span className="text-text-light">{isExpanded ? "\u2212" : "+"}</span>
                  </button>
                  {isExpanded && (
                    <div className="p-4 border-t border-scorecard-line/50">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface">
                          <tr>
                            <th className="py-2 px-3 font-display uppercase tracking-wider text-xs text-text-secondary">Pos</th>
                            <th className="py-2 px-3 font-display uppercase tracking-wider text-xs text-text-secondary">Team</th>
                            <th className="py-2 px-3 text-center font-display uppercase tracking-wider text-xs text-text-secondary">Gross</th>
                            <th className="py-2 px-3 text-center font-display uppercase tracking-wider text-xs text-text-secondary">HC</th>
                            <th className="py-2 px-3 text-center font-display uppercase tracking-wider text-xs text-text-secondary">Net</th>
                            <th className="py-2 px-3 text-center font-display uppercase tracking-wider text-xs text-text-secondary">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-scorecard-line/40">
                          {scores.map((s) => (
                            <tr key={s.id}>
                              <td className="py-2 px-3 font-mono tabular-nums text-scorecard-pencil">{formatScorePosition(s.position, s.isDnp)}</td>
                              <td className="py-2 px-3 font-medium font-sans text-scorecard-pencil">
                                {s.team.name}
                                {s.isSub && <span className="ml-1 text-xs text-warning-text font-display">(S)</span>}
                              </td>
                              <td className="py-2 px-3 text-center font-mono tabular-nums">{s.isDnp ? "-" : s.grossScore}</td>
                              <td className="py-2 px-3 text-center font-mono tabular-nums">{s.isDnp ? "-" : s.handicap}</td>
                              <td className="py-2 px-3 text-center font-mono tabular-nums">{s.isDnp ? "-" : s.netScore.toFixed(1)}</td>
                              <td className="py-2 px-3 text-center font-mono tabular-nums font-semibold text-fairway">{s.points.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-3 text-right">
                        <button
                          onClick={() => setDeleteConfirm({ open: true, weekNumber: wk })}
                          disabled={loading}
                          className="text-board-red hover:text-board-red/90 text-sm font-display font-medium uppercase tracking-wider disabled:opacity-50 transition-colors"
                        >
                          Delete Week {wk}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
