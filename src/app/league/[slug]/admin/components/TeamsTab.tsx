"use client";

import { useState } from "react";
import {
  approveTeam,
  rejectTeam,
  deleteTeam,
  getTeams,
  getAllTeamsWithStatus,
  adminQuickAddTeam,
} from "@/lib/actions/teams";
import {
  addTeamToSchedule,
  type AddTeamStrategy,
} from "@/lib/actions/schedule";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { AdminTeam } from "@/lib/types/admin";

interface TeamsTabProps {
  slug: string;
  leagueId: number;
  maxTeams: number;
  allTeams: AdminTeam[];
  midSeasonAddDefault: string;
  onTeamsChanged: (teams: AdminTeam[], allTeams: AdminTeam[]) => void;
}

const STRATEGY_LABELS: Record<AddTeamStrategy, string> = {
  start_from_here: "Start From Here",
  fill_byes: "Fill Bye Slots",
  pro_rate: "Pro-Rated Standings",
  catch_up: "Catch-Up Matches",
};

const STRATEGY_DESCRIPTIONS: Record<AddTeamStrategy, string> = {
  start_from_here: "Regenerate the schedule from the current week forward including this team. Past weeks are unchanged.",
  fill_byes: "Slot the new team into existing bye weeks. Only available when the team count goes from odd to even.",
  pro_rate: "Same as Start From Here, but switches standings to points-per-round mode for fairness.",
  catch_up: "Regenerate future schedule and add extra matchups so the new team catches up.",
};

