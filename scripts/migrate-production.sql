-- Migration script for production Turso database
-- Applies migrations: 20260207023459, 20260207035243, 20260210020735, 20260210152545

-- ============================================
-- 1. Create WeeklyScore table
-- ============================================
CREATE TABLE IF NOT EXISTS "WeeklyScore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekNumber" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "teamId" INTEGER NOT NULL,
    "grossScore" INTEGER NOT NULL,
    "handicap" REAL NOT NULL,
    "netScore" REAL NOT NULL,
    "points" REAL NOT NULL,
    "position" INTEGER NOT NULL,
    "isSub" BOOLEAN NOT NULL DEFAULT false,
    "isDnp" BOOLEAN NOT NULL DEFAULT false,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyScore_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeeklyScore_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WeeklyScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================
-- 2. Create ScheduledMatchup table
-- ============================================
CREATE TABLE IF NOT EXISTS "ScheduledMatchup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leagueId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "weekNumber" INTEGER NOT NULL,
    "teamAId" INTEGER NOT NULL,
    "teamBId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "matchupId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledMatchup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMatchup_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMatchup_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMatchup_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMatchup_matchupId_fkey" FOREIGN KEY ("matchupId") REFERENCES "Matchup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================================
-- 3. Create Course table
-- ============================================
CREATE TABLE IF NOT EXISTS "Course" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leagueId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "numberOfHoles" INTEGER NOT NULL DEFAULT 9,
    "totalPar" INTEGER,
    "teeColor" TEXT,
    "courseRating" REAL,
    "slopeRating" INTEGER,
    "externalId" TEXT,
    "dataSource" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================
-- 4. Create Hole table
-- ============================================
CREATE TABLE IF NOT EXISTS "Hole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseId" INTEGER NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "handicapIndex" INTEGER NOT NULL,
    "yardage" INTEGER,
    CONSTRAINT "Hole_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================
-- 5. Create Scorecard table
-- ============================================
CREATE TABLE IF NOT EXISTS "Scorecard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leagueId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "weekNumber" INTEGER NOT NULL,
    "matchupId" INTEGER,
    "teamSide" TEXT,
    "weeklyScoreId" INTEGER,
    "grossTotal" INTEGER,
    "frontNine" INTEGER,
    "backNine" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "playerName" TEXT,
    "accessToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scorecard_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Scorecard_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Scorecard_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Scorecard_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Scorecard_matchupId_fkey" FOREIGN KEY ("matchupId") REFERENCES "Matchup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Scorecard_weeklyScoreId_fkey" FOREIGN KEY ("weeklyScoreId") REFERENCES "WeeklyScore" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================================
-- 6. Create HoleScore table
-- ============================================
CREATE TABLE IF NOT EXISTS "HoleScore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scorecardId" INTEGER NOT NULL,
    "holeId" INTEGER NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "strokes" INTEGER NOT NULL,
    "putts" INTEGER,
    "fairwayHit" BOOLEAN,
    "greenInReg" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HoleScore_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HoleScore_holeId_fkey" FOREIGN KEY ("holeId") REFERENCES "Hole" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ============================================
