"use client";

import { useState } from "react";
import {
  approveTeam,
  rejectTeam,
  deleteTeam,
  getTeams,
  getAllTeamsWithStatus,
  adminQuickAddTeam,
  updateTeamContact,
} from "@/lib/actions/teams";
import {
  addTeamToSchedule,
  type AddTeamStrategy,
} from "@/lib/actions/schedule";
import { notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/composite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [quickAddEmail, setQuickAddEmail] = useState("");
  const [quickAddPhone, setQuickAddPhone] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  // Contact editing state
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [contactSaving, setContactSaving] = useState(false);

  const pendingTeams = allTeams.filter((t) => t.status === "pending");
  const approvedTeams = allTeams.filter((t) => t.status === "approved");
  const rejectedTeams = allTeams.filter((t) => t.status === "rejected");

  async function handleApproveTeam(teamId: number) {
    setLoading(true);
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
          notify.success("Team approved!");
        }
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleApproveTeam error:", error);
      notify.error("Failed to approve team. Please try again.");
    }
    setLoading(false);
  }

  async function handleScheduleIntegration() {
    setScheduleLoading(true);
    try {
      const result = await addTeamToSchedule(slug, scheduleDialog.teamId, selectedStrategy);
      if (result.success) {
        notify.success(`Team "${scheduleDialog.teamName}" approved and added to schedule using "${STRATEGY_LABELS[selectedStrategy]}" strategy.`);
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleScheduleIntegration error:", error);
      notify.error("Failed to add team to schedule. Team was approved but schedule was not updated.");
    }
    setScheduleDialog({ open: false, teamId: 0, teamName: "", fillByesAvailable: false });
    setScheduleLoading(false);
  }

  function handleSkipScheduleIntegration() {
    setScheduleDialog({ open: false, teamId: 0, teamName: "", fillByesAvailable: false });
    notify.success("Team approved! Schedule was not modified — you can add the team to the schedule later from the Schedule tab.");
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

    try {
      let result;
      if (action === "reject") {
        result = await rejectTeam(slug, teamId);
      } else {
        result = await deleteTeam(slug, teamId);
      }

      if (result.success) {
        notify.success(action === "reject" ? "Team rejected." : `Team "${teamName}" deleted.`);
        const [teamsData, allTeamsData] = await Promise.all([
          getTeams(leagueId),
          getAllTeamsWithStatus(slug),
        ]);
        onTeamsChanged(teamsData, allTeamsData);
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("executeConfirmedAction error:", error);
      const fallback = action === "reject" ? "Failed to reject team." : "Failed to delete team.";
      notify.error(fallback);
    }
    setLoading(false);
  }

  async function handleQuickAddTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    setQuickAddLoading(true);
    try {
      const result = await adminQuickAddTeam(slug, quickAddName, quickAddCaptain || undefined, quickAddEmail || undefined, quickAddPhone || undefined);
      if (result.success) {
        notify.success(`Team "${result.data.name}" added!`);
        setQuickAddName("");
        setQuickAddCaptain("");
        setQuickAddEmail("");
        setQuickAddPhone("");
        const [teamsData, allTeamsData] = await Promise.all([
          getTeams(leagueId),
          getAllTeamsWithStatus(slug),
        ]);
        onTeamsChanged(teamsData, allTeamsData);
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleQuickAddTeam error:", error);
      notify.error("Failed to add team.");
    }
    setQuickAddLoading(false);
  }

  function handleStartEditContact(team: AdminTeam) {
    setEditingContactId(team.id);
    setEditEmail(team.email || "");
    setEditPhone(team.phone || "");
  }

  async function handleSaveContact(teamId: number) {
    setContactSaving(true);
    try {
      const result = await updateTeamContact(slug, teamId, editEmail || null, editPhone || null);
      if (result.success) {
        notify.success("Contact info updated.");
        setEditingContactId(null);
        const [teamsData, allTeamsData] = await Promise.all([
          getTeams(leagueId),
          getAllTeamsWithStatus(slug),
        ]);
        onTeamsChanged(teamsData, allTeamsData);
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleSaveContact error:", error);
      notify.error("Failed to update contact info.");
    }
    setContactSaving(false);
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) setConfirmState((prev) => ({ ...prev, open: false }));
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState.action === "reject" ? "Reject Team" : "Delete Team"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState.action === "reject"
                ? "Are you sure you want to reject this team?"
                : `Are you sure you want to delete team "${confirmState.teamName}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={executeConfirmedAction}>
              {confirmState.action === "reject" ? "Reject" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule Integration Dialog */}
      <Dialog
        open={scheduleDialog.open}
        onOpenChange={(open) => {
          if (!open) handleSkipScheduleIntegration();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold uppercase tracking-wider text-text-primary">
              Add &ldquo;{scheduleDialog.teamName}&rdquo; to Schedule
            </DialogTitle>
            <DialogDescription className="font-sans text-text-secondary">
              A schedule exists for this season. How should this team be integrated?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {(["start_from_here", "fill_byes", "pro_rate", "catch_up"] as AddTeamStrategy[]).map((strategy) => {
              const disabled = strategy === "fill_byes" && !scheduleDialog.fillByesAvailable;
              return (
                <label
                  key={strategy}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    disabled
                      ? "opacity-50 cursor-not-allowed bg-surface border-border-light"
                      : selectedStrategy === strategy
                      ? "border-primary bg-primary/10"
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
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <span className="font-display font-medium text-text-primary uppercase tracking-wider">
                      {STRATEGY_LABELS[strategy]}
                      {strategy === midSeasonAddDefault && (
                        <span className="ml-2 text-xs font-display text-primary bg-primary/10 px-1.5 py-0.5 rounded">
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

          <DialogFooter>
            <Button variant="outline" onClick={handleSkipScheduleIntegration} disabled={scheduleLoading}>
              Skip (Don&apos;t Update Schedule)
            </Button>
            <SubmitButton type="button" pending={scheduleLoading} onClick={handleScheduleIntegration}>
              Confirm &amp; Add to Schedule
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-display font-medium uppercase tracking-wider text-text-secondary mb-1">
              Email
            </label>
            <input
              type="email"
              value={quickAddEmail}
              onChange={(e) => setQuickAddEmail(e.target.value)}
              placeholder="Optional"
              className="pencil-input w-full"
              maxLength={255}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-display font-medium uppercase tracking-wider text-text-secondary mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={quickAddPhone}
              onChange={(e) => setQuickAddPhone(e.target.value)}
              placeholder="Optional"
              className="pencil-input w-full"
              maxLength={20}
            />
          </div>
          <SubmitButton pending={quickAddLoading} disabled={!quickAddName.trim()}>
            Add Team
          </SubmitButton>
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
                    <Button onClick={() => handleApproveTeam(team.id)} disabled={loading}>
                      Approve
                    </Button>
                    <Button variant="destructive" onClick={() => handleRejectTeam(team.id)} disabled={loading}>
                      Reject
                    </Button>
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
              <div key={team.id} className="p-3 bg-surface rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-display font-medium text-text-primary">{team.name}</span>
                    {team.captainName && <span className="ml-2 text-sm font-sans text-text-muted">({team.captainName})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-text-muted"
                      onClick={() => editingContactId === team.id ? setEditingContactId(null) : handleStartEditContact(team)}
                    >
                      {editingContactId === team.id ? "Cancel" : "Edit Contact"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTeam(team.id, team.name)}
                      disabled={loading}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {/* Contact info display */}
                {editingContactId !== team.id && (team.email || team.phone) && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs font-sans text-text-muted">
                    {team.email && <span>{team.email}</span>}
                    {team.phone && <span>{team.phone}</span>}
                  </div>
                )}
                {/* Inline contact edit form */}
                {editingContactId === team.id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-display font-medium uppercase tracking-wider text-text-secondary mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="team@example.com"
                        className="pencil-input w-full text-sm"
                        maxLength={255}
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs font-display font-medium uppercase tracking-wider text-text-secondary mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="(555) 555-5555"
                        className="pencil-input w-full text-sm"
                        maxLength={20}
                      />
                    </div>
                    <SubmitButton type="button" size="sm" pending={contactSaving} onClick={() => handleSaveContact(team.id)}>
                      Save
                    </SubmitButton>
                  </div>
                )}
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  disabled={loading}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
