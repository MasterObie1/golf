"use client";

import Image from "next/image";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getTeams,
  getCurrentWeekNumber,
  getMatchupHistory,
  getLeagueBySlug,
  getLeagueAbout,
  getAllTeamsWithStatus,
  getSeasons,
  getActiveSeason,
  getTeamsForSeason,
  getCurrentWeekNumberForSeason,
  getMatchupHistoryForSeason,
  type LeagueAbout,
  type SeasonInfo,
} from "@/lib/actions";

import SettingsTab from "./components/SettingsTab";
import AboutTab from "./components/AboutTab";
import TeamsTab from "./components/TeamsTab";
import SeasonsTab from "./components/SeasonsTab";
import MatchupsTab from "./components/MatchupsTab";

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
  handicapMin: number | null;
  handicapScoreSelection: string;
  handicapScoreCount: number | null;
  handicapBestOf: number | null;
  handicapLastOf: number | null;
  handicapDropHighest: number;
  handicapDropLowest: number;
  handicapUseWeighting: boolean;
  handicapWeightRecent: number;
  handicapWeightDecay: number;
  handicapCapExceptional: boolean;
  handicapExceptionalCap: number | null;
  handicapProvWeeks: number;
  handicapProvMultiplier: number;
  handicapFreezeWeek: number | null;
  handicapUseTrend: boolean;
  handicapTrendWeight: number;
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

  // Season state
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [activeSeason, setActiveSeasonState] = useState<{ id: number; name: string } | null>(null);

  // About state
  const [aboutData, setAboutData] = useState<LeagueAbout | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<"matchups" | "teams" | "settings" | "about" | "seasons">("matchups");
  const [initialLoading, setInitialLoading] = useState(true);

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

      const [seasonsData, activeSeasonData] = await Promise.all([
        getSeasons(leagueData.id),
        getActiveSeason(leagueData.id),
      ]);
      setSeasons(seasonsData);
      setActiveSeasonState(activeSeasonData ? { id: activeSeasonData.id, name: activeSeasonData.name } : null);

      let teamsData: Team[] = [];
      let currentWeek = 1;
      let matchupsData: Matchup[] = [];
      let allTeamsData: Team[] = [];

      if (activeSeasonData) {
        [teamsData, currentWeek, matchupsData, allTeamsData] = await Promise.all([
          getTeamsForSeason(activeSeasonData.id),
          getCurrentWeekNumberForSeason(activeSeasonData.id),
          getMatchupHistoryForSeason(activeSeasonData.id),
          getAllTeamsWithStatus(slug),
        ]);
      } else {
        [teamsData, currentWeek, matchupsData, allTeamsData] = await Promise.all([
          getTeams(leagueData.id),
          getCurrentWeekNumber(leagueData.id),
          getMatchupHistory(leagueData.id),
          getAllTeamsWithStatus(slug),
        ]);
      }

      const aboutDataResult = await getLeagueAbout(leagueData.id);

      setTeams(teamsData);
      setWeekNumber(currentWeek);
      setMatchups(matchupsData);
      setAllTeams(allTeamsData);
      setAboutData(aboutDataResult);
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
          <Link href="/leagues" className="text-green-600 hover:text-green-700">Browse Leagues</Link>
        </div>
      </div>
    );
  }

  const pendingTeamsCount = allTeams.filter((t) => t.status === "pending").length;

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
          <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg">Admin Dashboard</h1>
          <p className="text-white/80 mt-1">{league.name}</p>
        </div>
        <div className="absolute top-4 left-4">
          <Link href={`/league/${slug}`} className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 text-sm">
            &larr; Back to League
          </Link>
        </div>
        <div className="absolute top-4 right-4">
          <button onClick={handleLogout} className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 text-sm font-medium shadow">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 -mt-4">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["matchups", "teams", "settings", "about", "seasons"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
                activeTab === tab
                  ? "bg-green-700 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === "teams" && pendingTeamsCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-400 text-yellow-900 rounded-full">
                  {pendingTeamsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "settings" && (
          <SettingsTab
            slug={slug}
            league={league}
            approvedTeamsCount={allTeams.filter((t) => t.status === "approved").length}
            onDataRefresh={(data) => {
              if (data.league) setLeague(data.league as League);
              if (data.matchups) setMatchups(data.matchups as Matchup[]);
              if (data.teams) setTeams(data.teams as Team[]);
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
            onTeamsChanged={(teamsData, allTeamsData) => {
              setTeams(teamsData);
              setAllTeams(allTeamsData);
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
              if (data.matchups) setMatchups(data.matchups as Matchup[]);
            }}
          />
        )}
      </div>
    </div>
  );
}
