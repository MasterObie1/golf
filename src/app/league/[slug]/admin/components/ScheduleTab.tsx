"use client";

import { useState, useEffect } from "react";
import {
  previewSchedule,
  generateSchedule,
  clearSchedule,
  getSchedule,
  getScheduleStatus,
  swapTeamsInMatchup,
  cancelScheduledMatchup,
  rescheduleMatchup,
  addManualScheduledMatchup,
  updateMatchupStartingHole,
  updateWeekCourseSide,
  assignShotgunStartingHoles,
  type ScheduleWeek,
  type ScheduleStatus,
  type PreviewResult,
} from "@/lib/actions/schedule";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Round } from "@/lib/scheduling/round-robin";
import type { AdminTeam } from "@/lib/types/admin";

interface ScheduleTabProps {
  slug: string;
  leagueId: number;
  teams: AdminTeam[];
  activeSeason: { id: number; name: string } | null;
  playoffWeeks: number;
  onDataRefresh: () => void;
}

export default function ScheduleTab({
  slug,
  leagueId,
  teams,
  activeSeason,
  playoffWeeks,
  onDataRefresh,
}: ScheduleTabProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Schedule data
  const [schedule, setSchedule] = useState<ScheduleWeek[]>([]);
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());

  // Generation form
  const [scheduleType, setScheduleType] = useState<"single_round_robin" | "double_round_robin">("single_round_robin");
  const [totalWeeks, setTotalWeeks] = useState(teams.length > 1 ? teams.length - 1 : 1);
  const [startWeek, setStartWeek] = useState(1);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);

  // Dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Inline editing
  const [editingMatchup, setEditingMatchup] = useState<{
    id: number;
    type: "swap" | "move" | "add";
    weekNumber: number;
    teamAId: number | "";
    teamBId: number | "" | null;
  } | null>(null);
  const [addMatchupWeek, setAddMatchupWeek] = useState<number | null>(null);
  const [addTeamAId, setAddTeamAId] = useState<number | "">("");
  const [addTeamBId, setAddTeamBId] = useState<number | "" | "bye">("");

  // Shotgun start / course side editing
  const [editingStartingHole, setEditingStartingHole] = useState<{ matchupId: number; value: string } | null>(null);
  const [overrideSideWeek, setOverrideSideWeek] = useState<number | null>(null);

  async function loadScheduleData() {
    try {
      const [scheduleData, statusData] = await Promise.all([
        getSchedule(leagueId, activeSeason?.id),
        getScheduleStatus(leagueId, activeSeason?.id),
      ]);
      setSchedule(scheduleData);
      setStatus(statusData);
    } catch (error) {
      console.error("Failed to load schedule:", error);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [scheduleData, statusData] = await Promise.all([
          getSchedule(leagueId, activeSeason?.id),
          getScheduleStatus(leagueId, activeSeason?.id),
        ]);
        if (!cancelled) {
          setSchedule(scheduleData);
          setStatus(statusData);
        }
      } catch (error) {
        console.error("Failed to load schedule:", error);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, activeSeason?.id]);

  // Calculate recommended weeks based on type
  const teamCount = teams.length;
  const evenCount = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  const singleWeeks = evenCount - 1;
  const doubleWeeks = singleWeeks * 2;

  // Sync totalWeeks when team count changes (render-time adjustment)
  const [prevTeamCount, setPrevTeamCount] = useState(teamCount);
  if (prevTeamCount !== teamCount) {
    setPrevTeamCount(teamCount);
    setTotalWeeks(scheduleType === "single_round_robin" ? singleWeeks : doubleWeeks);
  }

  function updateScheduleType(type: "single_round_robin" | "double_round_robin") {
    setScheduleType(type);
    setTotalWeeks(type === "single_round_robin" ? singleWeeks : doubleWeeks);
    setPreviewData(null);
  }

  async function handlePreview() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await previewSchedule(slug, leagueId, { type: scheduleType, totalWeeks, startWeek });
      if (result.success) {
        setPreviewData(result.data);
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handlePreview error:", error);
      setMessage({ type: "error", text: "Failed to preview schedule." });
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await generateSchedule(slug, { type: scheduleType, totalWeeks, startWeek });
      if (result.success) {
        setMessage({ type: "success", text: `Schedule generated: ${result.data.weeksGenerated} weeks.` });
        setPreviewData(null);
        await loadScheduleData();
        onDataRefresh();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleGenerate error:", error);
      setMessage({ type: "error", text: "Failed to generate schedule." });
    }
    setLoading(false);
  }

  async function handleClearSchedule() {
    setConfirmDialog({
      open: true,
      title: "Clear Schedule",
      message: "This will remove all unplayed scheduled matchups. Completed matchups will be preserved. Continue?",
      onConfirm: async () => {
        setConfirmDialog((d) => ({ ...d, open: false }));
        setLoading(true);
        try {
          const result = await clearSchedule(slug);
          if (result.success) {
            setMessage({ type: "success", text: "Schedule cleared." });
            await loadScheduleData();
            onDataRefresh();
          } else {
            setMessage({ type: "error", text: result.error });
          }
        } catch (error) {
          console.error("handleClearSchedule error:", error);
          setMessage({ type: "error", text: "Failed to clear schedule." });
        }
        setLoading(false);
      },
    });
  }

  async function handleCancelMatchup(id: number) {
    setConfirmDialog({
      open: true,
      title: "Cancel Matchup",
      message: "This matchup will be marked as cancelled. Continue?",
      onConfirm: async () => {
        setConfirmDialog((d) => ({ ...d, open: false }));
        setLoading(true);
        try {
          const result = await cancelScheduledMatchup(slug, id);
          if (result.success) {
            setMessage({ type: "success", text: "Matchup cancelled." });
            await loadScheduleData();
          } else {
            setMessage({ type: "error", text: result.error });
          }
        } catch (error) {
          console.error("handleCancelMatchup error:", error);
          setMessage({ type: "error", text: "Failed to cancel matchup." });
        }
        setLoading(false);
      },
    });
  }

  async function handleSwapSave() {
    if (!editingMatchup || editingMatchup.teamAId === "") return;
    setLoading(true);
    try {
      const result = await swapTeamsInMatchup(
        slug,
        editingMatchup.id,
        editingMatchup.teamAId as number,
        editingMatchup.teamBId === "" || editingMatchup.teamBId === null ? null : (editingMatchup.teamBId as number)
      );
      if (result.success) {
        setMessage({ type: "success", text: "Teams swapped." });
        setEditingMatchup(null);
        await loadScheduleData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleSwapSave error:", error);
      setMessage({ type: "error", text: "Failed to swap teams." });
    }
    setLoading(false);
  }

  async function handleMoveSave() {
    if (!editingMatchup) return;
    setLoading(true);
    try {
      const result = await rescheduleMatchup(slug, editingMatchup.id, editingMatchup.weekNumber);
      if (result.success) {
        setMessage({ type: "success", text: "Matchup moved." });
        setEditingMatchup(null);
        await loadScheduleData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleMoveSave error:", error);
      setMessage({ type: "error", text: "Failed to move matchup." });
    }
    setLoading(false);
  }

  async function handleAddMatchup() {
    if (addMatchupWeek === null || addTeamAId === "") return;
    setLoading(true);
    try {
      const result = await addManualScheduledMatchup(
        slug,
        addMatchupWeek,
        addTeamAId as number,
        addTeamBId === "" || addTeamBId === "bye" ? null : (addTeamBId as number)
      );
      if (result.success) {
        setMessage({ type: "success", text: "Matchup added." });
        setAddMatchupWeek(null);
        setAddTeamAId("");
        setAddTeamBId("");
        await loadScheduleData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleAddMatchup error:", error);
      setMessage({ type: "error", text: "Failed to add matchup." });
    }
    setLoading(false);
  }

  async function handleSaveStartingHole(matchupId: number, value: string) {
    setLoading(true);
    try {
      const hole = value === "" ? null : parseInt(value);
      if (hole !== null && isNaN(hole)) {
        setMessage({ type: "error", text: "Invalid hole number." });
        setLoading(false);
        return;
      }
      const result = await updateMatchupStartingHole(slug, matchupId, hole);
      if (result.success) {
        setEditingStartingHole(null);
        await loadScheduleData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleSaveStartingHole error:", error);
      setMessage({ type: "error", text: "Failed to update starting hole." });
    }
    setLoading(false);
  }

  async function handleOverrideSide(weekNumber: number, side: string | null) {
    setLoading(true);
    try {
      const result = await updateWeekCourseSide(slug, weekNumber, side);
      if (result.success) {
        setOverrideSideWeek(null);
        setMessage({ type: "success", text: `Week ${weekNumber} course side updated.` });
        await loadScheduleData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleOverrideSide error:", error);
      setMessage({ type: "error", text: "Failed to override course side." });
    }
    setLoading(false);
  }

  async function handleShotgunAssign(weekNumber: number) {
    const weekMatches = schedule.find((w) => w.weekNumber === weekNumber)?.matches;
    if (!weekMatches) return;

    const scheduledMatches = weekMatches.filter((m) => m.status === "scheduled" && m.teamB);
    if (scheduledMatches.length === 0) {
      setMessage({ type: "error", text: "No scheduled matchups to assign." });
      return;
    }

    // Determine starting hole range based on courseSide
    const side = scheduledMatches[0].courseSide;
    const startHole = side === "back" ? 10 : 1;

    const assignments = scheduledMatches.map((m, i) => ({
      matchupId: m.id,
      startingHole: startHole + i,
    }));

    setLoading(true);
    try {
      const result = await assignShotgunStartingHoles(slug, assignments);
      if (result.success) {
        setMessage({ type: "success", text: `Shotgun start assigned for Week ${weekNumber}.` });
        await loadScheduleData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleShotgunAssign error:", error);
      setMessage({ type: "error", text: "Failed to assign shotgun starting holes." });
    }
    setLoading(false);
  }

  function getTeamName(id: number): string {
    return teams.find((t) => t.id === id)?.name || `Team ${id}`;
  }

  // --- Render ---

  const hasSchedule = status?.hasSchedule ?? false;

  return (
    <>
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Confirm"
        variant="danger"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((d) => ({ ...d, open: false }))}
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

      {/* Generation Form (when no schedule or regenerating) */}
      {!hasSchedule && (
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-scorecard-pencil">Generate Schedule</h2>

          {teams.length < 2 ? (
            <p className="text-text-muted font-sans">Need at least 2 approved teams to generate a schedule.</p>
          ) : (
            <>
              <p className="text-sm text-text-secondary mb-4 font-sans">
                <span className="font-mono tabular-nums">{teamCount}</span> approved teams will be scheduled.
                {playoffWeeks > 0 && (
                  <span className="ml-1 text-warning-text font-display font-medium">
                    {playoffWeeks} playoff week(s) reserved.
                  </span>
                )}
              </p>
              {playoffWeeks > 0 && (
                <div className="mb-4 p-3 bg-warning-bg border border-warning-text/30 rounded-lg text-sm text-warning-text font-sans">
                  {playoffWeeks} week{playoffWeeks !== 1 ? "s" : ""} reserved for playoffs (not yet implemented — these weeks will be empty).
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Schedule Type</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => updateScheduleType("single_round_robin")}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        scheduleType === "single_round_robin"
                          ? "border-fairway bg-fairway/10 text-fairway"
                          : "border-border hover:border-scorecard-line"
                      }`}
                    >
                      <div className="font-display font-semibold text-sm uppercase tracking-wider">Single Round-Robin</div>
                      <div className="text-xs text-text-muted font-mono tabular-nums">{singleWeeks} weeks</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateScheduleType("double_round_robin")}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        scheduleType === "double_round_robin"
                          ? "border-fairway bg-fairway/10 text-fairway"
                          : "border-border hover:border-scorecard-line"
                      }`}
                    >
                      <div className="font-display font-semibold text-sm uppercase tracking-wider">Double Round-Robin</div>
                      <div className="text-xs text-text-muted font-mono tabular-nums">{doubleWeeks} weeks</div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Total Weeks</label>
                    <input
                      type="number"
                      value={totalWeeks}
                      onChange={(e) => setTotalWeeks(parseInt(e.target.value) || 1)}
                      min={1}
                      className="pencil-input w-32 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Start Week</label>
                    <input
                      type="number"
                      value={startWeek}
                      onChange={(e) => setStartWeek(parseInt(e.target.value) || 1)}
                      min={1}
                      className="pencil-input w-32 font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handlePreview}
                    disabled={loading}
                    className="px-6 py-2 bg-surface-white text-text-secondary border border-border rounded-lg hover:bg-surface font-display font-medium uppercase tracking-wider disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Loading..." : "Preview Schedule"}
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="px-6 py-2 bg-fairway text-white rounded-lg hover:bg-rough font-display font-semibold uppercase tracking-wider disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Generating..." : "Generate & Save"}
                  </button>
                </div>
              </div>

              {/* Preview */}
              {previewData && previewData.rounds.length > 0 && (
                <div className="mt-6 border-t border-scorecard-line/50 pt-6">
                  <h3 className="text-lg font-display font-semibold uppercase tracking-wider mb-3 text-scorecard-pencil">Preview (<span className="font-mono tabular-nums">{previewData.rounds.length}</span> weeks)</h3>
                  {previewData.truncated && (
                    <div className="mb-3 p-3 bg-warning-bg border border-warning-text/30 rounded-lg text-sm text-warning-text font-sans">
                      Schedule truncated from {previewData.fullRoundsNeeded} to {previewData.rounds.length} weeks. Some team pairings may be missing.
                    </div>
                  )}
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {previewData.rounds.map((round) => (
                      <div key={round.weekNumber} className="bg-surface rounded-lg p-3">
                        <div className="font-display font-medium text-sm text-text-secondary uppercase tracking-wider mb-2">Week <span className="font-mono tabular-nums">{round.weekNumber}</span></div>
                        <div className="space-y-1">
                          {round.matches.map((match, idx) => (
                            <div key={idx} className="text-sm flex items-center gap-2 font-sans">
                              <span className="font-medium text-scorecard-pencil">{getTeamName(match.teamAId)}</span>
                              {match.teamBId ? (
                                <>
                                  <span className="text-text-light">vs</span>
                                  <span className="font-medium text-scorecard-pencil">{getTeamName(match.teamBId)}</span>
                                </>
                              ) : (
                                <span className="px-2 py-0.5 bg-board-yellow/20 text-warning-text rounded text-xs font-display font-medium uppercase tracking-wider">BYE</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Existing Schedule View */}
      {hasSchedule && status && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-display font-semibold uppercase tracking-wider text-scorecard-pencil">Schedule</h2>
                <p className="text-sm text-text-secondary mt-1 font-sans">
                  {status.scheduleType === "double_round_robin" ? "Double" : "Single"} Round-Robin
                  {" · "}<span className="font-mono tabular-nums">{status.totalWeeks}</span> weeks{" · "}<span className="font-mono tabular-nums">{status.teamCount}</span> teams
                  {" · "}<span className="text-fairway font-mono tabular-nums">{status.completedWeeks} completed</span>
                  {" · "}<span className="text-warning-text font-mono tabular-nums">{status.remainingWeeks} remaining</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: "Regenerate Schedule",
                      message: "This will remove all unplayed matchups and generate a new schedule. Completed matchups are preserved. Continue?",
                      onConfirm: async () => {
                        setConfirmDialog((d) => ({ ...d, open: false }));
                        await handleGenerate();
                      },
                    });
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-warning-bg text-warning-text rounded-lg hover:bg-board-yellow/30 text-sm font-display font-medium uppercase tracking-wider disabled:opacity-50 transition-colors"
                >
                  Regenerate
                </button>
                <button
                  onClick={handleClearSchedule}
                  disabled={loading}
                  className="px-4 py-2 bg-error-bg text-error-text rounded-lg hover:bg-error-bg/80 text-sm font-display font-medium uppercase tracking-wider disabled:opacity-50 transition-colors"
                >
                  Clear Schedule
                </button>
              </div>
            </div>
          </div>

          {/* Week-by-Week View */}
          {schedule.map((week) => {
            const isExpanded = expandedWeeks.has(week.weekNumber);
            const allCompleted = week.matches.every((m) => m.status === "completed");
            const hasCompleted = week.matches.some((m) => m.status === "completed");

            return (
              <div key={week.weekNumber} className="bg-scorecard-paper rounded-lg shadow-lg overflow-hidden border border-scorecard-line/50">
                <button
                  onClick={() => {
                    setExpandedWeeks((prev) => {
                      const next = new Set(prev);
                      if (next.has(week.weekNumber)) next.delete(week.weekNumber);
                      else next.add(week.weekNumber);
                      return next;
                    });
                  }}
                  className={`w-full px-6 py-4 text-left font-display font-medium uppercase tracking-wider flex justify-between items-center hover:bg-surface-warm transition-colors ${
                    allCompleted ? "bg-fairway/10" : hasCompleted ? "bg-warning-bg" : "bg-scorecard-paper"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-scorecard-pencil">Week <span className="font-mono tabular-nums">{week.weekNumber}</span></span>
                    <span className="text-xs text-text-muted font-sans normal-case tracking-normal">
                      <span className="font-mono tabular-nums">{week.matches.length}</span> matchup{week.matches.length !== 1 ? "s" : ""}
                    </span>
                    {week.matches[0]?.courseSide && (
                      <span className={`px-2 py-0.5 rounded text-xs font-display font-medium uppercase tracking-wider ${
                        week.matches[0].courseSide === "front"
                          ? "bg-info-bg text-info-text"
                          : "bg-bunker/30 text-wood"
                      }`}>
                        {week.matches[0].courseSide === "front" ? "Front 9" : "Back 9"}
                      </span>
                    )}
                    {allCompleted && (
                      <span className="px-2 py-0.5 bg-fairway/20 text-fairway rounded text-xs font-display font-medium uppercase tracking-wider">Complete</span>
                    )}
                  </div>
                  <span className="text-text-light">{isExpanded ? "\u2212" : "+"}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-scorecard-line/50 px-6 py-4">
                    {/* Week-level actions */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {overrideSideWeek === week.weekNumber ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-display uppercase tracking-wider text-text-secondary">Side:</span>
                          {(["front", "back", null] as const).map((side) => (
                            <button
                              key={side ?? "none"}
                              onClick={() => handleOverrideSide(week.weekNumber, side)}
                              disabled={loading}
                              className={`text-xs px-2 py-1 rounded border transition-colors font-display uppercase tracking-wider ${
                                week.matches[0]?.courseSide === side
                                  ? "bg-fairway text-white border-fairway"
                                  : "bg-scorecard-paper text-text-secondary border-scorecard-line/50 hover:border-fairway"
                              }`}
                            >
                              {side === "front" ? "Front 9" : side === "back" ? "Back 9" : "Full 18"}
                            </button>
                          ))}
                          <button onClick={() => setOverrideSideWeek(null)} className="text-xs text-text-muted hover:underline font-display uppercase tracking-wider">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOverrideSideWeek(week.weekNumber)}
                          className="text-xs text-water hover:underline font-display uppercase tracking-wider"
                        >
                          Override Side
                        </button>
                      )}
                      <button
                        onClick={() => handleShotgunAssign(week.weekNumber)}
                        disabled={loading}
                        className="text-xs text-warning-text hover:underline font-display uppercase tracking-wider disabled:opacity-50"
                      >
                        Shotgun Assign
                      </button>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-scorecard-line/40">
                        {week.matches.map((match) => (
                          <tr
                            key={match.id}
                            className={`${
                              match.status === "cancelled" ? "opacity-50 line-through" : ""
                            }`}
                          >
                            <td className="py-3 font-medium font-sans text-scorecard-pencil">
                              {match.teamA.name}
                              {!match.teamB && (
                                <span className="ml-2 px-2 py-0.5 bg-board-yellow/20 text-warning-text rounded text-xs font-display font-medium uppercase tracking-wider">BYE</span>
                              )}
                              {match.startingHole && (
                                <span className="ml-2 px-2 py-0.5 bg-putting/20 text-putting rounded text-xs font-mono tabular-nums">
                                  Hole {match.startingHole}
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-text-light text-center w-12 font-sans">
                              {match.teamB ? "vs" : ""}
                            </td>
                            <td className="py-3 font-medium font-sans text-scorecard-pencil">
                              {match.teamB?.name || ""}
                            </td>
                            <td className="py-3 text-center w-24">
                              {match.status === "completed" && match.matchup && (
                                <span className="text-fairway font-mono tabular-nums font-semibold">
                                  {match.matchup.teamAPoints} - {match.matchup.teamBPoints}
                                </span>
                              )}
                              {match.status === "cancelled" && (
                                <span className="text-board-red text-xs font-display uppercase tracking-wider">Cancelled</span>
                              )}
                              {match.status === "scheduled" && (
                                <span className="text-text-light text-xs font-sans">Scheduled</span>
                              )}
                            </td>
                            <td className="py-3 text-right w-32">
                              {match.status === "scheduled" && (
                                <div className="flex gap-1 justify-end">
                                  {editingMatchup?.id === match.id && editingMatchup.type === "swap" ? (
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={editingMatchup.teamAId}
                                        onChange={(e) =>
                                          setEditingMatchup((prev) =>
                                            prev ? { ...prev, teamAId: parseInt(e.target.value) || "" } : null
                                          )
                                        }
                                        className="text-xs px-1 py-1 border-b border-scorecard-line rounded-none bg-transparent focus:outline-none focus:border-fairway font-sans"
                                      >
                                        {teams.map((t) => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                      <span className="text-xs text-text-light font-sans">vs</span>
                                      <select
                                        value={editingMatchup.teamBId ?? ""}
                                        onChange={(e) =>
                                          setEditingMatchup((prev) =>
                                            prev
                                              ? { ...prev, teamBId: e.target.value ? parseInt(e.target.value) : null }
                                              : null
                                          )
                                        }
                                        className="text-xs px-1 py-1 border-b border-scorecard-line rounded-none bg-transparent focus:outline-none focus:border-fairway font-sans"
                                      >
                                        <option value="">BYE</option>
                                        {teams.map((t) => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                      <button onClick={handleSwapSave} className="text-xs text-fairway hover:underline font-display uppercase tracking-wider">Save</button>
                                      <button onClick={() => setEditingMatchup(null)} className="text-xs text-text-muted hover:underline font-display uppercase tracking-wider">Cancel</button>
                                    </div>
                                  ) : editingMatchup?.id === match.id && editingMatchup.type === "move" ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs font-display uppercase tracking-wider text-text-secondary">Week:</span>
                                      <input
                                        type="number"
                                        value={editingMatchup.weekNumber}
                                        onChange={(e) =>
                                          setEditingMatchup((prev) =>
                                            prev ? { ...prev, weekNumber: parseInt(e.target.value) || 1 } : null
                                          )
                                        }
                                        min={1}
                                        className="w-16 text-xs px-1 py-1 border-b border-scorecard-line rounded-none bg-transparent text-center font-mono tabular-nums focus:outline-none focus:border-fairway"
                                      />
                                      <button onClick={handleMoveSave} className="text-xs text-fairway hover:underline font-display uppercase tracking-wider">Save</button>
                                      <button onClick={() => setEditingMatchup(null)} className="text-xs text-text-muted hover:underline font-display uppercase tracking-wider">Cancel</button>
                                    </div>
                                  ) : (
                                    <>
                                      {editingStartingHole?.matchupId === match.id ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            value={editingStartingHole.value}
                                            onChange={(e) => setEditingStartingHole({ matchupId: match.id, value: e.target.value })}
                                            min={1}
                                            max={18}
                                            className="w-12 text-xs px-1 py-1 border-b border-scorecard-line rounded-none bg-transparent text-center font-mono tabular-nums focus:outline-none focus:border-fairway"
                                            placeholder="#"
                                          />
                                          <button onClick={() => handleSaveStartingHole(match.id, editingStartingHole.value)} className="text-xs text-fairway hover:underline font-display uppercase tracking-wider">Save</button>
                                          <button onClick={() => setEditingStartingHole(null)} className="text-xs text-text-muted hover:underline font-display uppercase tracking-wider">X</button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setEditingStartingHole({ matchupId: match.id, value: match.startingHole?.toString() ?? "" })}
                                          className="text-xs text-putting hover:underline font-display uppercase tracking-wider"
                                        >
                                          Hole
                                        </button>
                                      )}
                                      <button
                                        onClick={() =>
                                          setEditingMatchup({
                                            id: match.id,
                                            type: "swap",
                                            weekNumber: week.weekNumber,
                                            teamAId: match.teamA.id,
                                            teamBId: match.teamB?.id ?? null,
                                          })
                                        }
                                        className="text-xs text-water hover:underline font-display uppercase tracking-wider"
                                      >
                                        Swap
                                      </button>
                                      <button
                                        onClick={() =>
                                          setEditingMatchup({
                                            id: match.id,
                                            type: "move",
                                            weekNumber: week.weekNumber,
                                            teamAId: match.teamA.id,
                                            teamBId: match.teamB?.id ?? null,
                                          })
                                        }
                                        className="text-xs text-warning-text hover:underline font-display uppercase tracking-wider"
                                      >
                                        Move
                                      </button>
                                      <button
                                        onClick={() => handleCancelMatchup(match.id)}
                                        className="text-xs text-board-red hover:underline font-display uppercase tracking-wider"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Add Matchup */}
                    {addMatchupWeek === week.weekNumber ? (
                      <div className="mt-3 pt-3 border-t border-scorecard-line/50 flex items-center gap-2 flex-wrap">
                        <select
                          value={addTeamAId}
                          onChange={(e) => setAddTeamAId(e.target.value ? parseInt(e.target.value) : "")}
                          className="text-sm px-2 py-1 border-b border-scorecard-line rounded-none bg-transparent focus:outline-none focus:border-fairway font-sans"
                        >
                          <option value="">Team A</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <span className="text-text-light text-sm font-sans">vs</span>
                        <select
                          value={addTeamBId}
                          onChange={(e) => setAddTeamBId(e.target.value === "bye" ? "bye" : e.target.value ? parseInt(e.target.value) : "")}
                          className="text-sm px-2 py-1 border-b border-scorecard-line rounded-none bg-transparent focus:outline-none focus:border-fairway font-sans"
                        >
                          <option value="">Team B</option>
                          <option value="bye">BYE</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button onClick={handleAddMatchup} disabled={loading || addTeamAId === ""} className="text-sm text-fairway hover:underline font-display uppercase tracking-wider disabled:opacity-50">
                          Add
                        </button>
                        <button onClick={() => { setAddMatchupWeek(null); setAddTeamAId(""); setAddTeamBId(""); }} className="text-sm text-text-muted hover:underline font-display uppercase tracking-wider">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddMatchupWeek(week.weekNumber)}
                        className="mt-3 text-sm text-fairway hover:underline font-display uppercase tracking-wider"
                      >
                        + Add matchup
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
