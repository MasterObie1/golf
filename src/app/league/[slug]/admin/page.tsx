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
  // Basic Formula
  handicapBaseScore: number;
  handicapMultiplier: number;
  handicapRounding: string;
  handicapDefault: number;
  handicapMax: number | null;
  handicapMin: number | null;
  // Score Selection
  handicapScoreSelection: string;
  handicapScoreCount: number | null;
  handicapBestOf: number | null;
  handicapLastOf: number | null;
  handicapDropHighest: number;
  handicapDropLowest: number;
  // Score Weighting
  handicapUseWeighting: boolean;
  handicapWeightRecent: number;
  handicapWeightDecay: number;
  // Exceptional Score Handling
  handicapCapExceptional: boolean;
  handicapExceptionalCap: number | null;
  // Application Rules
  handicapPercentage: number;
  handicapMaxStrokes: number | null;
  handicapAllowanceType: string;
  // Time-Based Rules
  handicapProvWeeks: number;
  handicapProvMultiplier: number;
  handicapFreezeWeek: number | null;
  handicapUseTrend: boolean;
  handicapTrendWeight: number;
  // Administrative
  handicapRequireApproval: boolean;
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

  // Handicap settings state - Basic Formula
  const [handicapBaseScore, setHandicapBaseScore] = useState(35);
  const [handicapMultiplier, setHandicapMultiplier] = useState(0.9);
  const [handicapRounding, setHandicapRounding] = useState<"floor" | "round" | "ceil">("floor");
  const [handicapDefault, setHandicapDefault] = useState(0);
  const [handicapMax, setHandicapMax] = useState<number | "">("");
  const [handicapMin, setHandicapMin] = useState<number | "">("");

  // Score Selection
  const [handicapScoreSelection, setHandicapScoreSelection] = useState<"all" | "last_n" | "best_of_last">("all");
  const [handicapScoreCount, setHandicapScoreCount] = useState<number | "">("");
  const [handicapBestOf, setHandicapBestOf] = useState<number | "">("");
  const [handicapLastOf, setHandicapLastOf] = useState<number | "">("");
  const [handicapDropHighest, setHandicapDropHighest] = useState(0);
  const [handicapDropLowest, setHandicapDropLowest] = useState(0);

  // Score Weighting
  const [handicapUseWeighting, setHandicapUseWeighting] = useState(false);
  const [handicapWeightRecent, setHandicapWeightRecent] = useState(1.5);
  const [handicapWeightDecay, setHandicapWeightDecay] = useState(0.9);

  // Exceptional Score Handling
  const [handicapCapExceptional, setHandicapCapExceptional] = useState(false);
  const [handicapExceptionalCap, setHandicapExceptionalCap] = useState<number | "">("");

  // Application Rules
  const [handicapPercentage, setHandicapPercentage] = useState(100);
  const [handicapMaxStrokes, setHandicapMaxStrokes] = useState<number | "">("");
  const [handicapAllowanceType, setHandicapAllowanceType] = useState<"full" | "percentage" | "difference">("full");

  // Time-Based Rules
  const [handicapProvWeeks, setHandicapProvWeeks] = useState(0);
  const [handicapProvMultiplier, setHandicapProvMultiplier] = useState(1.0);
  const [handicapFreezeWeek, setHandicapFreezeWeek] = useState<number | "">("");
  const [handicapUseTrend, setHandicapUseTrend] = useState(false);
  const [handicapTrendWeight, setHandicapTrendWeight] = useState(0.1);

  // Administrative
  const [handicapRequireApproval, setHandicapRequireApproval] = useState(false);

  // Preview and UI
  const [handicapPreviewAvg, setHandicapPreviewAvg] = useState(42);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["basic"]));

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

      // Load handicap settings - Basic Formula
      setHandicapBaseScore(leagueData.handicapBaseScore);
      setHandicapMultiplier(leagueData.handicapMultiplier);
      setHandicapRounding(leagueData.handicapRounding as "floor" | "round" | "ceil");
      setHandicapDefault(leagueData.handicapDefault);
      setHandicapMax(leagueData.handicapMax ?? "");
      setHandicapMin(leagueData.handicapMin ?? "");

      // Score Selection
      setHandicapScoreSelection((leagueData.handicapScoreSelection || "all") as "all" | "last_n" | "best_of_last");
      setHandicapScoreCount(leagueData.handicapScoreCount ?? "");
      setHandicapBestOf(leagueData.handicapBestOf ?? "");
      setHandicapLastOf(leagueData.handicapLastOf ?? "");
      setHandicapDropHighest(leagueData.handicapDropHighest || 0);
      setHandicapDropLowest(leagueData.handicapDropLowest || 0);

      // Score Weighting
      setHandicapUseWeighting(leagueData.handicapUseWeighting || false);
      setHandicapWeightRecent(leagueData.handicapWeightRecent || 1.5);
      setHandicapWeightDecay(leagueData.handicapWeightDecay || 0.9);

      // Exceptional Score Handling
      setHandicapCapExceptional(leagueData.handicapCapExceptional || false);
      setHandicapExceptionalCap(leagueData.handicapExceptionalCap ?? "");

      // Application Rules
      setHandicapPercentage(leagueData.handicapPercentage || 100);
      setHandicapMaxStrokes(leagueData.handicapMaxStrokes ?? "");
      setHandicapAllowanceType((leagueData.handicapAllowanceType || "full") as "full" | "percentage" | "difference");

      // Time-Based Rules
      setHandicapProvWeeks(leagueData.handicapProvWeeks || 0);
      setHandicapProvMultiplier(leagueData.handicapProvMultiplier || 1.0);
      setHandicapFreezeWeek(leagueData.handicapFreezeWeek ?? "");
      setHandicapUseTrend(leagueData.handicapUseTrend || false);
      setHandicapTrendWeight(leagueData.handicapTrendWeight || 0.1);

      // Administrative
      setHandicapRequireApproval(leagueData.handicapRequireApproval || false);

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
      await updateHandicapSettings(slug, {
        // Basic Formula
        baseScore: handicapBaseScore,
        multiplier: handicapMultiplier,
        rounding: handicapRounding,
        defaultHandicap: handicapDefault,
        maxHandicap: handicapMax === "" ? null : handicapMax,
        minHandicap: handicapMin === "" ? null : handicapMin,

        // Score Selection
        scoreSelection: handicapScoreSelection,
        scoreCount: handicapScoreCount === "" ? null : handicapScoreCount,
        bestOf: handicapBestOf === "" ? null : handicapBestOf,
        lastOf: handicapLastOf === "" ? null : handicapLastOf,
        dropHighest: handicapDropHighest,
        dropLowest: handicapDropLowest,

        // Score Weighting
        useWeighting: handicapUseWeighting,
        weightRecent: handicapWeightRecent,
        weightDecay: handicapWeightDecay,

        // Exceptional Score Handling
        capExceptional: handicapCapExceptional,
        exceptionalCap: handicapExceptionalCap === "" ? null : handicapExceptionalCap,

        // Application Rules
        percentage: handicapPercentage,
        maxStrokes: handicapMaxStrokes === "" ? null : handicapMaxStrokes,
        allowanceType: handicapAllowanceType,

        // Time-Based Rules
        provWeeks: handicapProvWeeks,
        provMultiplier: handicapProvMultiplier,
        freezeWeek: handicapFreezeWeek === "" ? null : handicapFreezeWeek,
        useTrend: handicapUseTrend,
        trendWeight: handicapTrendWeight,

        // Administrative
        requireApproval: handicapRequireApproval,
      });
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
      result = handicapMax;
    }
    // Apply min cap
    if (handicapMin !== "" && result < handicapMin) {
      result = handicapMin;
    }
    // Apply percentage if not 100%
    if (handicapPercentage !== 100) {
      result = Math.floor(result * (handicapPercentage / 100));
    }
    return result;
  }

  function toggleSection(section: string) {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }

  function applyPreset(presetName: string) {
    setSelectedPreset(presetName);
    switch (presetName) {
      case "simple":
        setHandicapScoreSelection("all");
        setHandicapDropHighest(0);
        setHandicapDropLowest(0);
        setHandicapUseWeighting(false);
        setHandicapPercentage(100);
        break;
      case "usga_style":
        setHandicapScoreSelection("best_of_last");
        setHandicapBestOf(4);
        setHandicapLastOf(8);
        setHandicapMultiplier(0.96);
        setHandicapUseWeighting(false);
        setHandicapPercentage(100);
        break;
      case "forgiving":
        setHandicapScoreSelection("last_n");
        setHandicapScoreCount(5);
        setHandicapDropHighest(1);
        setHandicapDropLowest(0);
        setHandicapUseWeighting(false);
        setHandicapPercentage(100);
        break;
      case "competitive":
        setHandicapScoreSelection("all");
        setHandicapDropHighest(0);
        setHandicapDropLowest(0);
        setHandicapUseWeighting(true);
        setHandicapWeightRecent(1.3);
        setHandicapWeightDecay(0.95);
        setHandicapPercentage(80);
        break;
      case "strict":
        setHandicapScoreSelection("all");
        setHandicapMax(18);
        setHandicapCapExceptional(true);
        setHandicapExceptionalCap(50);
        setHandicapUseTrend(true);
        setHandicapTrendWeight(0.15);
        setHandicapPercentage(100);
        break;
      case "custom":
      default:
        // Don't change anything for custom
        break;
    }
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

            {/* Handicap Formula - Comprehensive Settings */}
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">Handicap Configuration</h3>

              {/* Preset Templates */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quick Presets</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: "simple", label: "Simple Average", desc: "Basic formula using all scores" },
                    { name: "usga_style", label: "USGA-Inspired", desc: "Best 4 of last 8, like official handicaps" },
                    { name: "forgiving", label: "Forgiving", desc: "Drops worst scores, uses recent rounds" },
                    { name: "competitive", label: "Competitive", desc: "80% handicap, slight edge to better players" },
                    { name: "strict", label: "Strict", desc: "Caps and trend adjustment to prevent sandbagging" },
                    { name: "custom", label: "Custom", desc: "Full control over all settings" },
                  ].map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset.name)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        selectedPreset === preset.name
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-gray-700 border-gray-300 hover:border-green-500"
                      }`}
                      title={preset.desc}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Formula Section */}
              <div className="mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection("basic")}
                  className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100"
                >
                  <span>Basic Formula</span>
                  <span className="text-gray-500">{expandedSections.has("basic") ? "−" : "+"}</span>
                </button>
                {expandedSections.has("basic") && (
                  <div className="p-4 border-t">
                    <p className="text-sm text-gray-500 mb-4">
                      Formula: (Average Score - Base Score) × Multiplier
                    </p>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Base Score (Par)</label>
                        <input
                          type="number"
                          value={handicapBaseScore}
                          onChange={(e) => { setHandicapBaseScore(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Multiplier</label>
                        <input
                          type="number"
                          value={handicapMultiplier}
                          onChange={(e) => { setHandicapMultiplier(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rounding</label>
                        <select
                          value={handicapRounding}
                          onChange={(e) => { setHandicapRounding(e.target.value as "floor" | "round" | "ceil"); setSelectedPreset("custom"); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="floor">Floor (round down)</option>
                          <option value="round">Round (nearest)</option>
                          <option value="ceil">Ceiling (round up)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Handicap</label>
                        <input
                          type="number"
                          value={handicapDefault}
                          onChange={(e) => { setHandicapDefault(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">When no scores available</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Handicap</label>
                        <input
                          type="number"
                          value={handicapMax}
                          onChange={(e) => { setHandicapMax(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }}
                          placeholder="No limit"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Handicap</label>
                        <input
                          type="number"
                          value={handicapMin}
                          onChange={(e) => { setHandicapMin(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }}
                          placeholder="No limit"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">For scratch golfers</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Score Selection Section */}
              <div className="mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection("selection")}
                  className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100"
                >
                  <span>Score Selection</span>
                  <span className="text-gray-500">{expandedSections.has("selection") ? "−" : "+"}</span>
                </button>
                {expandedSections.has("selection") && (
                  <div className="p-4 border-t">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Selection Method</label>
                        <select
                          value={handicapScoreSelection}
                          onChange={(e) => { setHandicapScoreSelection(e.target.value as "all" | "last_n" | "best_of_last"); setSelectedPreset("custom"); }}
                          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="all">Use All Scores</option>
                          <option value="last_n">Use Last N Scores</option>
                          <option value="best_of_last">Best X of Last Y Scores</option>
                        </select>
                      </div>

                      {handicapScoreSelection === "last_n" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Number of Recent Scores</label>
                          <input
                            type="number"
                            value={handicapScoreCount}
                            onChange={(e) => { setHandicapScoreCount(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }}
                            min="1"
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      )}

                      {handicapScoreSelection === "best_of_last" && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Use Best</label>
                            <input
                              type="number"
                              value={handicapBestOf}
                              onChange={(e) => { setHandicapBestOf(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }}
                              min="1"
                              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">Best X scores</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Of Last</label>
                            <input
                              type="number"
                              value={handicapLastOf}
                              onChange={(e) => { setHandicapLastOf(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }}
                              min="1"
                              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">From last Y rounds</p>
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Drop Highest Scores</label>
                        <input
                          type="number"
                          value={handicapDropHighest}
                          onChange={(e) => { setHandicapDropHighest(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }}
                          min="0"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Remove worst rounds</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Drop Lowest Scores</label>
                        <input
                          type="number"
                          value={handicapDropLowest}
                          onChange={(e) => { setHandicapDropLowest(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }}
                          min="0"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Remove best rounds</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Score Weighting Section */}
              <div className="mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection("weighting")}
                  className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100"
                >
                  <span>Score Weighting</span>
                  <span className="text-gray-500">{expandedSections.has("weighting") ? "−" : "+"}</span>
                </button>
                {expandedSections.has("weighting") && (
                  <div className="p-4 border-t">
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={handicapUseWeighting}
                          onChange={(e) => { setHandicapUseWeighting(e.target.checked); setSelectedPreset("custom"); }}
                          className="w-4 h-4 text-green-600 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">Enable Recency Weighting</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-6">Recent scores count more towards handicap</p>
                    </div>

                    {handicapUseWeighting && (
                      <div className="grid md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Recent Score Weight</label>
                          <input
                            type="number"
                            value={handicapWeightRecent}
                            onChange={(e) => { setHandicapWeightRecent(parseFloat(e.target.value) || 1); setSelectedPreset("custom"); }}
                            step="0.1"
                            min="1"
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">Weight for most recent (1.0 = no boost)</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Decay Factor</label>
                          <input
                            type="number"
                            value={handicapWeightDecay}
                            onChange={(e) => { setHandicapWeightDecay(parseFloat(e.target.value) || 0.9); setSelectedPreset("custom"); }}
                            step="0.05"
                            min="0.1"
                            max="1"
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">Each older score × this factor</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={handicapCapExceptional}
                          onChange={(e) => { setHandicapCapExceptional(e.target.checked); setSelectedPreset("custom"); }}
                          className="w-4 h-4 text-green-600 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">Cap Exceptional Scores</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-6">Limit very high scores before averaging</p>
                    </div>

                    {handicapCapExceptional && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Score Value</label>
                        <input
                          type="number"
                          value={handicapExceptionalCap}
                          onChange={(e) => { setHandicapExceptionalCap(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }}
                          placeholder="e.g., 50"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Scores above this are reduced to this value</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Application Rules Section */}
              <div className="mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection("application")}
                  className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100"
                >
                  <span>Application Rules</span>
                  <span className="text-gray-500">{expandedSections.has("application") ? "−" : "+"}</span>
                </button>
                {expandedSections.has("application") && (
                  <div className="p-4 border-t">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Handicap Percentage</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={handicapPercentage}
                            onChange={(e) => { setHandicapPercentage(parseFloat(e.target.value) || 100); setSelectedPreset("custom"); }}
                            min="0"
                            max="100"
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-gray-500">%</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Apply X% of calculated handicap (80% is common for competitive play)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Strokes Between Players</label>
                        <input
                          type="number"
                          value={handicapMaxStrokes}
                          onChange={(e) => { setHandicapMaxStrokes(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }}
                          placeholder="No limit"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Limits stroke difference in head-to-head</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Allowance Type</label>
                        <select
                          value={handicapAllowanceType}
                          onChange={(e) => { setHandicapAllowanceType(e.target.value as "full" | "percentage" | "difference"); setSelectedPreset("custom"); }}
                          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="full">Full Handicap</option>
                          <option value="percentage">Percentage of Handicap</option>
                          <option value="difference">Difference Only (lower handicap gives strokes)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Time-Based Rules Section */}
              <div className="mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection("timebased")}
                  className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100"
                >
                  <span>Time-Based Rules</span>
                  <span className="text-gray-500">{expandedSections.has("timebased") ? "−" : "+"}</span>
                </button>
                {expandedSections.has("timebased") && (
                  <div className="p-4 border-t">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Provisional Period (Weeks)</label>
                        <input
                          type="number"
                          value={handicapProvWeeks}
                          onChange={(e) => { setHandicapProvWeeks(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }}
                          min="0"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">0 = disabled</p>
                      </div>
                      {handicapProvWeeks > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Provisional Multiplier</label>
                          <input
                            type="number"
                            value={handicapProvMultiplier}
                            onChange={(e) => { setHandicapProvMultiplier(parseFloat(e.target.value) || 1); setSelectedPreset("custom"); }}
                            step="0.1"
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">Multiply handicap by this during provisional</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Freeze Handicaps After Week</label>
                        <input
                          type="number"
                          value={handicapFreezeWeek}
                          onChange={(e) => { setHandicapFreezeWeek(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }}
                          placeholder="Never"
                          min="1"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Lock handicaps for playoffs</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={handicapUseTrend}
                          onChange={(e) => { setHandicapUseTrend(e.target.checked); setSelectedPreset("custom"); }}
                          className="w-4 h-4 text-green-600 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">Enable Trend Adjustment</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-6">Adjust handicap based on improvement/decline trend</p>
                    </div>

                    {handicapUseTrend && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Trend Weight</label>
                        <input
                          type="number"
                          value={handicapTrendWeight}
                          onChange={(e) => { setHandicapTrendWeight(parseFloat(e.target.value) || 0.1); setSelectedPreset("custom"); }}
                          step="0.05"
                          min="0"
                          max="0.5"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">How much to factor in trend (0.1 = 10%)</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Preview Calculator */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Preview Calculator</h4>
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Test Average Score</label>
                    <input
                      type="number"
                      value={handicapPreviewAvg}
                      onChange={(e) => setHandicapPreviewAvg(parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-1.5 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="text-gray-400">=</div>
                  <div className="bg-white px-4 py-2 rounded-lg border border-green-200">
                    <span className="text-xs text-gray-500">Applied Handicap: </span>
                    <span className="text-lg font-bold text-green-700">
                      {calculatePreviewHandicap(handicapPreviewAvg)}
                    </span>
                    {handicapMax !== "" && calculatePreviewHandicap(handicapPreviewAvg) >= handicapMax && (
                      <span className="ml-2 text-xs text-orange-600 font-medium">(max capped)</span>
                    )}
                    {handicapMin !== "" && calculatePreviewHandicap(handicapPreviewAvg) <= handicapMin && (
                      <span className="ml-2 text-xs text-blue-600 font-medium">(min capped)</span>
                    )}
                    {handicapPercentage !== 100 && (
                      <span className="ml-2 text-xs text-purple-600 font-medium">({handicapPercentage}%)</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Formula: ({handicapPreviewAvg} - {handicapBaseScore}) × {handicapMultiplier} = {((handicapPreviewAvg - handicapBaseScore) * handicapMultiplier).toFixed(2)}
                  {handicapPercentage !== 100 && ` × ${handicapPercentage}%`}
                </p>
              </div>

              <button
                onClick={handleSaveHandicapSettings}
                disabled={loading}
                className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save Handicap Settings"}
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
