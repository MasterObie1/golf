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
  getTeamPreviousScoresForScoring,
  getCurrentWeekNumber,
  getTeamById,
  registerTeam,
  getPendingTeams,
  getApprovedTeams,
  getAllTeamsWithStatus,
  approveTeam,
  rejectTeam,
  deleteTeam,
  adminQuickAddTeam,
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
  getMatchupsForWeek,
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
  updateScorecardSettings,
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

export {
  getScoringConfig,
  getScheduleConfig,
  updateScoringConfig,
  updateScheduleConfig,
  type ScoringConfig,
  type ScheduleConfig,
  type ScoringConfigInput,
  type ScheduleConfigInput,
} from "./scoring-config";

export {
  previewWeeklyScores,
  submitWeeklyScores,
  getWeeklyScoreHistory,
  getWeeklyScoreHistoryForSeason,
  getTeamWeeklyScores,
  deleteWeeklyScores,
  getCurrentStrokePlayWeek,
  type WeeklyScorePreview,
  type WeeklyScorePreviewEntry,
  type WeeklyScoreRecord,
} from "./weekly-scores";

export {
  generateSchedule,
  previewSchedule,
  clearSchedule,
  addWeeksToSchedule,
  getSchedule,
  getScheduleForWeek,
  getTeamSchedule,
  getScheduleStatus,
  swapTeamsInMatchup,
  cancelScheduledMatchup,
  rescheduleMatchup,
  addManualScheduledMatchup,
  processByeWeekPoints,
  addTeamToSchedule,
  removeTeamFromSchedule,
  updateMatchupStartingHole,
  updateWeekCourseSide,
  assignShotgunStartingHoles,
  type ScheduleWeek,
  type ScheduleMatchDetail,
  type ScheduleStatus,
  type ScheduleGenerationOptions,
  type AddTeamStrategy,
  type RemoveTeamAction,
} from "./schedule";

export {
  generatePointScale,
  getPointScalePresets,
} from "../scoring-utils";

export {
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseWithHoles,
  type CourseWithHoles,
  type CourseInput,
  type HoleInput,
} from "./courses";

export {
  getScorecardByToken,
  saveHoleScore,
  submitScorecard,
  generateScorecardLink,
  approveScorecard,
  rejectScorecard,
  getScorecardsForWeek,
  getScorecardDetail,
  adminSaveHoleScore,
  adminCreateScorecard,
  adminCompleteAndApproveScorecard,
  adminLinkScorecardToMatchup,
  getApprovedScorecardScores,
  getPublicScorecardsForWeek,
  getScorecardAvailabilityForSeason,
  getPublicScorecardForTeamWeek,
  emailScorecardLink,
  checkEmailConfigured,
  type ScorecardDetail,
  type ScorecardSummary,
} from "./scorecards";
