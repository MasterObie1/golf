"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  getTeams,
  createTeam,
  getCurrentWeekNumber,
  previewMatchup,
  submitMatchup,
  submitForfeit,
  getMatchupHistory,
  deleteMatchup,
  getLeagueSettings,
  updateLeagueSettings,
  getAllTeamsWithStatus,
  approveTeam,
  rejectTeam,
  deleteTeam,
  type MatchupPreview,
} from "@/lib/actions";

interface Team {
  id: number;
  name: string;
  status?: string;
  captainName?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface LeagueSettings {
  id: number;
  maxTeams: number;
  registrationOpen: boolean;
}

interface Matchup {
  id: number;
  weekNumber: number;
  teamA: { id: number; name: string };
  teamB: { id: number; name: string };
  teamAId: number;
  teamBId: number;
  teamAGross: number;
  teamBGross: number;
  teamANet: number;
  teamBNet: number;
  teamAPoints: number;
  teamBPoints: number;
  teamAIsSub: boolean;
  teamBIsSub: boolean;
  isForfeit: boolean;
  forfeitTeamId: number | null;
}

export default function AdminPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [weekNumber, setWeekNumber] = useState(1);
  const [newTeamName, setNewTeamName] = useState("");

  // Settings state
  const [settings, setSettings] = useState<LeagueSettings | null>(null);
  const [maxTeamsInput, setMaxTeamsInput] = useState(16);
  const [registrationOpenInput, setRegistrationOpenInput] = useState(true);
  const [activeTab, setActiveTab] = useState<"matchups" | "teams" | "settings">("matchups");

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

  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isWeekOne = weekNumber === 1;

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    const [teamsData, currentWeek, matchupsData, settingsData, allTeamsData] = await Promise.all([
      getTeams(),
      getCurrentWeekNumber(),
      getMatchupHistory(),
      getLeagueSettings(),
      getAllTeamsWithStatus(),
    ]);
    setTeams(teamsData);
    setWeekNumber(currentWeek);
    setMatchups(matchupsData);
    setSettings(settingsData);
    setMaxTeamsInput(settingsData.maxTeams);
    setRegistrationOpenInput(settingsData.registrationOpen);
    setAllTeams(allTeamsData);
  }

  async function handleAddTeam() {
    if (!newTeamName.trim()) return;
    setLoading(true);
    try {
      await createTeam(newTeamName.trim());
      setNewTeamName("");
      const teamsData = await getTeams();
      setTeams(teamsData);
      setMessage({ type: "success", text: `Team "${newTeamName}" added!` });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to add team. Name may already exist." });
    }
    setLoading(false);
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
    // Week 1 requires manual handicap for both teams
    if (isWeekOne && (teamAHandicapManual === "" || teamBHandicapManual === "")) {
      setMessage({ type: "error", text: "Week 1 requires manual handicap entry." });
      return;
    }
    // Subs require manual handicap entry
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
      // Pass manual handicap if it's week 1 OR if a substitute is playing
      const previewData = await previewMatchup(
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
      setPreview(previewData);
      // Points are always manually entered (20 total per week, hole-by-hole)
      setTeamAPointsOverride("");
      setTeamBPointsOverride("");
    } catch (error) {
      setMessage({ type: "error", text: "Failed to generate preview." });
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!preview) return;

    setLoading(true);
    try {
      await submitMatchup(
        preview.weekNumber,
        preview.teamAId,
        preview.teamAGross,
        preview.teamAHandicap,
        preview.teamANet,
        teamAPointsOverride as number,
        preview.teamAIsSub,
        preview.teamBId,
        preview.teamBGross,
        preview.teamBHandicap,
        preview.teamBNet,
        teamBPointsOverride as number,
        preview.teamBIsSub
      );
      setMessage({ type: "success", text: "Matchup submitted successfully!" });
      // Reset form
      setPreview(null);
      setTeamAId("");
      setTeamBId("");
      setTeamAGross("");
      setTeamBGross("");
      setTeamAHandicapManual("");
      setTeamBHandicapManual("");
      setTeamAIsSub(false);
      setTeamBIsSub(false);
      // Refresh data
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(),
        getMatchupHistory(),
      ]);
      setWeekNumber(currentWeek);
      setMatchups(matchupsData);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to submit matchup. May already exist for this week." });
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
      await submitForfeit(weekNumber, winningTeamId as number, forfeitingTeamId as number);
      setMessage({ type: "success", text: "Forfeit recorded successfully!" });
      // Reset form
      setWinningTeamId("");
      setForfeitingTeamId("");
      setIsForfeitMode(false);
      // Refresh data
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(),
        getMatchupHistory(),
      ]);
      setWeekNumber(currentWeek);
      setMatchups(matchupsData);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to record forfeit. Teams may have already played this week." });
    }
    setLoading(false);
  }

  async function handleDeleteMatchup(matchupId: number) {
    if (!confirm("Are you sure you want to delete this matchup? Team stats will be reversed.")) {
      return;
    }
    setLoading(true);
    try {
      await deleteMatchup(matchupId);
      setMessage({ type: "success", text: "Matchup deleted successfully!" });
      // Refresh data
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(),
        getMatchupHistory(),
      ]);
      setWeekNumber(currentWeek);
      setMatchups(matchupsData);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to delete matchup." });
    }
    setLoading(false);
  }

  async function handleSaveSettings() {
    setLoading(true);
    try {
      await updateLeagueSettings(maxTeamsInput, registrationOpenInput);
      const settingsData = await getLeagueSettings();
      setSettings(settingsData);
      setMessage({ type: "success", text: "Settings saved successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings." });
    }
    setLoading(false);
  }

  async function handleApproveTeam(teamId: number) {
    setLoading(true);
    try {
      await approveTeam(teamId);
      const [teamsData, allTeamsData] = await Promise.all([
        getTeams(),
        getAllTeamsWithStatus(),
      ]);
      setTeams(teamsData);
      setAllTeams(allTeamsData);
      setMessage({ type: "success", text: "Team approved!" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to approve team." });
    }
    setLoading(false);
  }

  async function handleRejectTeam(teamId: number) {
    if (!confirm("Are you sure you want to reject this team?")) return;
    setLoading(true);
    try {
      await rejectTeam(teamId);
      const allTeamsData = await getAllTeamsWithStatus();
      setAllTeams(allTeamsData);
      setMessage({ type: "success", text: "Team rejected." });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to reject team." });
    }
    setLoading(false);
  }

  async function handleDeleteTeam(teamId: number, teamName: string) {
    if (!confirm(`Are you sure you want to delete team "${teamName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await deleteTeam(teamId);
      const [teamsData, allTeamsData] = await Promise.all([
        getTeams(),
        getAllTeamsWithStatus(),
      ]);
      setTeams(teamsData);
      setAllTeams(allTeamsData);
      setMessage({ type: "success", text: `Team "${teamName}" deleted.` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to delete team." });
    }
    setLoading(false);
  }

  const pendingTeams = allTeams.filter((t) => t.status === "pending");
  const approvedTeams = allTeams.filter((t) => t.status === "approved");
  const rejectedTeams = allTeams.filter((t) => t.status === "rejected");

  return (
    <div className="min-h-screen bg-[var(--masters-cream)]">
      {/* Header Banner */}
      <div className="relative h-40 md:h-48">
        <Image
          src="https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=1920&q=80"
          alt="Golf course landscape"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--masters-green)]/70 to-[var(--masters-green)]/90" />
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-playfair)] drop-shadow-lg">
            Admin Dashboard
          </h1>
        </div>
        {/* Navigation */}
        <div className="absolute top-4 right-4 flex gap-3">
          <Link
            href="/"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            Home
          </Link>
          <Link
            href="/leaderboard"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            Leaderboard
          </Link>
          <Link
            href="/history"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            History
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 -mt-4">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]"
                : "bg-[var(--error-bg)] text-[var(--error-text)] border border-[var(--error-border)]"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("matchups")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "matchups"
                ? "bg-[var(--masters-green)] text-white"
                : "bg-white text-[var(--text-secondary)] hover:bg-[var(--masters-cream)] border border-[var(--border-color)]"
            }`}
          >
            Matchups
          </button>
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "teams"
                ? "bg-[var(--masters-green)] text-white"
                : "bg-white text-[var(--text-secondary)] hover:bg-[var(--masters-cream)] border border-[var(--border-color)]"
            }`}
          >
            Teams
            {pendingTeams.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--masters-yellow)] text-[var(--masters-green-dark)] rounded-full">
                {pendingTeams.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "settings"
                ? "bg-[var(--masters-green)] text-white"
                : "bg-white text-[var(--text-secondary)] hover:bg-[var(--masters-cream)] border border-[var(--border-color)]"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--masters-green)]/20">
            <h2 className="text-xl font-semibold mb-6 text-[var(--text-primary)]">League Settings</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Maximum Number of Teams
                </label>
                <input
                  type="number"
                  value={maxTeamsInput}
                  onChange={(e) => setMaxTeamsInput(parseInt(e.target.value) || 1)}
                  min={1}
                  className="w-32 px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                />
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Currently {approvedTeams.length} approved team(s)
                </p>
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registrationOpenInput}
                    onChange={(e) => setRegistrationOpenInput(e.target.checked)}
                    className="w-5 h-5 text-[var(--masters-green)] border-[var(--border-color)] rounded focus:ring-[var(--masters-green)]"
                  />
                  <span className="text-[var(--text-primary)] font-medium">Registration Open</span>
                </label>
                <p className="mt-1 text-sm text-[var(--text-muted)] ml-8">
                  {registrationOpenInput ? "New teams can register via the signup page" : "Registration is closed"}
                </p>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="px-6 py-2 bg-[var(--masters-green)] text-white rounded-lg hover:bg-[var(--masters-green-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Teams Tab */}
        {activeTab === "teams" && (
          <div className="space-y-6">
            {/* Pending Teams */}
            {pendingTeams.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--masters-yellow)]">
                <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
                  Pending Approval ({pendingTeams.length})
                </h2>
                <div className="space-y-4">
                  {pendingTeams.map((team) => (
                    <div key={team.id} className="p-4 bg-[var(--warning-bg)] rounded-lg border border-[var(--warning-border)]">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-[var(--text-primary)]">{team.name}</h3>
                          {team.captainName && <p className="text-sm text-[var(--text-secondary)]">Captain: {team.captainName}</p>}
                          {team.email && <p className="text-sm text-[var(--text-muted)]">{team.email}</p>}
                          {team.phone && <p className="text-sm text-[var(--text-muted)]">{team.phone}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveTeam(team.id)}
                            disabled={loading}
                            className="px-4 py-2 bg-[var(--masters-green)] text-white text-sm font-medium rounded-lg hover:bg-[var(--masters-green-dark)] disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectTeam(team.id)}
                            disabled={loading}
                            className="px-4 py-2 bg-[var(--masters-burgundy)] text-white text-sm font-medium rounded-lg hover:bg-[var(--masters-burgundy-dark)] disabled:opacity-50"
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

            {/* Approved Teams */}
            <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--masters-green)]/20">
              <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
                Approved Teams ({approvedTeams.length}/{settings?.maxTeams || 16})
              </h2>
              {approvedTeams.length === 0 ? (
                <p className="text-[var(--text-muted)]">No approved teams yet.</p>
              ) : (
                <div className="space-y-2">
                  {approvedTeams.map((team) => (
                    <div key={team.id} className="flex justify-between items-center p-3 bg-[var(--masters-cream)] rounded-lg">
                      <div>
                        <span className="font-medium text-[var(--text-primary)]">{team.name}</span>
                        {team.captainName && <span className="ml-2 text-sm text-[var(--text-muted)]">({team.captainName})</span>}
                      </div>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        disabled={loading}
                        className="text-[var(--masters-burgundy)] hover:text-[var(--masters-burgundy-dark)] text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rejected Teams */}
            {rejectedTeams.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--error-border)]">
                <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
                  Rejected Teams ({rejectedTeams.length})
                </h2>
                <div className="space-y-2">
                  {rejectedTeams.map((team) => (
                    <div key={team.id} className="flex justify-between items-center p-3 bg-[var(--error-bg)] rounded-lg">
                      <div>
                        <span className="font-medium text-[var(--text-secondary)]">{team.name}</span>
                        {team.captainName && <span className="ml-2 text-sm text-[var(--text-muted)]">({team.captainName})</span>}
                      </div>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        disabled={loading}
                        className="text-[var(--masters-burgundy)] hover:text-[var(--masters-burgundy-dark)] text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matchups Tab */}
        {activeTab === "matchups" && (
          <>
        {/* Team Management */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border border-[var(--masters-green)]/20">
          <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Quick Add Team</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name"
              className="flex-1 px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] focus:border-[var(--masters-green)] text-[var(--text-primary)]"
            />
            <button
              onClick={handleAddTeam}
              disabled={loading || !newTeamName.trim()}
              className="px-6 py-2 bg-[var(--masters-green)] text-white rounded-lg hover:bg-[var(--masters-green-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Team
            </button>
          </div>
          {teams.length > 0 && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Current teams: {teams.map((t) => t.name).join(", ")}
            </p>
          )}
        </div>

        {/* Matchup Entry Form */}
        {!preview ? (
          <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--masters-green)]/20">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                {isForfeitMode ? "Record Forfeit" : "Enter Matchup Results"}
              </h2>
              <button
                onClick={() => {
                  setIsForfeitMode(!isForfeitMode);
                  setMessage(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isForfeitMode
                    ? "bg-[var(--error-bg)] text-[var(--error-text)] hover:bg-[var(--masters-burgundy)]/20"
                    : "bg-[var(--masters-cream)] text-[var(--text-secondary)] hover:bg-[var(--border-light)]"
                }`}
              >
                {isForfeitMode ? "Cancel Forfeit" : "Record Forfeit"}
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Week Number
              </label>
              <input
                type="number"
                value={weekNumber}
                onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
                min={1}
                className="w-32 px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
              />
              {isWeekOne && !isForfeitMode && (
                <p className="mt-2 text-sm text-[var(--warning-text)] font-medium">
                  Week 1: Manual handicap entry required
                </p>
              )}
            </div>

            {isForfeitMode ? (
              /* Forfeit Entry Form */
              <div className="space-y-6">
                <div className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded-lg p-4">
                  <p className="text-sm text-[var(--error-text)]">
                    A forfeit awards 20 points to the winning team and 0 points to the forfeiting team.
                    The forfeiting team receives a loss.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-4 bg-[var(--success-bg)] rounded-lg border border-[var(--success-border)]">
                    <label className="block text-sm font-medium text-[var(--success-text)] mb-2">
                      Winning Team (receives 20 pts)
                    </label>
                    <select
                      value={winningTeamId}
                      onChange={(e) => setWinningTeamId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                    >
                      <option value="">-- Select Team --</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-4 bg-[var(--error-bg)] rounded-lg border border-[var(--error-border)]">
                    <label className="block text-sm font-medium text-[var(--error-text)] mb-2">
                      Forfeiting Team (receives 0 pts)
                    </label>
                    <select
                      value={forfeitingTeamId}
                      onChange={(e) => setForfeitingTeamId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-burgundy)] text-[var(--text-primary)]"
                    >
                      <option value="">-- Select Team --</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSubmitForfeit}
                  disabled={loading || teams.length < 2}
                  className="w-full py-3 bg-[var(--masters-burgundy)] text-white font-semibold rounded-lg hover:bg-[var(--masters-burgundy-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Recording..." : "Record Forfeit"}
                </button>
              </div>
            ) : (
              /* Regular Matchup Entry Form */
              <>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Team A */}
              <div className="space-y-4 p-4 bg-[var(--masters-cream)]/50 rounded-lg border border-[var(--masters-green)]/10">
                <h3 className="font-semibold text-lg text-[var(--masters-green)]">Team A</h3>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Select Team
                  </label>
                  <select
                    value={teamAId}
                    onChange={(e) => setTeamAId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Gross Score
                  </label>
                  <input
                    type="number"
                    value={teamAGross}
                    onChange={(e) => setTeamAGross(e.target.value ? parseInt(e.target.value) : "")}
                    placeholder="e.g. 42"
                    className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                  />
                </div>
                {(isWeekOne || teamAIsSub) && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      Handicap (Manual){teamAIsSub && !isWeekOne && " - Sub only, won't affect future"}
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={teamAHandicapManual}
                      onChange={(e) => setTeamAHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                      placeholder="e.g. 6"
                      className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="teamAIsSub"
                    checked={teamAIsSub}
                    onChange={(e) => setTeamAIsSub(e.target.checked)}
                    className="w-4 h-4 text-[var(--masters-green)] border-[var(--border-color)] rounded focus:ring-[var(--masters-green)]"
                  />
                  <label htmlFor="teamAIsSub" className="text-sm text-[var(--text-secondary)]">
                    Substitute played (won't affect handicap)
                  </label>
                </div>
              </div>

              {/* Team B */}
              <div className="space-y-4 p-4 bg-[var(--masters-cream)]/50 rounded-lg border border-[var(--masters-green)]/10">
                <h3 className="font-semibold text-lg text-[var(--masters-green)]">Team B</h3>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Select Team
                  </label>
                  <select
                    value={teamBId}
                    onChange={(e) => setTeamBId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Gross Score
                  </label>
                  <input
                    type="number"
                    value={teamBGross}
                    onChange={(e) => setTeamBGross(e.target.value ? parseInt(e.target.value) : "")}
                    placeholder="e.g. 38"
                    className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                  />
                </div>
                {(isWeekOne || teamBIsSub) && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                      Handicap (Manual){teamBIsSub && !isWeekOne && " - Sub only, won't affect future"}
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={teamBHandicapManual}
                      onChange={(e) => setTeamBHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                      placeholder="e.g. 3"
                      className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] text-[var(--text-primary)]"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="teamBIsSub"
                    checked={teamBIsSub}
                    onChange={(e) => setTeamBIsSub(e.target.checked)}
                    className="w-4 h-4 text-[var(--masters-green)] border-[var(--border-color)] rounded focus:ring-[var(--masters-green)]"
                  />
                  <label htmlFor="teamBIsSub" className="text-sm text-[var(--text-secondary)]">
                    Substitute played (won't affect handicap)
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={handlePreview}
                disabled={loading || teams.length < 2}
                className="w-full py-3 bg-[var(--masters-green)] text-white font-semibold rounded-lg hover:bg-[var(--masters-green-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : "Preview Results"}
              </button>
              {teams.length < 2 && (
                <p className="mt-2 text-sm text-[var(--text-light)] text-center">
                  Add at least 2 teams to enter a matchup
                </p>
              )}
            </div>
              </>
            )}
          </div>
        ) : (
          /* Preview Panel */
          <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--masters-green)]/20">
            <h2 className="text-xl font-semibold mb-6 text-[var(--text-primary)]">Preview - Week {preview.weekNumber}</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[var(--text-primary)]">
                <thead className="bg-[var(--masters-green)] text-white">
                  <tr>
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4 text-center">Gross</th>
                    <th className="py-3 px-4 text-center">Handicap</th>
                    <th className="py-3 px-4 text-center">Net</th>
                    <th className="py-3 px-4 text-center">Points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border-light)] bg-[var(--masters-cream)]">
                    <td className="py-3 px-4 font-medium">
                      {preview.teamAName}
                      {preview.teamAIsSub && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--warning-bg)] text-[var(--warning-text)] rounded">SUB</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">{preview.teamAGross}</td>
                    <td className="py-3 px-4 text-center">{preview.teamAHandicap}</td>
                    <td className="py-3 px-4 text-center font-semibold">{preview.teamANet.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        step="0.5"
                        value={teamAPointsOverride}
                        onChange={(e) => setTeamAPointsOverride(e.target.value ? parseFloat(e.target.value) : "")}
                        className="w-20 px-2 py-1 border border-[var(--border-color)] rounded text-center text-[var(--text-primary)]"
                      />
                    </td>
                  </tr>
                  <tr className="bg-white">
                    <td className="py-3 px-4 font-medium">
                      {preview.teamBName}
                      {preview.teamBIsSub && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--warning-bg)] text-[var(--warning-text)] rounded">SUB</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">{preview.teamBGross}</td>
                    <td className="py-3 px-4 text-center">{preview.teamBHandicap}</td>
                    <td className="py-3 px-4 text-center font-semibold">{preview.teamBNet.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        step="0.5"
                        value={teamBPointsOverride}
                        onChange={(e) => setTeamBPointsOverride(e.target.value ? parseFloat(e.target.value) : "")}
                        className="w-20 px-2 py-1 border border-[var(--border-color)] rounded text-center text-[var(--text-primary)]"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {teamAPointsOverride !== "" && teamBPointsOverride !== "" && (
              <div className={`mt-4 p-3 rounded-lg ${
                (teamAPointsOverride as number) + (teamBPointsOverride as number) === 20
                  ? "bg-[var(--success-bg)] text-[var(--success-text)]"
                  : "bg-[var(--error-bg)] text-[var(--error-text)]"
              }`}>
                Total: {(teamAPointsOverride as number) + (teamBPointsOverride as number)} / 20 points
                {(teamAPointsOverride as number) + (teamBPointsOverride as number) !== 20 && (
                  <span className="ml-2 font-medium">(Must equal 20)</span>
                )}
              </div>
            )}

            <p className="mt-4 text-sm text-[var(--warning-text)] font-medium">
              Enter points manually (20 total points per week, awarded hole-by-hole).
            </p>

            <div className="mt-6 flex gap-4">
              <button
                onClick={handleCancelPreview}
                className="flex-1 py-3 bg-[var(--border-light)] text-[var(--text-primary)] font-semibold rounded-lg hover:bg-[var(--border-color)]"
              >
                Back to Edit
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  loading ||
                  teamAPointsOverride === "" ||
                  teamBPointsOverride === "" ||
                  (teamAPointsOverride as number) + (teamBPointsOverride as number) !== 20
                }
                className="flex-1 py-3 bg-[var(--masters-yellow)] text-[var(--masters-green-dark)] font-semibold rounded-lg hover:bg-[var(--masters-yellow-light)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Submitting..." : "Submit Matchup"}
              </button>
            </div>
          </div>
        )}

        {/* Recent Matchups */}
        {matchups.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-6 border border-[var(--masters-green)]/20">
            <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Recent Matchups</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[var(--text-primary)]">
                <thead className="bg-[var(--masters-green)] text-white">
                  <tr>
                    <th className="py-2 px-3 rounded-tl-lg">Week</th>
                    <th className="py-2 px-3">Team A</th>
                    <th className="py-2 px-3 text-center">Pts</th>
                    <th className="py-2 px-3">Team B</th>
                    <th className="py-2 px-3 text-center">Pts</th>
                    <th className="py-2 px-3 rounded-tr-lg"></th>
                  </tr>
                </thead>
                <tbody>
                  {matchups.slice(0, 10).map((matchup) => (
                    <tr key={matchup.id} className="border-b border-[var(--border-light)] hover:bg-[var(--masters-cream)]">
                      <td className="py-2 px-3">{matchup.weekNumber}</td>
                      <td className="py-2 px-3 font-medium">
                        {matchup.teamA.name}
                        {matchup.teamAIsSub && (
                          <span className="ml-1 px-1 py-0.5 text-xs bg-[var(--warning-bg)] text-[var(--warning-text)] rounded">SUB</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold text-[var(--masters-green)]">{matchup.teamAPoints}</td>
                      <td className="py-2 px-3 font-medium">
                        {matchup.teamB.name}
                        {matchup.teamBIsSub && (
                          <span className="ml-1 px-1 py-0.5 text-xs bg-[var(--warning-bg)] text-[var(--warning-text)] rounded">SUB</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold text-[var(--masters-green)]">{matchup.teamBPoints}</td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => handleDeleteMatchup(matchup.id)}
                          disabled={loading}
                          className="text-[var(--masters-burgundy)] hover:text-[var(--masters-burgundy-dark)] text-sm font-medium disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matchups.length > 10 && (
              <p className="mt-3 text-sm text-[var(--text-light)]">Showing 10 of {matchups.length} matchups</p>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
