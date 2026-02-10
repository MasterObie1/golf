"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import {
  getTeams,
  getCurrentWeekNumber,
  getAllTeamsWithStatus,
} from "@/lib/actions/teams";
import {
  getMatchupHistory,
  getMatchupHistoryForSeason,
} from "@/lib/actions/matchups";
import { getLeagueAbout, type LeagueAbout } from "@/lib/actions/league-about";
import {
  getSeasons,
  getActiveSeason,
  getTeamsForSeason,
  getCurrentWeekNumberForSeason,
  type SeasonInfo,
} from "@/lib/actions/seasons";
import {
  getCurrentStrokePlayWeek,
  getWeeklyScoreHistory,
  getWeeklyScoreHistoryForSeason,
  type WeeklyScoreRecord,
} from "@/lib/actions/weekly-scores";
import type { AdminLeague, AdminTeam, AdminMatchup } from "@/lib/types/admin";

import SettingsTab from "./SettingsTab";
import AboutTab from "./AboutTab";
import TeamsTab from "./TeamsTab";
import SeasonsTab from "./SeasonsTab";
import MatchupsTab from "./MatchupsTab";
import WeeklyScoresTab from "./WeeklyScoresTab";
import ScheduleTab from "./ScheduleTab";
import CourseTab from "./CourseTab";
import ScorecardsTab from "./ScorecardsTab";

interface AdminDashboardProps {
  slug: string;
  initialLeague: AdminLeague;
  initialTeams: AdminTeam[];
  initialAllTeams: AdminTeam[];
  initialMatchups: AdminMatchup[];
  initialWeeklyScores: WeeklyScoreRecord[];
  initialWeekNumber: number;
  initialStrokePlayWeek: number;
  initialSeasons: SeasonInfo[];
  initialActiveSeason: { id: number; name: string } | null;
  initialAboutData: LeagueAbout | null;
}

