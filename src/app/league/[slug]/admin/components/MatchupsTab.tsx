"use client";

import { useState, useEffect, useRef } from "react";
import {
  previewMatchup,
  submitMatchup,
  submitForfeit,
  deleteMatchup,
  getMatchupHistory,
  type MatchupPreview,
} from "@/lib/actions/matchups";
import {
  getSchedule,
  getScheduleForWeek,
  type ScheduleMatchDetail,
  type ScheduleWeek,
} from "@/lib/actions/schedule";
import { getApprovedScorecardScoresForWeek } from "@/lib/actions/scorecards";
import WeekPillSelector from "@/components/WeekPillSelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { AdminTeam, AdminMatchup } from "@/lib/types/admin";

interface MatchupsTabProps {
  slug: string;
  leagueId: number;
  teams: AdminTeam[];
  matchups: AdminMatchup[];
  weekNumber: number;
  onDataRefresh: (data: { weekNumber?: number; matchups?: AdminMatchup[] }) => void;
}

export default function MatchupsTab({
  slug,
  leagueId,
  teams,
  matchups,
  weekNumber: initialWeekNumber,
  onDataRefresh,
}: MatchupsTabProps) {
  // Form state
  const [teamAId, setTeamAId] = useState<number | "">("");
  const [teamBId, setTeamBId] = useState<number | "">("");
  const [teamAGross, setTeamAGross] = useState<number | "">("");
  const [teamBGross, setTeamBGross] = useState<number | "">("");
  const [teamAHandicapManual, setTeamAHandicapManual] = useState<number | "">("");
  const [teamBHandicapManual, setTeamBHandicapManual] = useState<number | "">("");
  const [teamAIsSub, setTeamAIsSub] = useState(false);
  const [teamBIsSub, setTeamBIsSub] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<MatchupPreview | null>(null);
  const [teamAPointsOverride, setTeamAPointsOverride] = useState<number | "">("");
  const [teamBPointsOverride, setTeamBPointsOverride] = useState<number | "">("");

  // Forfeit state
  const [isForfeitMode, setIsForfeitMode] = useState(false);
  const [winningTeamId, setWinningTeamId] = useState<number | "">("");
  const [forfeitingTeamId, setForfeitingTeamId] = useState<number | "">("");

  // Week number (local)
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber);

  // Schedule context
  const [scheduleMatches, setScheduleMatches] = useState<ScheduleMatchDetail[]>([]);
  const [fullSchedule, setFullSchedule] = useState<ScheduleWeek[]>([]);
  const initialDefaultApplied = useRef(false);

  // Scorecard scores for mismatch indicators (teamId → grossTotal)
  const [scorecardScores, setScorecardScores] = useState<Record<number, number>>({});

  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; matchupId: number }>({ open: false, matchupId: 0 });

  const entryFormRef = useRef<HTMLDivElement>(null);

  const isWeekOne = weekNumber === 1;

  // Reset form fields when week number changes
  function changeWeek(newWeek: number) {
    if (newWeek === weekNumber) return;
    setWeekNumber(newWeek);
    setTeamAId("");
    setTeamBId("");
    setTeamAGross("");
    setTeamBGross("");
    setTeamAHandicapManual("");
    setTeamBHandicapManual("");
    setTeamAIsSub(false);
    setTeamBIsSub(false);
    setPreview(null);
    setIsForfeitMode(false);
    setWinningTeamId("");
    setForfeitingTeamId("");
    setMessage(null);
  }

  // Load schedule for current week
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getScheduleForWeek(leagueId, weekNumber);
        if (!cancelled) setScheduleMatches(data);
      } catch (error) {
        console.error("loadScheduleForWeek error:", error);
        if (!cancelled) setScheduleMatches([]);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, weekNumber]);

  // Load approved scorecard scores for mismatch indicators
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getApprovedScorecardScoresForWeek(leagueId, weekNumber);
        if (!cancelled) {
          const map: Record<number, number> = {};
          for (const s of data) map[s.teamId] = s.grossTotal;
          setScorecardScores(map);
        }
      } catch (error) {
        console.error("loadScorecardScores error:", error);
        if (!cancelled) setScorecardScores({});
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, weekNumber]);

  // Load full schedule for week pills and default week
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getSchedule(leagueId);
        if (!cancelled) {
          setFullSchedule(data);
          // Default to first incomplete week on initial load
          if (!initialDefaultApplied.current && data.length > 0) {
            initialDefaultApplied.current = true;
            const firstIncomplete = data.find((w) =>
              w.matches.some((m) => m.teamB !== null && !m.matchup)
            );
            const targetWeek = firstIncomplete?.weekNumber ?? data[data.length - 1].weekNumber;
            if (targetWeek !== weekNumber) {
              changeWeek(targetWeek);
              onDataRefresh({ weekNumber: targetWeek });
            }
          }
        }
      } catch (error) {
        console.error("loadFullSchedule error:", error);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  // Derived: total weeks and completed weeks for pill selector
  const totalWeeks = Math.max(fullSchedule.length, weekNumber);
  const completedWeeks = new Set(
    fullSchedule
      .filter((w) => {
        const nonByeMatches = w.matches.filter((m) => m.teamB !== null);
        return nonByeMatches.length > 0 && nonByeMatches.every((m) => m.matchup);
      })
      .map((w) => w.weekNumber)
  );

  // Check if selected teams match the schedule
  const isOffSchedule = (() => {
    if (scheduleMatches.length === 0 || teamAId === "" || teamBId === "") return false;
    return !scheduleMatches.some(
      (m) =>
        (m.teamA.id === teamAId && m.teamB?.id === teamBId) ||
        (m.teamA.id === teamBId && m.teamB?.id === teamAId)
    );
  })();

  // Count completed matches for this week
  const completedScheduleCount = scheduleMatches.filter((m) => m.status === "completed").length;
  const totalScheduleMatches = scheduleMatches.filter((m) => m.teamB !== null).length;

  function handleEnterScores(match: ScheduleMatchDetail) {
    setTeamAId(match.teamA.id);
    setTeamBId(match.teamB?.id ?? "");
    setTeamAGross("");
    setTeamBGross("");
    setTeamAHandicapManual("");
    setTeamBHandicapManual("");
    setTeamAIsSub(false);
    setTeamBIsSub(false);
    setPreview(null);
    setIsForfeitMode(false);
    setMessage(null);
    setTimeout(() => {
      entryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function handlePreview() {
    if (teamAId === "" || teamBId === "" || teamAGross === "" || teamBGross === "") {
      setMessage({ type: "error", text: "Please fill in all required fields." });
      return;
    }
    if (teamAId === teamBId) {
      setMessage({ type: "error", text: "Please select two different teams." });
      return;
    }
    if (isWeekOne && (teamAHandicapManual === "" || teamBHandicapManual === "")) {
      setMessage({ type: "error", text: "Week 1 requires manual handicap entry." });
      return;
    }
    if (teamAIsSub && teamAHandicapManual === "") {
      setMessage({ type: "error", text: "Substitute players require manual handicap entry." });
      return;
    }
    if (teamBIsSub && teamBHandicapManual === "") {
      setMessage({ type: "error", text: "Substitute players require manual handicap entry." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await previewMatchup(
        slug,
        weekNumber,
        teamAId as number,
        teamAGross as number,
        (isWeekOne || teamAIsSub) ? (teamAHandicapManual as number) : null,
        teamAIsSub,
        teamBId as number,
        teamBGross as number,
        (isWeekOne || teamBIsSub) ? (teamBHandicapManual as number) : null,
        teamBIsSub
      );
      if (result.success) {
        setPreview(result.data);
        setTeamAPointsOverride(result.data.teamAPoints);
        setTeamBPointsOverride(result.data.teamBPoints);
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handlePreview error:", error);
      setMessage({ type: "error", text: "Failed to generate preview. Please try again." });
    }
    setLoading(false);
  }

  async function refreshData() {
    const [matchupsResult, fullScheduleData] = await Promise.all([
      getMatchupHistory(leagueId),
      getSchedule(leagueId),
    ]);
    onDataRefresh({ matchups: matchupsResult.matchups });
    setFullSchedule(fullScheduleData);

    // Find the first week that still has incomplete (non-bye) matches
    const firstIncompleteWeek = fullScheduleData.find((week) =>
      week.matches.some((m) => m.teamB !== null && m.status !== "completed" && m.status !== "cancelled")
    );

    const targetWeek = firstIncompleteWeek?.weekNumber ?? weekNumber;
    if (targetWeek !== weekNumber) {
      changeWeek(targetWeek);
      onDataRefresh({ weekNumber: targetWeek, matchups: matchupsResult.matchups });
    }

    // Refresh schedule and scorecard scores for the target week
    try {
      const [scheduleData, scorecardData] = await Promise.all([
        getScheduleForWeek(leagueId, targetWeek),
        getApprovedScorecardScoresForWeek(leagueId, targetWeek),
      ]);
      setScheduleMatches(scheduleData);
      const map: Record<number, number> = {};
      for (const s of scorecardData) map[s.teamId] = s.grossTotal;
      setScorecardScores(map);
    } catch (error) {
      console.error("refreshData schedule error:", error);
      setScheduleMatches([]);
    }
  }

  async function handleSubmit() {
    if (!preview) return;

    setLoading(true);
    try {
      const result = await submitMatchup(
        slug,
        preview.weekNumber,
        preview.teamAId,
        preview.teamAGross,
        preview.teamAHandicap,
        preview.teamANet,
        typeof teamAPointsOverride === "number" ? teamAPointsOverride : preview.teamAPoints,
        preview.teamAIsSub,
        preview.teamBId,
        preview.teamBGross,
        preview.teamBHandicap,
        preview.teamBNet,
        typeof teamBPointsOverride === "number" ? teamBPointsOverride : preview.teamBPoints,
        preview.teamBIsSub
      );
      if (result.success) {
        setMessage({ type: "success", text: "Matchup submitted successfully!" });
        setPreview(null);
        setTeamAId("");
        setTeamBId("");
        setTeamAGross("");
        setTeamBGross("");
        setTeamAHandicapManual("");
        setTeamBHandicapManual("");
        setTeamAIsSub(false);
        setTeamBIsSub(false);
        await refreshData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleSubmit error:", error);
      setMessage({ type: "error", text: "Failed to submit matchup. Please try again." });
    }
    setLoading(false);
  }

  function handleCancelPreview() {
    setPreview(null);
    setMessage(null);
  }

  async function handleSubmitForfeit() {
    if (winningTeamId === "" || forfeitingTeamId === "") {
      setMessage({ type: "error", text: "Please select both teams." });
      return;
    }
    if (winningTeamId === forfeitingTeamId) {
      setMessage({ type: "error", text: "Please select two different teams." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await submitForfeit(slug, weekNumber, winningTeamId as number, forfeitingTeamId as number);
      if (result.success) {
        setMessage({ type: "success", text: "Forfeit recorded successfully!" });
        setWinningTeamId("");
        setForfeitingTeamId("");
        setIsForfeitMode(false);
        await refreshData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleSubmitForfeit error:", error);
      setMessage({ type: "error", text: "Failed to record forfeit. Please try again." });
    }
    setLoading(false);
  }

  function handleDeleteMatchup(matchupId: number) {
    setDeleteConfirm({ open: true, matchupId });
  }

  async function executeDeleteMatchup() {
    const { matchupId } = deleteConfirm;
    setDeleteConfirm({ open: false, matchupId: 0 });
    setLoading(true);
    try {
      const result = await deleteMatchup(slug, matchupId);
      if (result.success) {
        setMessage({ type: "success", text: "Matchup deleted successfully!" });
        await refreshData();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("executeDeleteMatchup error:", error);
      setMessage({ type: "error", text: "Failed to delete matchup. Please try again." });
    }
    setLoading(false);
  }

  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Matchup"
        message="Are you sure you want to delete this matchup? Team stats will be reversed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeDeleteMatchup}
        onCancel={() => setDeleteConfirm({ open: false, matchupId: 0 })}
      />
      {/* Week Selector */}
      <div className="mb-6">
        <WeekPillSelector
          totalWeeks={totalWeeks}
          selectedWeek={weekNumber}
          onWeekChange={changeWeek}
          completedWeeks={completedWeeks}
        />
        {isWeekOne && (
          <p className="mt-2 text-sm font-sans text-warning-text font-medium">
            Manual handicap entry required
          </p>
        )}
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg font-sans ${
            message.type === "success"
              ? "bg-fairway/10 border border-fairway/30 text-fairway"
              : "bg-error-bg border border-error-border text-error-text"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Schedule Context */}
      {scheduleMatches.length > 0 && !preview && (
        <div className="bg-scorecard-paper rounded-lg shadow-md p-6 mb-6 border border-info-border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-display font-semibold uppercase tracking-wider text-text-primary">
              This Week&apos;s Schedule (Week {weekNumber})
            </h2>
            {totalScheduleMatches > 0 && (
              <span className="text-sm font-sans text-text-muted">
                {completedScheduleCount} of {totalScheduleMatches} matches entered
              </span>
            )}
          </div>
          <div className="space-y-2">
            {scheduleMatches.map((match) => (
              <div
                key={match.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  match.status === "completed"
                    ? "bg-success-bg border border-success-border"
                    : match.status === "cancelled"
                    ? "bg-surface border border-border opacity-50"
                    : "bg-info-bg border border-info-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  {match.status === "completed" && (
                    <svg className="w-5 h-5 text-fairway" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="font-sans font-medium text-text-primary">
                    {match.teamA.name}
                  </span>
                  {match.teamB ? (
                    <>
                      <span className="text-text-light">vs</span>
                      <span className="font-sans font-medium text-text-primary">
                        {match.teamB.name}
                      </span>
                    </>
                  ) : (
                    <span className="px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">
                      BYE
                    </span>
                  )}
                  {match.status === "completed" && match.matchup && (
                    <span className="text-sm font-mono tabular-nums text-fairway ml-2">
                      ({match.matchup.teamAPoints} - {match.matchup.teamBPoints})
                    </span>
                  )}
                </div>
                {match.status === "scheduled" && match.teamB && (
                  <button
                    onClick={() => handleEnterScores(match)}
                    className="px-3 py-1.5 text-sm font-display font-semibold uppercase tracking-wider bg-fairway text-white rounded-lg hover:bg-rough"
                  >
                    Enter Scores
                  </button>
                )}
                {match.status === "cancelled" && (
                  <span className="text-xs font-display font-medium uppercase tracking-wider text-text-light">CANCELLED</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matchup Entry Form */}
      {!preview ? (
        <div ref={entryFormRef} className="bg-scorecard-paper rounded-lg shadow-md p-6 border border-border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-display font-semibold uppercase tracking-wider text-text-primary">
              {isForfeitMode ? "Record Forfeit" : "Enter Matchup Results"}
            </h2>
            <button
              onClick={() => {
                setIsForfeitMode(!isForfeitMode);
                setMessage(null);
              }}
              className={`px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider rounded-lg ${
                isForfeitMode
                  ? "bg-error-bg text-board-red hover:bg-error-bg/80"
                  : "bg-bunker/20 text-text-secondary hover:bg-bunker/30"
              }`}
            >
              {isForfeitMode ? "Cancel Forfeit" : "Record Forfeit"}
            </button>
          </div>

          {/* Off-schedule warning */}
          {isOffSchedule && !isForfeitMode && (
            <div className="mb-4 p-3 bg-warning-bg border border-warning-border rounded-lg">
              <p className="text-sm font-sans text-warning-text">
                This matchup is not on this week&apos;s schedule. You can still submit it.
              </p>
            </div>
          )}

          {isForfeitMode ? (
            <div className="space-y-6">
              <div className="bg-error-bg border border-error-border rounded-lg p-4">
                <p className="text-sm font-sans text-error-text">
                  A forfeit awards 20 points to the winning team and 0 points to the forfeiting team.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-success-bg rounded-lg border border-success-border">
                  <label className="block font-display font-medium text-fairway uppercase tracking-wider text-sm mb-2">
                    Winning Team (receives 20 pts)
                  </label>
                  <select
                    value={winningTeamId}
                    onChange={(e) => setWinningTeamId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full pencil-input"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 bg-error-bg rounded-lg border border-error-border">
                  <label className="block font-display font-medium text-board-red uppercase tracking-wider text-sm mb-2">
                    Forfeiting Team (receives 0 pts)
                  </label>
                  <select
                    value={forfeitingTeamId}
                    onChange={(e) => setForfeitingTeamId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full pencil-input"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleSubmitForfeit}
                disabled={loading || teams.length < 2}
                className="w-full py-3 bg-board-red text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-board-red/90 disabled:opacity-50"
              >
                {loading ? "Recording..." : "Record Forfeit"}
              </button>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-8">
                {/* Team A */}
                <div className="space-y-4 p-4 bg-surface rounded-lg border border-border">
                  <h3 className="font-display font-semibold text-lg uppercase tracking-wider text-fairway">Team A</h3>
                  <div>
                    <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                      Select Team
                    </label>
                    <select
                      value={teamAId}
                      onChange={(e) => setTeamAId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full pencil-input"
                    >
                      <option value="">-- Select Team --</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                      Gross Score
                    </label>
                    <input
                      type="number"
                      value={teamAGross}
                      onChange={(e) => setTeamAGross(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full pencil-input"
                    />
                    {teamAId !== "" && teamAGross !== "" && scorecardScores[teamAId] != null && (
                      <div className={`mt-1 flex items-center gap-1 text-xs font-sans ${teamAGross === scorecardScores[teamAId] ? "text-fairway" : "text-warning-text"}`}>
                        {teamAGross === scorecardScores[teamAId] ? (
                          <>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span>Matches scorecard</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>Scorecard has {scorecardScores[teamAId]}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {(isWeekOne || teamAIsSub) && (
                    <div>
                      <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                        Handicap (Manual)
                      </label>
                      <input
                        type="number"
                        value={teamAHandicapManual}
                        onChange={(e) => setTeamAHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                        className="w-full pencil-input"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="teamAIsSub"
                      checked={teamAIsSub}
                      onChange={(e) => setTeamAIsSub(e.target.checked)}
                      className="w-4 h-4 text-fairway accent-fairway"
                    />
                    <label htmlFor="teamAIsSub" className="text-sm font-sans text-text-secondary">
                      Substitute played
                    </label>
                  </div>
                </div>

                {/* Team B */}
                <div className="space-y-4 p-4 bg-surface rounded-lg border border-border">
                  <h3 className="font-display font-semibold text-lg uppercase tracking-wider text-fairway">Team B</h3>
                  <div>
                    <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                      Select Team
                    </label>
                    <select
                      value={teamBId}
                      onChange={(e) => setTeamBId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full pencil-input"
                    >
                      <option value="">-- Select Team --</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                      Gross Score
                    </label>
                    <input
                      type="number"
                      value={teamBGross}
                      onChange={(e) => setTeamBGross(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full pencil-input"
                    />
                    {teamBId !== "" && teamBGross !== "" && scorecardScores[teamBId] != null && (
                      <div className={`mt-1 flex items-center gap-1 text-xs font-sans ${teamBGross === scorecardScores[teamBId] ? "text-fairway" : "text-warning-text"}`}>
                        {teamBGross === scorecardScores[teamBId] ? (
                          <>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span>Matches scorecard</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>Scorecard has {scorecardScores[teamBId]}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {(isWeekOne || teamBIsSub) && (
                    <div>
                      <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                        Handicap (Manual)
                      </label>
                      <input
                        type="number"
                        value={teamBHandicapManual}
                        onChange={(e) => setTeamBHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                        className="w-full pencil-input"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="teamBIsSub"
                      checked={teamBIsSub}
                      onChange={(e) => setTeamBIsSub(e.target.checked)}
                      className="w-4 h-4 text-fairway accent-fairway"
                    />
                    <label htmlFor="teamBIsSub" className="text-sm font-sans text-text-secondary">
                      Substitute played
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button
                  onClick={handlePreview}
                  disabled={loading || teams.length < 2}
                  className="w-full py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Preview Results"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Preview Panel */
        <div className="bg-scorecard-paper rounded-lg shadow-md p-6 border border-border">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-6 text-text-primary">Preview - Week {preview.weekNumber}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans">
              <thead className="bg-rough text-white">
                <tr>
                  <th className="py-3 px-4 font-display font-semibold uppercase tracking-wider text-sm">Team</th>
                  <th className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-sm">Gross</th>
                  <th className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-sm">Handicap</th>
                  <th className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-sm">Net</th>
                  <th className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-sm">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-scorecard-line/40">
                <tr className="bg-surface">
                  <td className="py-3 px-4 font-sans font-medium text-text-primary">
                    {preview.teamAName}
                    {preview.teamAIsSub && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">SUB</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums">{preview.teamAGross}</td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums">{preview.teamAHandicap}</td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums font-semibold">{preview.teamANet.toFixed(1)}</td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number"
                      step="0.5"
                      value={teamAPointsOverride}
                      onChange={(e) => setTeamAPointsOverride(e.target.value ? parseFloat(e.target.value) : "")}
                      className="w-20 pencil-input text-center"
                    />
                  </td>
                </tr>
                <tr className="bg-scorecard-paper">
                  <td className="py-3 px-4 font-sans font-medium text-text-primary">
                    {preview.teamBName}
                    {preview.teamBIsSub && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">SUB</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums">{preview.teamBGross}</td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums">{preview.teamBHandicap}</td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums font-semibold">{preview.teamBNet.toFixed(1)}</td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number"
                      step="0.5"
                      value={teamBPointsOverride}
                      onChange={(e) => setTeamBPointsOverride(e.target.value ? parseFloat(e.target.value) : "")}
                      className="w-20 pencil-input text-center"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {teamAPointsOverride !== "" && teamBPointsOverride !== "" && (
            <div className={`mt-4 p-3 rounded-lg font-mono tabular-nums ${
              Number(teamAPointsOverride) + Number(teamBPointsOverride) === 20
                ? "bg-fairway/10 border border-fairway/30 text-fairway"
                : "bg-error-bg border border-error-border text-error-text"
            }`}>
              Total: {Number(teamAPointsOverride) + Number(teamBPointsOverride)} / 20 points
              {Number(teamAPointsOverride) + Number(teamBPointsOverride) !== 20 && (
                <span className="ml-2 font-sans font-medium">(Must equal 20)</span>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleCancelPreview}
              className="flex-1 py-3 bg-bunker/20 text-text-primary font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-bunker/30"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                loading ||
                teamAPointsOverride === "" ||
                teamBPointsOverride === "" ||
                Number(teamAPointsOverride) + Number(teamBPointsOverride) !== 20
              }
              className="flex-1 py-3 bg-board-yellow text-text-primary font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-wood hover:text-white disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Matchup"}
            </button>
          </div>
        </div>
      )}

      {/* Recent Matchups */}
      {matchups.length > 0 && (
        <div className="bg-scorecard-paper rounded-lg shadow-md p-6 mt-6 border border-border">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-text-primary">Recent Matchups</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans">
              <thead className="bg-rough text-white">
                <tr>
                  <th className="py-2 px-3 font-display font-semibold uppercase tracking-wider text-sm">Week</th>
                  <th className="py-2 px-3 font-display font-semibold uppercase tracking-wider text-sm">Team A</th>
                  <th className="py-2 px-3 text-center font-display font-semibold uppercase tracking-wider text-sm">Pts</th>
                  <th className="py-2 px-3 font-display font-semibold uppercase tracking-wider text-sm">Team B</th>
                  <th className="py-2 px-3 text-center font-display font-semibold uppercase tracking-wider text-sm">Pts</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-scorecard-line/40">
                {matchups.slice(0, 10).map((matchup) => {
                  const teamAScorecard = matchup.weekNumber === weekNumber ? scorecardScores[matchup.teamAId] : undefined;
                  const teamBScorecard = matchup.weekNumber === weekNumber ? scorecardScores[matchup.teamBId] : undefined;
                  const teamAMismatch = teamAScorecard != null && teamAScorecard !== matchup.teamAGross;
                  const teamBMismatch = teamBScorecard != null && teamBScorecard !== matchup.teamBGross;
                  return (
                  <tr key={matchup.id} className="hover:bg-surface">
                    <td className="py-2 px-3 font-mono tabular-nums text-text-secondary">{matchup.weekNumber}</td>
                    <td className="py-2 px-3 font-sans font-medium text-text-primary">
                      {matchup.teamA.name}
                      {teamAMismatch && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-sans font-medium text-warning-text bg-warning-bg rounded" title={`Matchup gross (${matchup.teamAGross}) differs from scorecard (${teamAScorecard})`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Card: {teamAScorecard}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums font-semibold text-fairway">{matchup.teamAPoints}</td>
                    <td className="py-2 px-3 font-sans font-medium text-text-primary">
                      {matchup.teamB.name}
                      {teamBMismatch && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-sans font-medium text-warning-text bg-warning-bg rounded" title={`Matchup gross (${matchup.teamBGross}) differs from scorecard (${teamBScorecard})`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Card: {teamBScorecard}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums font-semibold text-fairway">{matchup.teamBPoints}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleDeleteMatchup(matchup.id)}
                        disabled={loading}
                        className="text-board-red hover:text-board-red/90 text-sm font-display font-medium uppercase tracking-wider disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
