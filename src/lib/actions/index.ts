// Barrel re-export — all consumers can continue importing from "@/lib/actions"

export {
  createLeague,
  changeLeaguePassword,
  searchLeagues,
  getAllLeagues,
  getLeagueBySlug,
  getLeaguePublicInfo,
} from "./leagues";

export {
  getTeams,
  createTeam,
  getTeamPreviousScores,
  getCurrentWeekNumber,
  getTeamById,
  registerTeam,
  getPendingTeams,
  getApprovedTeams,
  getAllTeamsWithStatus,
  approveTeam,
  rejectTeam,
  deleteTeam,
} from "./teams";

export {
  getHandicapSettings,
  getTeamHandicap,
  getHandicapHistory,
  getHandicapHistoryForSeason,
  type HandicapHistoryEntry,
} from "./handicap-settings";

export {
  previewMatchup,
  submitMatchup,
  getMatchupHistory,
  getTeamMatchupHistory,
  deleteMatchup,
  submitForfeit,
  getMatchupHistoryForSeason,
  type MatchupPreview,
} from "./matchups";

export {
  getLeaderboard,
  getLeaderboardWithMovement,
  getSeasonLeaderboard,
  getAllTimeLeaderboard,
  type LeaderboardWithMovement,
} from "./standings";

export {
  updateLeagueSettings,
  updateHandicapSettings,
  recalculateLeagueStats,
  type HandicapSettingsInput,
} from "./league-settings";

export {
  getLeagueAbout,
  updateLeagueAbout,
  type LeagueAbout,
  type UpdateLeagueAboutInput,
} from "./league-about";

export {
  createSeason,
  getSeasons,
  getActiveSeason,
  setActiveSeason,
  getSeasonById,
  getTeamsForSeason,
  getCurrentWeekNumberForSeason,
  getTeamPreviousScoresForSeason,
  updateSeason,
  copyTeamsToSeason,
  type SeasonInfo,
} from "./seasons";