-- 7. Rebuild League table with new columns
-- ============================================
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_League" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "adminPassword" TEXT NOT NULL,
    "maxTeams" INTEGER NOT NULL DEFAULT 16,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "handicapBaseScore" REAL NOT NULL DEFAULT 35,
    "handicapMultiplier" REAL NOT NULL DEFAULT 0.9,
    "handicapRounding" TEXT NOT NULL DEFAULT 'floor',
    "handicapDefault" REAL NOT NULL DEFAULT 0,
    "handicapMax" REAL DEFAULT 9,
    "handicapMin" REAL,
    "handicapScoreSelection" TEXT NOT NULL DEFAULT 'all',
    "handicapScoreCount" INTEGER,
    "handicapBestOf" INTEGER,
    "handicapLastOf" INTEGER,
    "handicapDropHighest" INTEGER NOT NULL DEFAULT 0,
    "handicapDropLowest" INTEGER NOT NULL DEFAULT 0,
    "handicapUseWeighting" BOOLEAN NOT NULL DEFAULT false,
    "handicapWeightRecent" REAL NOT NULL DEFAULT 1.5,
    "handicapWeightDecay" REAL NOT NULL DEFAULT 0.9,
    "handicapCapExceptional" BOOLEAN NOT NULL DEFAULT false,
    "handicapExceptionalCap" REAL,
    "handicapProvWeeks" INTEGER NOT NULL DEFAULT 0,
    "handicapProvMultiplier" REAL NOT NULL DEFAULT 1.0,
    "handicapFreezeWeek" INTEGER,
    "handicapUseTrend" BOOLEAN NOT NULL DEFAULT false,
    "handicapTrendWeight" REAL NOT NULL DEFAULT 0.1,
    "handicapRequireApproval" BOOLEAN NOT NULL DEFAULT false,
    "scoringType" TEXT NOT NULL DEFAULT 'match_play',
    "strokePlayPointScale" TEXT,
    "strokePlayPointPreset" TEXT NOT NULL DEFAULT 'linear',
    "strokePlayBonusShow" REAL NOT NULL DEFAULT 0,
    "strokePlayBonusBeat" REAL NOT NULL DEFAULT 0,
    "strokePlayDnpPoints" REAL NOT NULL DEFAULT 0,
    "strokePlayTieMode" TEXT NOT NULL DEFAULT 'split',
    "strokePlayDnpPenalty" REAL NOT NULL DEFAULT 0,
    "strokePlayMaxDnp" INTEGER,
    "strokePlayProRate" BOOLEAN NOT NULL DEFAULT false,
    "hybridFieldWeight" REAL NOT NULL DEFAULT 0.5,
    "hybridFieldPointScale" TEXT,
    "scheduleType" TEXT,
    "scheduleVisibility" TEXT NOT NULL DEFAULT 'full',
    "byePointsMode" TEXT NOT NULL DEFAULT 'flat',
    "byePointsFlat" REAL NOT NULL DEFAULT 10,
    "scheduleExtraWeeks" TEXT NOT NULL DEFAULT 'flex',
    "midSeasonAddDefault" TEXT NOT NULL DEFAULT 'start_from_here',
    "midSeasonRemoveAction" TEXT NOT NULL DEFAULT 'bye_opponents',
    "playoffWeeks" INTEGER NOT NULL DEFAULT 0,
    "playoffTeams" INTEGER NOT NULL DEFAULT 4,
    "playoffFormat" TEXT NOT NULL DEFAULT 'single_elimination',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "numberOfWeeks" INTEGER,
    "courseName" TEXT,
    "courseLocation" TEXT,
    "playDay" TEXT,
    "playTime" TEXT,
    "entryFee" REAL,
    "prizeInfo" TEXT,
    "description" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "subscriptionTier" TEXT NOT NULL DEFAULT 'free',
    "billingEmail" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "scorecardMode" TEXT NOT NULL DEFAULT 'disabled',
    "scorecardRequireApproval" BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO "new_League" ("id", "name", "slug", "adminUsername", "adminPassword", "maxTeams", "registrationOpen", "handicapBaseScore", "handicapMultiplier", "handicapRounding", "handicapDefault", "handicapMax", "handicapMin", "handicapScoreSelection", "handicapScoreCount", "handicapBestOf", "handicapLastOf", "handicapDropHighest", "handicapDropLowest", "handicapUseWeighting", "handicapWeightRecent", "handicapWeightDecay", "handicapCapExceptional", "handicapExceptionalCap", "handicapProvWeeks", "handicapProvMultiplier", "handicapFreezeWeek", "handicapUseTrend", "handicapTrendWeight", "handicapRequireApproval", "startDate", "endDate", "numberOfWeeks", "courseName", "courseLocation", "playDay", "playTime", "entryFee", "prizeInfo", "description", "contactEmail", "contactPhone", "status", "subscriptionTier", "billingEmail", "expiresAt", "createdAt", "updatedAt")