export default function TeamsTab({ slug, leagueId, maxTeams, allTeams, midSeasonAddDefault, onTeamsChanged }: TeamsTabProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    action: "reject" | "delete";
    teamId: number;
    teamName: string;
  }>({ open: false, action: "reject", teamId: 0, teamName: "" });

  // Schedule integration dialog state
  const [scheduleDialog, setScheduleDialog] = useState<{
    open: boolean;
    teamId: number;
    teamName: string;
    fillByesAvailable: boolean;
  }>({ open: false, teamId: 0, teamName: "", fillByesAvailable: false });
  const [selectedStrategy, setSelectedStrategy] = useState<AddTeamStrategy>(
    (midSeasonAddDefault as AddTeamStrategy) || "start_from_here"
  );
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Quick-add team state
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddCaptain, setQuickAddCaptain] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  const pendingTeams = allTeams.filter((t) => t.status === "pending");
  const approvedTeams = allTeams.filter((t) => t.status === "approved");
  const rejectedTeams = allTeams.filter((t) => t.status === "rejected");

  async function handleApproveTeam(teamId: number) {
    setLoading(true);
    setMessage(null);
    try {
      // Capture pre-approval state: odd count means adding one team makes it even (fills byes)
      const preApprovalFillByes = approvedTeams.length % 2 === 1;

      const result = await approveTeam(slug, teamId);
      if (result.success) {
        const [teamsData, allTeamsData] = await Promise.all([
          getTeams(leagueId),
          getAllTeamsWithStatus(slug),
        ]);
        onTeamsChanged(teamsData, allTeamsData);

        // Check if schedule integration is needed
        const data = result.data as { teamId: number; scheduleIntegrationNeeded: boolean } | undefined;
        if (data?.scheduleIntegrationNeeded) {
          const team = allTeamsData.find((t) => t.id === teamId);
          setScheduleDialog({
            open: true,
            teamId,
            teamName: team?.name || "Team",
            fillByesAvailable: preApprovalFillByes,
          });
          setSelectedStrategy((midSeasonAddDefault as AddTeamStrategy) || "start_from_here");
        } else {
          setMessage({ type: "success", text: "Team approved!" });
        }
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleApproveTeam error:", error);
      setMessage({ type: "error", text: "Failed to approve team. Please try again." });
    }
    setLoading(false);
  }

  async function handleScheduleIntegration() {
    setScheduleLoading(true);
    setMessage(null);
    try {
      const result = await addTeamToSchedule(slug, scheduleDialog.teamId, selectedStrategy);
      if (result.success) {
        setMessage({ type: "success", text: `Team "${scheduleDialog.teamName}" approved and added to schedule using "${STRATEGY_LABELS[selectedStrategy]}" strategy.` });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleScheduleIntegration error:", error);
      setMessage({ type: "error", text: "Failed to add team to schedule. Team was approved but schedule was not updated." });
    }
    setScheduleDialog({ open: false, teamId: 0, teamName: "", fillByesAvailable: false });
    setScheduleLoading(false);
  }

  function handleSkipScheduleIntegration() {
    setScheduleDialog({ open: false, teamId: 0, teamName: "", fillByesAvailable: false });
    setMessage({ type: "success", text: "Team approved! Schedule was not modified — you can add the team to the schedule later from the Schedule tab." });
  }

  function handleRejectTeam(teamId: number) {
    setConfirmState({ open: true, action: "reject", teamId, teamName: "" });
  }

  function handleDeleteTeam(teamId: number, teamName: string) {
    setConfirmState({ open: true, action: "delete", teamId, teamName });
  }

  async function executeConfirmedAction() {
    const { action, teamId, teamName } = confirmState;
    setConfirmState((prev) => ({ ...prev, open: false }));
    setLoading(true);
    setMessage(null);

    try {
      let result;
      if (action === "reject") {
        result = await rejectTeam(slug, teamId);
      } else {
        result = await deleteTeam(slug, teamId);
      }

      if (result.success) {
        setMessage({ type: "success", text: action === "reject" ? "Team rejected." : `Team "${teamName}" deleted.` });
        const [teamsData, allTeamsData] = await Promise.all([
          getTeams(leagueId),
          getAllTeamsWithStatus(slug),
        ]);
        onTeamsChanged(teamsData, allTeamsData);
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("executeConfirmedAction error:", error);
      const fallback = action === "reject" ? "Failed to reject team." : "Failed to delete team.";
      setMessage({ type: "error", text: fallback });
    }
    setLoading(false);
  }

  async function handleQuickAddTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    setQuickAddLoading(true);
    setMessage(null);
    try {
      const result = await adminQuickAddTeam(slug, quickAddName, quickAddCaptain || undefined);
      if (result.success) {
        setMessage({ type: "success", text: `Team "${result.data.name}" added!` });
        setQuickAddName("");
        setQuickAddCaptain("");
        const [teamsData, allTeamsData] = await Promise.all([
          getTeams(leagueId),
          getAllTeamsWithStatus(slug),
        ]);
        onTeamsChanged(teamsData, allTeamsData);
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleQuickAddTeam error:", error);
      setMessage({ type: "error", text: "Failed to add team." });
    }
    setQuickAddLoading(false);
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.action === "reject" ? "Reject Team" : "Delete Team"}
        message={
          confirmState.action === "reject"
            ? "Are you sure you want to reject this team?"
            : `Are you sure you want to delete team "${confirmState.teamName}"? This cannot be undone.`
        }
        confirmLabel={confirmState.action === "reject" ? "Reject" : "Delete"}
        variant="danger"
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />

      {/* Schedule Integration Dialog */}
      {scheduleDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-scorecard-paper rounded-xl shadow-lg max-w-lg w-full p-6 border border-border">
            <h3 className="text-lg font-display font-semibold uppercase tracking-wider text-text-primary mb-2">
              Add &ldquo;{scheduleDialog.teamName}&rdquo; to Schedule
            </h3>
            <p className="text-sm font-sans text-text-secondary mb-4">
              A schedule exists for this season. How should this team be integrated?
            </p>

            <div className="space-y-3 mb-6">
              {(["start_from_here", "fill_byes", "pro_rate", "catch_up"] as AddTeamStrategy[]).map((strategy) => {
                const disabled = strategy === "fill_byes" && !scheduleDialog.fillByesAvailable;
                return (
                  <label
                    key={strategy}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      disabled
                        ? "opacity-50 cursor-not-allowed bg-surface border-border-light"
                        : selectedStrategy === strategy
                        ? "border-fairway bg-fairway/10"
                        : "border-border-light hover:border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      value={strategy}
                      checked={selectedStrategy === strategy}
                      disabled={disabled}
                      onChange={() => setSelectedStrategy(strategy)}
                      className="mt-0.5 accent-fairway"
                    />
                    <div>
                      <span className="font-display font-medium text-text-primary uppercase tracking-wider">
                        {STRATEGY_LABELS[strategy]}
                        {strategy === midSeasonAddDefault && (
                          <span className="ml-2 text-xs font-display text-fairway bg-fairway/10 px-1.5 py-0.5 rounded">
                            League Default
                          </span>
                        )}
                      </span>
                      <p className="text-sm font-sans text-text-muted mt-0.5">{STRATEGY_DESCRIPTIONS[strategy]}</p>
                      {strategy === "fill_byes" && !scheduleDialog.fillByesAvailable && (
                        <p className="text-xs font-sans text-warning-text mt-1">
                          Only available when team count goes from odd to even.
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleSkipScheduleIntegration}
                disabled={scheduleLoading}
                className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider text-text-secondary bg-surface rounded-lg hover:bg-bunker/20 disabled:opacity-50"
              >
                Skip (Don&apos;t Update Schedule)
              </button>
              <button
                onClick={handleScheduleIntegration}
                disabled={scheduleLoading}
                className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider text-white bg-fairway rounded-lg hover:bg-rough disabled:opacity-50"
              >
                {scheduleLoading ? "Adding to Schedule..." : "Confirm & Add to Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`p-4 rounded-lg font-sans ${
            message.type === "success"
              ? "bg-fairway/10 border border-fairway/30 text-fairway"
              : "bg-error-bg border border-error-border text-error-text"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Quick Add Team */}
      <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-border">
        <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-text-primary">
          Quick Add Team
        </h2>
        <form onSubmit={handleQuickAddTeam} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-display font-medium uppercase tracking-wider text-text-secondary mb-1">
              Team Name *
            </label>
            <input
              type="text"
              value={quickAddName}
              onChange={(e) => setQuickAddName(e.target.value)}
              placeholder="e.g. The Eagles"
              className="pencil-input w-full"
              required
              maxLength={50}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-display font-medium uppercase tracking-wider text-text-secondary mb-1">
              Captain Name
            </label>
            <input
              type="text"
              value={quickAddCaptain}
              onChange={(e) => setQuickAddCaptain(e.target.value)}
              placeholder="Optional"
              className="pencil-input w-full"
              maxLength={100}
            />
          </div>
          <button
            type="submit"
            disabled={quickAddLoading || !quickAddName.trim()}
            className="px-5 py-2 bg-fairway text-white text-sm font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough disabled:opacity-50 transition-colors"
          >
            {quickAddLoading ? "Adding..." : "Add Team"}
          </button>
        </form>
      </div>

      {pendingTeams.length > 0 && (
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-warning-border">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-text-primary">
            Pending Approval ({pendingTeams.length})
          </h2>
          <div className="space-y-4">
            {pendingTeams.map((team) => (
              <div key={team.id} className="p-4 bg-board-yellow/15 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display font-semibold uppercase tracking-wider text-text-primary">{team.name}</h3>
                    {team.captainName && <p className="text-sm font-sans text-text-secondary">Captain: {team.captainName}</p>}
                    {team.email && <p className="text-sm font-sans text-text-muted">{team.email}</p>}
                    {team.phone && <p className="text-sm font-sans text-text-muted">{team.phone}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveTeam(team.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-fairway text-white text-sm font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectTeam(team.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-board-red text-white text-sm font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-board-red/90 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-border">
        <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-text-primary">
          Approved Teams (<span className="font-mono tabular-nums">{approvedTeams.length}/{maxTeams}</span>)
        </h2>
        {approvedTeams.length === 0 ? (
          <p className="font-sans text-text-muted">No approved teams yet.</p>
        ) : (
          <div className="space-y-2">
            {approvedTeams.map((team) => (
              <div key={team.id} className="flex justify-between items-center p-3 bg-surface rounded-lg">
                <div>
                  <span className="font-display font-medium text-text-primary">{team.name}</span>
                  {team.captainName && <span className="ml-2 text-sm font-sans text-text-muted">({team.captainName})</span>}
                </div>
                <button
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  disabled={loading}
                  className="text-board-red hover:text-board-red/90 text-sm font-display font-semibold uppercase tracking-wider disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectedTeams.length > 0 && (
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-error-border">
          <h2 className="text-xl font-display font-semibold uppercase tracking-wider mb-4 text-text-primary">
            Rejected Teams ({rejectedTeams.length})
          </h2>
          <div className="space-y-2">
            {rejectedTeams.map((team) => (
              <div key={team.id} className="flex justify-between items-center p-3 bg-error-bg rounded-lg">
                <span className="font-sans text-text-secondary">{team.name}</span>
                <button
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  disabled={loading}
                  className="text-board-red hover:text-board-red/90 text-sm font-display font-semibold uppercase tracking-wider disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
