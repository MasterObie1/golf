"use client";

import Image from "next/image";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getTeams,
  getCurrentWeekNumber,
  previewMatchup,
  submitMatchup,
  submitForfeit,
  getMatchupHistory,
  deleteMatchup,
  getLeagueBySlug,
  updateLeagueSettings,
  updateHandicapSettings,
  getLeagueAbout,
  updateLeagueAbout,
  getAllTeamsWithStatus,
  approveTeam,
  rejectTeam,
  deleteTeam,
  type MatchupPreview,
  type LeagueAbout,
} from "@/lib/actions";

interface Props {
  params: Promise<{ slug: string }>;
}

interface Team {
  id: number;
  name: string;
  status?: string;
  captainName?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface League {
  id: number;
  name: string;
  slug: string;
  maxTeams: number;
  registrationOpen: boolean;
  handicapBaseScore: number;
  handicapMultiplier: number;
  handicapRounding: string;
  handicapDefault: number;
  handicapMax: number | null;
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

export default function LeagueAdminPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();

  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [weekNumber, setWeekNumber] = useState(1);

  // Settings state
  const [maxTeamsInput, setMaxTeamsInput] = useState(16);
  const [registrationOpenInput, setRegistrationOpenInput] = useState(true);
  const [activeTab, setActiveTab] = useState<"matchups" | "teams" | "settings" | "about">("matchups");

  // About the League state
  const [aboutData, setAboutData] = useState<LeagueAbout | null>(null);
  const [leagueName, setLeagueName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [numberOfWeeks, setNumberOfWeeks] = useState<number | "">("");
  const [courseName, setCourseName] = useState("");
  const [courseLocation, setCourseLocation] = useState("");
  const [playDay, setPlayDay] = useState("");
  const [playTime, setPlayTime] = useState("");
  const [entryFee, setEntryFee] = useState<number | "">("");
  const [prizeInfo, setPrizeInfo] = useState("");
  const [leagueDescription, setLeagueDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Handicap settings state
  const [handicapBaseScore, setHandicapBaseScore] = useState(35);
  const [handicapMultiplier, setHandicapMultiplier] = useState(0.9);
  const [handicapRounding, setHandicapRounding] = useState<"floor" | "round" | "ceil">("floor");
  const [handicapDefault, setHandicapDefault] = useState(0);
  const [handicapMax, setHandicapMax] = useState<number | "">("");
  const [handicapPreviewAvg, setHandicapPreviewAvg] = useState(42);

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isWeekOne = weekNumber === 1;

  useEffect(() => {
    loadInitialData();
  }, [slug]);

  async function loadInitialData() {
    try {
      const leagueData = await getLeagueBySlug(slug);
      if (!leagueData) {
        router.push("/leagues");
        return;
      }
      setLeague(leagueData);

      const [teamsData, currentWeek, matchupsData, allTeamsData, aboutDataResult] = await Promise.all([
        getTeams(leagueData.id),
        getCurrentWeekNumber(leagueData.id),
        getMatchupHistory(leagueData.id),
        getAllTeamsWithStatus(slug),
        getLeagueAbout(leagueData.id),
      ]);

      setTeams(teamsData);
      setWeekNumber(currentWeek);
      setMatchups(matchupsData);
      setAllTeams(allTeamsData);
      setMaxTeamsInput(leagueData.maxTeams);
      setRegistrationOpenInput(leagueData.registrationOpen);

      // Load handicap settings
      setHandicapBaseScore(leagueData.handicapBaseScore);
      setHandicapMultiplier(leagueData.handicapMultiplier);
      setHandicapRounding(leagueData.handicapRounding as "floor" | "round" | "ceil");
      setHandicapDefault(leagueData.handicapDefault);
      setHandicapMax(leagueData.handicapMax ?? "");

      // Load about settings
      setAboutData(aboutDataResult);
      setLeagueName(aboutDataResult.leagueName || "");
      setStartDate(aboutDataResult.startDate ? new Date(aboutDataResult.startDate).toISOString().split("T")[0] : "");
      setEndDate(aboutDataResult.endDate ? new Date(aboutDataResult.endDate).toISOString().split("T")[0] : "");
      setNumberOfWeeks(aboutDataResult.numberOfWeeks || "");
      setCourseName(aboutDataResult.courseName || "");
      setCourseLocation(aboutDataResult.courseLocation || "");
      setPlayDay(aboutDataResult.playDay || "");
      setPlayTime(aboutDataResult.playTime || "");
      setEntryFee(aboutDataResult.entryFee || "");
      setPrizeInfo(aboutDataResult.prizeInfo || "");
      setLeagueDescription(aboutDataResult.description || "");
      setContactEmail(aboutDataResult.contactEmail || "");
      setContactPhone(aboutDataResult.contactPhone || "");
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setInitialLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push(`/league/${slug}`);
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  async function handlePreview() {
    if (!league) return;
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
      const previewData = await previewMatchup(
        league.id,
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
      setTeamAPointsOverride("");
      setTeamBPointsOverride("");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to generate preview." });
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!preview || !league) return;

    setLoading(true);
    try {
      await submitMatchup(
        slug,
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
      setPreview(null);
      setTeamAId("");
      setTeamBId("");
      setTeamAGross("");
      setTeamBGross("");
      setTeamAHandicapManual("");
      setTeamBHandicapManual("");
      setTeamAIsSub(false);
      setTeamBIsSub(false);
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(league.id),
        getMatchupHistory(league.id),
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
    if (!league) return;
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
      await submitForfeit(slug, weekNumber, winningTeamId as number, forfeitingTeamId as number);
      setMessage({ type: "success", text: "Forfeit recorded successfully!" });
      setWinningTeamId("");
      setForfeitingTeamId("");
      setIsForfeitMode(false);
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(league.id),
        getMatchupHistory(league.id),
      ]);
      setWeekNumber(currentWeek);
      setMatchups(matchupsData);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to record forfeit. Teams may have already played this week." });
    }
    setLoading(false);
  }

  async function handleDeleteMatchup(matchupId: number) {
    if (!league) return;
    if (!confirm("Are you sure you want to delete this matchup? Team stats will be reversed.")) {
      return;
    }
    setLoading(true);
    try {
      await deleteMatchup(slug, matchupId);
      setMessage({ type: "success", text: "Matchup deleted successfully!" });
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(league.id),
        getMatchupHistory(league.id),
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
      await updateLeagueSettings(slug, maxTeamsInput, registrationOpenInput);
      const leagueData = await getLeagueBySlug(slug);
      setLeague(leagueData);
      setMessage({ type: "success", text: "Settings saved successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings." });
    }
    setLoading(false);
  }

  async function handleSaveHandicapSettings() {
    if (!league) return;
    setLoading(true);
    try {
      await updateHandicapSettings(
        slug,
        handicapBaseScore,
        handicapMultiplier,
        handicapRounding,
        handicapDefault,
        handicapMax === "" ? null : handicapMax
      );
      // Refresh all data since handicaps, nets, points, and team stats were recalculated
      const [leagueData, matchupsData, teamsData] = await Promise.all([
        getLeagueBySlug(slug),
        getMatchupHistory(league.id),
        getTeams(league.id),
      ]);
      setLeague(leagueData);
      setMatchups(matchupsData);
      setTeams(teamsData);
      setMessage({ type: "success", text: "Handicap formula saved and all stats recalculated!" });
    } catch (error) {
      console.error("Handicap settings error:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save handicap settings."
      });
    }
    setLoading(false);
  }

  async function handleSaveAbout() {
    if (!league) return;
    setLoading(true);
    try {
      await updateLeagueAbout(slug, {
        leagueName: leagueName || league.name,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        numberOfWeeks: numberOfWeeks !== "" ? numberOfWeeks : null,
        courseName: courseName || null,
        courseLocation: courseLocation || null,
        playDay: playDay || null,
        playTime: playTime || null,
        entryFee: entryFee !== "" ? entryFee : null,
        prizeInfo: prizeInfo || null,
        description: leagueDescription || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
      });
      const aboutDataResult = await getLeagueAbout(league.id);
      setAboutData(aboutDataResult);
      setMessage({ type: "success", text: "League information saved successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save league information." });
    }
    setLoading(false);
  }

  function calculatePreviewHandicap(avg: number): number {
    const rawHandicap = (avg - handicapBaseScore) * handicapMultiplier;
    let result: number;
    switch (handicapRounding) {
      case "floor": result = Math.floor(rawHandicap); break;
      case "ceil": result = Math.ceil(rawHandicap); break;
      case "round": result = Math.round(rawHandicap); break;
      default: result = Math.floor(rawHandicap);
    }
    // Apply max cap
    if (handicapMax !== "" && result > handicapMax) {
      return handicapMax;
    }
    return result;
  }

  async function handleApproveTeam(teamId: number) {
    if (!league) return;
    setLoading(true);
    try {
      await approveTeam(slug, teamId);
      const [teamsData, allTeamsData] = await Promise.all([
        getTeams(league.id),
        getAllTeamsWithStatus(slug),
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
      await rejectTeam(slug, teamId);
      const allTeamsData = await getAllTeamsWithStatus(slug);
      setAllTeams(allTeamsData);
      setMessage({ type: "success", text: "Team rejected." });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to reject team." });
    }
    setLoading(false);
  }

  async function handleDeleteTeam(teamId: number, teamName: string) {
    if (!league) return;
    if (!confirm(`Are you sure you want to delete team "${teamName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await deleteTeam(slug, teamId);
      const [teamsData, allTeamsData] = await Promise.all([
        getTeams(league.id),
        getAllTeamsWithStatus(slug),
      ]);
      setTeams(teamsData);
      setAllTeams(allTeamsData);
      setMessage({ type: "success", text: `Team "${teamName}" deleted.` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to delete team." });
    }
    setLoading(false);
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">League not found</p>
          <Link href="/leagues" className="text-green-600 hover:text-green-700">
            Browse Leagues
          </Link>
        </div>
      </div>
    );
  }

  const pendingTeams = allTeams.filter((t) => t.status === "pending");
  const approvedTeams = allTeams.filter((t) => t.status === "approved");
  const rejectedTeams = allTeams.filter((t) => t.status === "rejected");

  return (
    <div className="min-h-screen bg-green-50">
      {/* Header Banner */}
      <div className="relative h-40 md:h-48">
        <Image
          src="https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=1920&q=80"
          alt="Golf course landscape"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-green-800/70 to-green-800/90" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg">
            Admin Dashboard
          </h1>
          <p className="text-white/80 mt-1">{league.name}</p>
        </div>
        <div className="absolute top-4 left-4">
          <Link
            href={`/league/${slug}`}
            className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 text-sm"
          >
            &larr; Back to League
          </Link>
        </div>
        <div className="absolute top-4 right-4">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 text-sm font-medium shadow"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 -mt-4">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-100 text-green-800 border border-green-200"
                : "bg-red-100 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab("matchups")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "matchups"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            Matchups
          </button>
          <button
            onClick={() => setActiveTab("teams")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "teams"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            Teams
            {pendingTeams.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-400 text-yellow-900 rounded-full">
                {pendingTeams.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "settings"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              activeTab === "about"
                ? "bg-green-700 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            About
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "settings" && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6 text-gray-800">League Settings</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Number of Teams
                </label>
                <input
                  type="number"
                  value={maxTeamsInput}
                  onChange={(e) => setMaxTeamsInput(parseInt(e.target.value) || 1)}
                  min={1}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Currently {approvedTeams.length} approved team(s)
                </p>
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registrationOpenInput}
                    onChange={(e) => setRegistrationOpenInput(e.target.checked)}
                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <span className="text-gray-800 font-medium">Registration Open</span>
                </label>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save Settings"}
              </button>
            </div>

            {/* Handicap Formula */}
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">Handicap Formula</h3>
              <p className="text-sm text-gray-500 mb-4">
                Formula: (Average Score - Base Score) × Multiplier
              </p>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Base Score (Par)
                  </label>
                  <input
                    type="number"
                    value={handicapBaseScore}
                    onChange={(e) => setHandicapBaseScore(parseFloat(e.target.value) || 0)}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Multiplier
                  </label>
                  <input
                    type="number"
                    value={handicapMultiplier}
                    onChange={(e) => setHandicapMultiplier(parseFloat(e.target.value) || 0)}
                    step="0.1"
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rounding Method
                  </label>
                  <select
                    value={handicapRounding}
                    onChange={(e) => setHandicapRounding(e.target.value as "floor" | "round" | "ceil")}
                    className="w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="floor">Floor (round down)</option>
                    <option value="round">Round (nearest)</option>
                    <option value="ceil">Ceiling (round up)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Handicap
                  </label>
                  <input
                    type="number"
                    value={handicapDefault}
                    onChange={(e) => setHandicapDefault(parseFloat(e.target.value) || 0)}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Handicap
                  </label>
                  <input
                    type="number"
                    value={handicapMax}
                    onChange={(e) => setHandicapMax(e.target.value ? parseFloat(e.target.value) : "")}
                    placeholder="No limit"
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Leave empty for no limit
                  </p>
                </div>
              </div>

              {/* Preview */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Preview Calculator</h4>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Test Average</label>
                    <input
                      type="number"
                      value={handicapPreviewAvg}
                      onChange={(e) => setHandicapPreviewAvg(parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-1.5 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="text-gray-400">=</div>
                  <div className="bg-white px-4 py-2 rounded-lg border border-green-200">
                    <span className="text-xs text-gray-500">Handicap: </span>
                    <span className="text-lg font-bold text-green-700">
                      {calculatePreviewHandicap(handicapPreviewAvg)}
                    </span>
                    {handicapMax !== "" && calculatePreviewHandicap(handicapPreviewAvg) === handicapMax && (
                      <span className="ml-2 text-xs text-orange-600 font-medium">(capped)</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveHandicapSettings}
                disabled={loading}
                className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save Handicap Formula"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "about" && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6 text-gray-800">About the League</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  League Name
                </label>
                <input
                  type="text"
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="e.g., Thursday Night Golf League"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={leagueDescription}
                  onChange={(e) => setLeagueDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Course Name
                  </label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={courseLocation}
                    onChange={(e) => setCourseLocation(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Play Day
                  </label>
                  <select
                    value={playDay}
                    onChange={(e) => setPlayDay(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select a day...</option>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Play Time
                  </label>
                  <input
                    type="text"
                    value={playTime}
                    onChange={(e) => setPlayTime(e.target.value)}
                    placeholder="e.g., 5:30 PM"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Entry Fee ($)
                  </label>
                  <input
                    type="number"
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value ? parseFloat(e.target.value) : "")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveAbout}
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save League Information"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "teams" && (
          <div className="space-y-6">
            {pendingTeams.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 border border-yellow-300">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">
                  Pending Approval ({pendingTeams.length})
                </h2>
                <div className="space-y-4">
                  {pendingTeams.map((team) => (
                    <div key={team.id} className="p-4 bg-yellow-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-800">{team.name}</h3>
                          {team.captainName && <p className="text-sm text-gray-600">Captain: {team.captainName}</p>}
                          {team.email && <p className="text-sm text-gray-500">{team.email}</p>}
                          {team.phone && <p className="text-sm text-gray-500">{team.phone}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveTeam(team.id)}
                            disabled={loading}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectTeam(team.id)}
                            disabled={loading}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
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

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">
                Approved Teams ({approvedTeams.length}/{league.maxTeams})
              </h2>
              {approvedTeams.length === 0 ? (
                <p className="text-gray-500">No approved teams yet.</p>
              ) : (
                <div className="space-y-2">
                  {approvedTeams.map((team) => (
                    <div key={team.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="font-medium text-gray-800">{team.name}</span>
                        {team.captainName && <span className="ml-2 text-sm text-gray-500">({team.captainName})</span>}
                      </div>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {rejectedTeams.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 border border-red-200">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">
                  Rejected Teams ({rejectedTeams.length})
                </h2>
                <div className="space-y-2">
                  {rejectedTeams.map((team) => (
                    <div key={team.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                      <span className="text-gray-600">{team.name}</span>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
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

        {activeTab === "matchups" && (
          <>
            {/* Matchup Entry Form */}
            {!preview ? (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">
                    {isForfeitMode ? "Record Forfeit" : "Enter Matchup Results"}
                  </h2>
                  <button
                    onClick={() => {
                      setIsForfeitMode(!isForfeitMode);
                      setMessage(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${
                      isForfeitMode
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {isForfeitMode ? "Cancel Forfeit" : "Record Forfeit"}
                  </button>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Week Number
                  </label>
                  <input
                    type="number"
                    value={weekNumber}
                    onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
                    min={1}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                  {isWeekOne && !isForfeitMode && (
                    <p className="mt-2 text-sm text-yellow-700 font-medium">
                      Week 1: Manual handicap entry required
                    </p>
                  )}
                </div>

                {isForfeitMode ? (
                  <div className="space-y-6">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-700">
                        A forfeit awards 20 points to the winning team and 0 points to the forfeiting team.
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <label className="block text-sm font-medium text-green-700 mb-2">
                          Winning Team (receives 20 pts)
                        </label>
                        <select
                          value={winningTeamId}
                          onChange={(e) => setWinningTeamId(e.target.value ? parseInt(e.target.value) : "")}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        >
                          <option value="">-- Select Team --</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <label className="block text-sm font-medium text-red-700 mb-2">
                          Forfeiting Team (receives 0 pts)
                        </label>
                        <select
                          value={forfeitingTeamId}
                          onChange={(e) => setForfeitingTeamId(e.target.value ? parseInt(e.target.value) : "")}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                      className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {loading ? "Recording..." : "Record Forfeit"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid md:grid-cols-2 gap-8">
                      {/* Team A */}
                      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold text-lg text-green-700">Team A</h3>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select Team
                          </label>
                          <select
                            value={teamAId}
                            onChange={(e) => setTeamAId(e.target.value ? parseInt(e.target.value) : "")}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="">-- Select Team --</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Gross Score
                          </label>
                          <input
                            type="number"
                            value={teamAGross}
                            onChange={(e) => setTeamAGross(e.target.value ? parseInt(e.target.value) : "")}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        {(isWeekOne || teamAIsSub) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Handicap (Manual)
                            </label>
                            <input
                              type="number"
                              value={teamAHandicapManual}
                              onChange={(e) => setTeamAHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="teamAIsSub"
                            checked={teamAIsSub}
                            onChange={(e) => setTeamAIsSub(e.target.checked)}
                            className="w-4 h-4 text-green-600"
                          />
                          <label htmlFor="teamAIsSub" className="text-sm text-gray-600">
                            Substitute played
                          </label>
                        </div>
                      </div>

                      {/* Team B */}
                      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-semibold text-lg text-green-700">Team B</h3>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select Team
                          </label>
                          <select
                            value={teamBId}
                            onChange={(e) => setTeamBId(e.target.value ? parseInt(e.target.value) : "")}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="">-- Select Team --</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Gross Score
                          </label>
                          <input
                            type="number"
                            value={teamBGross}
                            onChange={(e) => setTeamBGross(e.target.value ? parseInt(e.target.value) : "")}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        {(isWeekOne || teamBIsSub) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Handicap (Manual)
                            </label>
                            <input
                              type="number"
                              value={teamBHandicapManual}
                              onChange={(e) => setTeamBHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="teamBIsSub"
                            checked={teamBIsSub}
                            onChange={(e) => setTeamBIsSub(e.target.checked)}
                            className="w-4 h-4 text-green-600"
                          />
                          <label htmlFor="teamBIsSub" className="text-sm text-gray-600">
                            Substitute played
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8">
                      <button
                        onClick={handlePreview}
                        disabled={loading || teams.length < 2}
                        className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {loading ? "Loading..." : "Preview Results"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Preview Panel */
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-6 text-gray-800">Preview - Week {preview.weekNumber}</h2>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-green-700 text-white">
                      <tr>
                        <th className="py-3 px-4">Team</th>
                        <th className="py-3 px-4 text-center">Gross</th>
                        <th className="py-3 px-4 text-center">Handicap</th>
                        <th className="py-3 px-4 text-center">Net</th>
                        <th className="py-3 px-4 text-center">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b bg-gray-50">
                        <td className="py-3 px-4 font-medium">
                          {preview.teamAName}
                          {preview.teamAIsSub && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">SUB</span>
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
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-3 px-4 font-medium">
                          {preview.teamBName}
                          {preview.teamBIsSub && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">SUB</span>
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
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {teamAPointsOverride !== "" && teamBPointsOverride !== "" && (
                  <div className={`mt-4 p-3 rounded-lg ${
                    (teamAPointsOverride as number) + (teamBPointsOverride as number) === 20
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    Total: {(teamAPointsOverride as number) + (teamBPointsOverride as number)} / 20 points
                    {(teamAPointsOverride as number) + (teamBPointsOverride as number) !== 20 && (
                      <span className="ml-2 font-medium">(Must equal 20)</span>
                    )}
                  </div>
                )}

                <div className="mt-6 flex gap-4">
                  <button
                    onClick={handleCancelPreview}
                    className="flex-1 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300"
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
                    className="flex-1 py-3 bg-yellow-400 text-yellow-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:opacity-50"
                  >
                    {loading ? "Submitting..." : "Submit Matchup"}
                  </button>
                </div>
              </div>
            )}

            {/* Recent Matchups */}
            {matchups.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">Recent Matchups</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-green-700 text-white">
                      <tr>
                        <th className="py-2 px-3">Week</th>
                        <th className="py-2 px-3">Team A</th>
                        <th className="py-2 px-3 text-center">Pts</th>
                        <th className="py-2 px-3">Team B</th>
                        <th className="py-2 px-3 text-center">Pts</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchups.slice(0, 10).map((matchup) => (
                        <tr key={matchup.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{matchup.weekNumber}</td>
                          <td className="py-2 px-3 font-medium">{matchup.teamA.name}</td>
                          <td className="py-2 px-3 text-center font-semibold text-green-700">{matchup.teamAPoints}</td>
                          <td className="py-2 px-3 font-medium">{matchup.teamB.name}</td>
                          <td className="py-2 px-3 text-center font-semibold text-green-700">{matchup.teamBPoints}</td>
                          <td className="py-2 px-3">
                            <button
                              onClick={() => handleDeleteMatchup(matchup.id)}
                              disabled={loading}
                              className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