SELECT "id", "name", "slug", "adminUsername", "adminPassword", "maxTeams", "registrationOpen", "handicapBaseScore", "handicapMultiplier", "handicapRounding", "handicapDefault", "handicapMax", "handicapMin", "handicapScoreSelection", "handicapScoreCount", "handicapBestOf", "handicapLastOf", "handicapDropHighest", "handicapDropLowest", "handicapUseWeighting", "handicapWeightRecent", "handicapWeightDecay", "handicapCapExceptional", "handicapExceptionalCap", "handicapProvWeeks", "handicapProvMultiplier", "handicapFreezeWeek", "handicapUseTrend", "handicapTrendWeight", "handicapRequireApproval", "startDate", "endDate", "numberOfWeeks", "courseName", "courseLocation", "playDay", "playTime", "entryFee", "prizeInfo", "description", "contactEmail", "contactPhone", "status", "subscriptionTier", "billingEmail", "expiresAt", "createdAt", "updatedAt"
FROM "League";

DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ============================================
-- 8. Add scoringType to Season
-- ============================================
-- Check if column exists first (SQLite doesn't have IF NOT EXISTS for ALTER)
-- This will error if column exists, which is fine

-- ============================================
-- 9. Create all indexes
-- ============================================
CREATE INDEX IF NOT EXISTS "WeeklyScore_leagueId_idx" ON "WeeklyScore"("leagueId");
CREATE INDEX IF NOT EXISTS "WeeklyScore_seasonId_idx" ON "WeeklyScore"("seasonId");
CREATE INDEX IF NOT EXISTS "WeeklyScore_teamId_idx" ON "WeeklyScore"("teamId");
CREATE INDEX IF NOT EXISTS "WeeklyScore_leagueId_weekNumber_idx" ON "WeeklyScore"("leagueId", "weekNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyScore_leagueId_weekNumber_teamId_key" ON "WeeklyScore"("leagueId", "weekNumber", "teamId");

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledMatchup_matchupId_key" ON "ScheduledMatchup"("matchupId");
CREATE INDEX IF NOT EXISTS "ScheduledMatchup_leagueId_idx" ON "ScheduledMatchup"("leagueId");
CREATE INDEX IF NOT EXISTS "ScheduledMatchup_seasonId_idx" ON "ScheduledMatchup"("seasonId");
CREATE INDEX IF NOT EXISTS "ScheduledMatchup_teamAId_idx" ON "ScheduledMatchup"("teamAId");
CREATE INDEX IF NOT EXISTS "ScheduledMatchup_teamBId_idx" ON "ScheduledMatchup"("teamBId");
CREATE INDEX IF NOT EXISTS "ScheduledMatchup_leagueId_weekNumber_idx" ON "ScheduledMatchup"("leagueId", "weekNumber");
CREATE INDEX IF NOT EXISTS "ScheduledMatchup_matchupId_idx" ON "ScheduledMatchup"("matchupId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledMatchup_leagueId_weekNumber_teamAId_key" ON "ScheduledMatchup"("leagueId", "weekNumber", "teamAId");

CREATE INDEX IF NOT EXISTS "Course_leagueId_idx" ON "Course"("leagueId");
CREATE INDEX IF NOT EXISTS "Hole_courseId_idx" ON "Hole"("courseId");
CREATE UNIQUE INDEX IF NOT EXISTS "Hole_courseId_holeNumber_key" ON "Hole"("courseId", "holeNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Scorecard_weeklyScoreId_key" ON "Scorecard"("weeklyScoreId");
CREATE UNIQUE INDEX IF NOT EXISTS "Scorecard_accessToken_key" ON "Scorecard"("accessToken");
CREATE INDEX IF NOT EXISTS "Scorecard_leagueId_weekNumber_idx" ON "Scorecard"("leagueId", "weekNumber");
CREATE INDEX IF NOT EXISTS "Scorecard_teamId_idx" ON "Scorecard"("teamId");
CREATE INDEX IF NOT EXISTS "Scorecard_seasonId_idx" ON "Scorecard"("seasonId");
CREATE INDEX IF NOT EXISTS "Scorecard_courseId_idx" ON "Scorecard"("courseId");
CREATE UNIQUE INDEX IF NOT EXISTS "Scorecard_leagueId_weekNumber_teamId_key" ON "Scorecard"("leagueId", "weekNumber", "teamId");

CREATE INDEX IF NOT EXISTS "HoleScore_scorecardId_idx" ON "HoleScore"("scorecardId");
CREATE UNIQUE INDEX IF NOT EXISTS "HoleScore_scorecardId_holeNumber_key" ON "HoleScore"("scorecardId", "holeNumber");