export default function AdminDashboard({
  slug,
  initialLeague,
  initialTeams,
  initialAllTeams,
  initialMatchups,
  initialWeeklyScores,
  initialWeekNumber,
  initialStrokePlayWeek,
  initialSeasons,
  initialActiveSeason,
  initialAboutData,
}: AdminDashboardProps) {
  const router = useRouter();

  const [league, setLeague] = useState<AdminLeague>(initialLeague);
  const [teams, setTeams] = useState<AdminTeam[]>(initialTeams);
  const [allTeams, setAllTeams] = useState<AdminTeam[]>(initialAllTeams);
  const [matchups, setMatchups] = useState<AdminMatchup[]>(initialMatchups);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScoreRecord[]>(initialWeeklyScores);
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber);
  const [strokePlayWeek, setStrokePlayWeek] = useState(initialStrokePlayWeek);

  // Season state
  const [seasons, setSeasons] = useState<SeasonInfo[]>(initialSeasons);
  const [activeSeason, setActiveSeasonState] = useState<{ id: number; name: string } | null>(initialActiveSeason);

  // About state
  const [aboutData, setAboutData] = useState<LeagueAbout | null>(initialAboutData);

  // UI state — default tab based on scoring type
  const defaultTab = initialLeague.scoringType === "stroke_play" ? "scores" : "matchups";
  const [activeTab, setActiveTab] = useState<"matchups" | "scores" | "schedule" | "teams" | "settings" | "about" | "seasons" | "course" | "scorecards">(defaultTab as "matchups" | "scores");

  async function loadInitialData() {
    try {
      const [leagueData, seasonsData, activeSeasonData, allTeamsData, aboutDataResult] = await Promise.all([
        getLeagueBySlug(slug),
        getSeasons(league.id),
        getActiveSeason(league.id),
        getAllTeamsWithStatus(slug),
        getLeagueAbout(league.id),
      ]);

      if (!leagueData) return;
      setLeague(leagueData);
      setSeasons(seasonsData);
      setActiveSeasonState(activeSeasonData ? { id: activeSeasonData.id, name: activeSeasonData.name } : null);
      setAllTeams(allTeamsData as AdminTeam[]);
      setAboutData(aboutDataResult);

      // Season-dependent parallel fetches
      const [teamsData, currentWeek, matchupsResult, weeklyScoresData, spWeek] = await Promise.all([
        activeSeasonData ? getTeamsForSeason(activeSeasonData.id) : getTeams(leagueData.id),
        activeSeasonData ? getCurrentWeekNumberForSeason(activeSeasonData.id) : getCurrentWeekNumber(leagueData.id),
        activeSeasonData ? getMatchupHistoryForSeason(activeSeasonData.id) : getMatchupHistory(leagueData.id),
        leagueData.scoringType !== "match_play"
          ? (activeSeasonData ? getWeeklyScoreHistoryForSeason(activeSeasonData.id) : getWeeklyScoreHistory(leagueData.id))
          : Promise.resolve([] as WeeklyScoreRecord[]),
        leagueData.scoringType !== "match_play"
          ? getCurrentStrokePlayWeek(leagueData.id, activeSeasonData?.id)
          : Promise.resolve(1),
      ]);

      setTeams(teamsData as AdminTeam[]);
      setWeekNumber(currentWeek);
      setMatchups(matchupsResult.matchups);
      setWeeklyScores(weeklyScoresData);
      setStrokePlayWeek(spWeek);
    } catch (error) {
      console.error("Failed to refresh data:", error);
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

  const pendingTeamsCount = allTeams.filter((t) => t.status === "pending").length;

  const tabs = useMemo(() => {
    const scoringType = league?.scoringType || "match_play";
    const scorecardMode = league?.scorecardMode || "disabled";
    const list: Array<{ key: string; label: string }> = [];
    if (scoringType !== "stroke_play") list.push({ key: "matchups", label: "Matchups" });
    if (scoringType !== "match_play") list.push({ key: "scores", label: "Weekly Scores" });
    if (scoringType !== "stroke_play") list.push({ key: "schedule", label: "Schedule" });
    list.push({ key: "course", label: "Course" });
    if (scorecardMode !== "disabled") list.push({ key: "scorecards", label: "Scorecards" });
    list.push(
      { key: "teams", label: "Teams" },
      { key: "settings", label: "Settings" },
      { key: "about", label: "About" },
      { key: "seasons", label: "Seasons" }
    );
    return list;
  }, [league?.scoringType, league?.scorecardMode]);

  return (
    <div className="min-h-screen bg-surface">
      {/* Header Bar */}
      <div className="bg-rough">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/league/${slug}`}
                className="text-putting/70 hover:text-putting text-sm font-display uppercase tracking-wider transition-colors"
              >
                &larr; Back to League
              </Link>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-white uppercase tracking-wider mt-1">
                Admin Dashboard
              </h1>
              <p className="text-putting/60 text-sm font-sans mt-0.5">{league.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-board-red/80 text-white rounded-lg hover:bg-board-red text-sm font-display font-semibold uppercase tracking-wider transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tab Navigation — Filing Cabinet Style */}
        <div
          className="flex gap-1 mb-6 flex-wrap -mt-3"
          role="tablist"
          aria-label="Admin sections"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const currentIndex = tabs.findIndex((t) => t.key === activeTab);
              const nextIndex = e.key === "ArrowRight"
                ? (currentIndex + 1) % tabs.length
                : (currentIndex - 1 + tabs.length) % tabs.length;
              setActiveTab(tabs[nextIndex].key as typeof activeTab);
              document.getElementById(`tab-${tabs[nextIndex].key}`)?.focus();
            }
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              tabIndex={activeTab === tab.key ? 0 : -1}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-5 py-2.5 font-display font-semibold text-sm uppercase tracking-wider rounded-t-lg transition-all border border-b-0 ${
                activeTab === tab.key
                  ? "bg-scorecard-paper text-scorecard-pencil border-scorecard-line/50 relative z-10 translate-y-px shadow-sm"
                  : "bg-bunker/40 text-text-muted hover:bg-bunker/60 border-transparent hover:text-scorecard-pencil"
              }`}
            >
              {tab.label}
              {tab.key === "teams" && pendingTeamsCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-board-yellow text-rough rounded-full font-mono">
                  {pendingTeamsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="bg-scorecard-paper rounded-lg rounded-tl-none shadow-sm border border-scorecard-line/50 p-6"
        >
          {activeTab === "settings" && (
            <SettingsTab
              slug={slug}
              league={league}
              approvedTeamsCount={allTeams.filter((t) => t.status === "approved").length}
              hasSeasonData={matchups.length > 0}
              onDataRefresh={(data) => {
                if (data.league) setLeague(data.league as AdminLeague);
                if (data.matchups) setMatchups(data.matchups as AdminMatchup[]);
                if (data.teams) setTeams(data.teams as AdminTeam[]);
              }}
            />
          )}

          {activeTab === "about" && aboutData && (
            <AboutTab
              slug={slug}
              leagueId={league.id}
              leagueName={league.name}
              initialAbout={aboutData}
            />
          )}

          {activeTab === "teams" && (
            <TeamsTab
              slug={slug}
              leagueId={league.id}
              maxTeams={league.maxTeams}
              allTeams={allTeams}
              midSeasonAddDefault={league.midSeasonAddDefault}
              onTeamsChanged={(teamsData, allTeamsData) => {
                setTeams(teamsData as AdminTeam[]);
                setAllTeams(allTeamsData as AdminTeam[]);
              }}
            />
          )}

          {activeTab === "seasons" && (
            <SeasonsTab
              slug={slug}
              leagueId={league.id}
              seasons={seasons}
              activeSeason={activeSeason}
              onSeasonChanged={() => loadInitialData()}
            />
          )}

          {activeTab === "matchups" && (
            <MatchupsTab
              slug={slug}
              leagueId={league.id}
              teams={teams}
              matchups={matchups}
              weekNumber={weekNumber}
              onDataRefresh={(data) => {
                if (data.weekNumber !== undefined) setWeekNumber(data.weekNumber);
                if (data.matchups) setMatchups(data.matchups as AdminMatchup[]);
              }}
            />
          )}

          {activeTab === "scores" && (
            <WeeklyScoresTab
              slug={slug}
              leagueId={league.id}
              teams={teams}
              weekNumber={strokePlayWeek}
              weeklyScores={weeklyScores}
              onDataRefresh={(data) => {
                if (data.weekNumber !== undefined) setStrokePlayWeek(data.weekNumber);
                if (data.weeklyScores) setWeeklyScores(data.weeklyScores);
              }}
            />
          )}

          {activeTab === "schedule" && (
            <ScheduleTab
              slug={slug}
              leagueId={league.id}
              teams={teams}
              activeSeason={activeSeason}
              playoffWeeks={league.playoffWeeks}
              onDataRefresh={() => loadInitialData()}
            />
          )}

          {activeTab === "course" && (
            <CourseTab
              slug={slug}
              leagueId={league.id}
            />
          )}

          {activeTab === "scorecards" && (
            <ScorecardsTab
              slug={slug}
              leagueId={league.id}
              teams={teams}
              weekNumber={weekNumber}
              activeSeason={activeSeason}
            />
          )}
        </div>
      </div>
    </div>
  );
}
