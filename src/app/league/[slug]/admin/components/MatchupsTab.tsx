"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, CircleCheck, TriangleAlert } from "lucide-react";
import {
  previewMatchup,
  submitMatchup,
  submitForfeit,
  deleteMatchup,
  getMatchupHistory,
  type MatchupPreview,
} from "@/lib/actions/matchups";
import MatchupEditRow from "./MatchupEditRow";
import {
  getSchedule,
  getScheduleForWeek,
  type ScheduleMatchDetail,
  type ScheduleWeek,
} from "@/lib/actions/schedule";
import { getApprovedScorecardScoresForWeek } from "@/lib/actions/scorecards";
import WeekPillSelector from "@/components/WeekPillSelector";
import { notify } from "@/lib/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/composite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; matchupId: number }>({ open: false, matchupId: 0 });
  const [editingMatchupId, setEditingMatchupId] = useState<number | null>(null);

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
    setTimeout(() => {
      entryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function handlePreview() {
    if (teamAId === "" || teamBId === "" || teamAGross === "" || teamBGross === "") {
      notify.error("Please fill in all required fields.");
      return;
    }
    if (teamAId === teamBId) {
      notify.error("Please select two different teams.");
      return;
    }
    if (isWeekOne && (teamAHandicapManual === "" || teamBHandicapManual === "")) {
      notify.error("Week 1 requires manual handicap entry.");
      return;
    }
    if (teamAIsSub && teamAHandicapManual === "") {
      notify.error("Substitute players require manual handicap entry.");
      return;
    }
    if (teamBIsSub && teamBHandicapManual === "") {
      notify.error("Substitute players require manual handicap entry.");
      return;
    }

    setLoading(true);
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
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handlePreview error:", error);
      notify.error("Failed to generate preview. Please try again.");
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
        notify.success("Matchup submitted successfully!");
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
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleSubmit error:", error);
      notify.error("Failed to submit matchup. Please try again.");
    }
    setLoading(false);
  }

  function handleCancelPreview() {
    setPreview(null);
  }

  async function handleSubmitForfeit() {
    if (winningTeamId === "" || forfeitingTeamId === "") {
      notify.error("Please select both teams.");
      return;
    }
    if (winningTeamId === forfeitingTeamId) {
      notify.error("Please select two different teams.");
      return;
    }

    setLoading(true);
    try {
      const result = await submitForfeit(slug, weekNumber, winningTeamId as number, forfeitingTeamId as number);
      if (result.success) {
        notify.success("Forfeit recorded successfully!");
        setWinningTeamId("");
        setForfeitingTeamId("");
        setIsForfeitMode(false);
        await refreshData();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleSubmitForfeit error:", error);
      notify.error("Failed to record forfeit. Please try again.");
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
        notify.success("Matchup deleted successfully!");
        await refreshData();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("executeDeleteMatchup error:", error);
      notify.error("Failed to delete matchup. Please try again.");
    }
    setLoading(false);
  }

  return (
    <>
      <AlertDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm({ open: false, matchupId: 0 });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Matchup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this matchup? Team stats will be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm({ open: false, matchupId: 0 })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={executeDeleteMatchup}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                    <CircleCheck className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
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
                    <span className="text-sm font-mono tabular-nums text-primary ml-2">
                      ({match.matchup.teamAPoints} - {match.matchup.teamBPoints})
                    </span>
                  )}
                </div>
                {match.status === "scheduled" && match.teamB && (
                  <Button size="sm" onClick={() => handleEnterScores(match)}>
                    Enter Scores
                  </Button>
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
            <Button
              variant={isForfeitMode ? "destructive" : "secondary"}
              onClick={() => {
                setIsForfeitMode(!isForfeitMode);
              }}
            >
              {isForfeitMode ? "Cancel Forfeit" : "Record Forfeit"}
            </Button>
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
                  <label className="block font-display font-medium text-primary uppercase tracking-wider text-sm mb-2">
                    Winning Team (receives 20 pts)
                  </label>
                  <select
                    value={winningTeamId}
                    onChange={(e) => setWinningTeamId(e.target.value ? parseInt(e.target.value) : "")}
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
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
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <SubmitButton
                type="button"
                variant="destructive"
                pending={loading}
                onClick={handleSubmitForfeit}
                disabled={loading || teams.length < 2}
                className="w-full"
              >
                {loading ? "Recording..." : "Record Forfeit"}
              </SubmitButton>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-8">
                {/* Team A */}
                <div className="space-y-4 p-4 bg-surface rounded-lg border border-border">
                  <h3 className="font-display font-semibold text-lg uppercase tracking-wider text-primary">Team A</h3>
                  <div>
                    <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                      Select Team
                    </label>
                    <select
                      value={teamAId}
                      onChange={(e) => setTeamAId(e.target.value ? parseInt(e.target.value) : "")}
                      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
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
                    {(() => {
                      const hasMismatch = teamAId !== "" && teamAGross !== "" && scorecardScores[teamAId as number] != null && teamAGross !== scorecardScores[teamAId as number];
                      return (
                        <>
                          <input
                            type="number"
                            value={teamAGross}
                            onChange={(e) => setTeamAGross(e.target.value ? parseInt(e.target.value) : "")}
                            className={`w-full pencil-input ${hasMismatch ? "!border-board-red !ring-1 !ring-board-red/30" : ""}`}
                          />
                          {teamAId !== "" && teamAGross !== "" && scorecardScores[teamAId as number] != null && (
                            teamAGross === scorecardScores[teamAId as number] ? (
                              <div className="mt-1 flex items-center gap-1 text-xs font-sans text-primary">
                                <Check className="size-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                                <span>Matches scorecard</span>
                              </div>
                            ) : (
                              <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-sans font-medium text-error-text bg-error-bg border border-error-border rounded-lg">
                                <TriangleAlert className="size-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                                <span>Score mismatch — scorecard has <strong className="font-mono tabular-nums">{scorecardScores[teamAId as number]}</strong></span>
                              </div>
                            )
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {(isWeekOne || teamAIsSub) && (
                    <div>
                      <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                        Handicap (Manual)
                      </label>
                      <input
                        type="number"
                        value={teamAHandicapManual}
                        onChange={(e) => setTeamAHandicapManual(e.target.value ? parseFloat(e.target.value) : "")}
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
                      className="w-4 h-4 text-primary accent-fairway"
                    />
                    <label htmlFor="teamAIsSub" className="text-sm font-sans text-text-secondary">
                      Substitute played
                    </label>
                  </div>
                </div>

                {/* Team B */}
                <div className="space-y-4 p-4 bg-surface rounded-lg border border-border">
                  <h3 className="font-display font-semibold text-lg uppercase tracking-wider text-primary">Team B</h3>
                  <div>
                    <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                      Select Team
                    </label>
                    <select
                      value={teamBId}
                      onChange={(e) => setTeamBId(e.target.value ? parseInt(e.target.value) : "")}
                      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
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
                    {(() => {
                      const hasMismatch = teamBId !== "" && teamBGross !== "" && scorecardScores[teamBId as number] != null && teamBGross !== scorecardScores[teamBId as number];
                      return (
                        <>
                          <input
                            type="number"
                            value={teamBGross}
                            onChange={(e) => setTeamBGross(e.target.value ? parseInt(e.target.value) : "")}
                            className={`w-full pencil-input ${hasMismatch ? "!border-board-red !ring-1 !ring-board-red/30" : ""}`}
                          />
                          {teamBId !== "" && teamBGross !== "" && scorecardScores[teamBId as number] != null && (
                            teamBGross === scorecardScores[teamBId as number] ? (
                              <div className="mt-1 flex items-center gap-1 text-xs font-sans text-primary">
                                <Check className="size-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                                <span>Matches scorecard</span>
                              </div>
                            ) : (
                              <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-sans font-medium text-error-text bg-error-bg border border-error-border rounded-lg">
                                <TriangleAlert className="size-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                                <span>Score mismatch — scorecard has <strong className="font-mono tabular-nums">{scorecardScores[teamBId as number]}</strong></span>
                              </div>
                            )
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {(isWeekOne || teamBIsSub) && (
                    <div>
                      <label className="block font-display font-medium text-text-secondary uppercase tracking-wider text-sm mb-1">
                        Handicap (Manual)
                      </label>
                      <input
                        type="number"
                        value={teamBHandicapManual}
                        onChange={(e) => setTeamBHandicapManual(e.target.value ? parseFloat(e.target.value) : "")}
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
                      className="w-4 h-4 text-primary accent-fairway"
                    />
                    <label htmlFor="teamBIsSub" className="text-sm font-sans text-text-secondary">
                      Substitute played
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <SubmitButton
                  type="button"
                  pending={loading}
                  onClick={handlePreview}
                  disabled={loading || teams.length < 2}
                  className="w-full"
                >
                  {loading ? "Loading..." : "Preview Results"}
                </SubmitButton>
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
                ? "bg-fairway/10 border border-fairway/30 text-primary"
                : "bg-error-bg border border-error-border text-error-text"
            }`}>
              Total: {Number(teamAPointsOverride) + Number(teamBPointsOverride)} / 20 points
              {Number(teamAPointsOverride) + Number(teamBPointsOverride) !== 20 && (
                <span className="ml-2 font-sans font-medium">(Must equal 20)</span>
              )}
            </div>
          )}

          {/* Scorecard mismatch warning in preview */}
          {preview && (() => {
            const mismatches: string[] = [];
            if (scorecardScores[preview.teamAId] != null && preview.teamAGross !== scorecardScores[preview.teamAId]) {
              mismatches.push(`${preview.teamAName}: entered ${preview.teamAGross}, scorecard has ${scorecardScores[preview.teamAId]}`);
            }
            if (scorecardScores[preview.teamBId] != null && preview.teamBGross !== scorecardScores[preview.teamBId]) {
              mismatches.push(`${preview.teamBName}: entered ${preview.teamBGross}, scorecard has ${scorecardScores[preview.teamBId]}`);
            }
            if (mismatches.length === 0) return null;
            return (
              <div className="mt-4 p-4 bg-error-bg border-2 border-error-border rounded-lg flex items-start gap-3">
                <TriangleAlert className="size-5 flex-shrink-0 text-board-red mt-0.5" strokeWidth={1.75} aria-hidden />
                <div>
                  <div className="font-display font-bold uppercase tracking-wider text-sm text-error-text mb-1">Score Mismatch</div>
                  <div className="text-sm font-sans text-error-text space-y-0.5">
                    {mismatches.map((m, i) => <div key={i}>{m}</div>)}
                  </div>
                  <div className="text-xs font-sans text-error-text/70 mt-1">You can still submit, but the scores will not match the scorecards.</div>
                </div>
              </div>
            );
          })()}

          <div className="mt-6 flex gap-4">
            <Button variant="secondary" className="flex-1" onClick={handleCancelPreview}>
              Back to Edit
            </Button>
            <SubmitButton
              type="button"
              variant="accent"
              pending={loading}
              onClick={handleSubmit}
              disabled={
                loading ||
                teamAPointsOverride === "" ||
                teamBPointsOverride === "" ||
                Number(teamAPointsOverride) + Number(teamBPointsOverride) !== 20
              }
              className="flex-1"
            >
              {loading ? "Submitting..." : "Submit Matchup"}
            </SubmitButton>
          </div>
        </div>
      )}

      {/* Matchup History */}
      {matchups.length > 0 && (() => {
        const weekMatchups = matchups.filter((m) => m.weekNumber === weekNumber);
        const displayMatchups = weekMatchups.length > 0 ? weekMatchups : matchups.slice(0, 10);
        const showingAllWeeks = weekMatchups.length === 0;
        return (
        <div className="bg-scorecard-paper rounded-lg shadow-md p-6 mt-6 border border-border">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-text-primary">
            {showingAllWeeks ? "Recent Matchups" : `Week ${weekNumber} Matchups`}
          </h2>
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
                {displayMatchups.map((matchup) => {
                  const teamAScorecard = matchup.weekNumber === weekNumber ? scorecardScores[matchup.teamAId] : undefined;
                  const teamBScorecard = matchup.weekNumber === weekNumber ? scorecardScores[matchup.teamBId] : undefined;
                  const teamAMismatch = teamAScorecard != null && teamAScorecard !== matchup.teamAGross;
                  const teamBMismatch = teamBScorecard != null && teamBScorecard !== matchup.teamBGross;
                  const isForfeit = matchup.isForfeit;
                  return (
                  <React.Fragment key={matchup.id}>
                  <tr className="hover:bg-surface">
                    <td className="py-2 px-3 font-mono tabular-nums text-text-secondary">
                      {matchup.weekNumber}
                      {isForfeit && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">F</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans font-medium text-text-primary">
                      {matchup.teamA.name}
                      {teamAMismatch && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-sans font-bold text-error-text bg-error-bg border border-error-border rounded" title={`Matchup gross (${matchup.teamAGross}) differs from scorecard (${teamAScorecard})`}>
                          <TriangleAlert className="size-3.5" strokeWidth={1.75} aria-hidden />
                          Card: {teamAScorecard}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums font-semibold text-primary">{matchup.teamAPoints}</td>
                    <td className="py-2 px-3 font-sans font-medium text-text-primary">
                      {matchup.teamB.name}
                      {teamBMismatch && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-sans font-bold text-error-text bg-error-bg border border-error-border rounded" title={`Matchup gross (${matchup.teamBGross}) differs from scorecard (${teamBScorecard})`}>
                          <TriangleAlert className="size-3.5" strokeWidth={1.75} aria-hidden />
                          Card: {teamBScorecard}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums font-semibold text-primary">{matchup.teamBPoints}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {isForfeit ? (
                          <span
                            className="text-text-light text-sm font-display font-medium uppercase tracking-wider cursor-not-allowed opacity-50"
                            title="Delete and re-enter to modify forfeits"
                          >
                            Edit
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-info-text hover:text-info-text/80"
                            onClick={() => setEditingMatchupId(editingMatchupId === matchup.id ? null : matchup.id)}
                            disabled={loading}
                          >
                            {editingMatchupId === matchup.id ? "Close" : "Edit"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteMatchup(matchup.id)}
                          disabled={loading}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editingMatchupId === matchup.id && (
                    <MatchupEditRow
                      matchup={matchup}
                      slug={slug}
                      onSaved={() => {
                        setEditingMatchupId(null);
                        refreshData();
                      }}
                      onCancel={() => setEditingMatchupId(null)}
                    />
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}
    </>
  );
}
