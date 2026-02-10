-- CreateTable
CREATE TABLE "WeeklyScore" (
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

-- CreateTable
CREATE TABLE "ScheduledMatchup" (
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

-- RedefineTables
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_League" ("adminPassword", "adminUsername", "billingEmail", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "expiresAt", "handicapBaseScore", "handicapBestOf", "handicapCapExceptional", "handicapDefault", "handicapDropHighest", "handicapDropLowest", "handicapExceptionalCap", "handicapFreezeWeek", "handicapLastOf", "handicapMax", "handicapMin", "handicapMultiplier", "handicapProvMultiplier", "handicapProvWeeks", "handicapRequireApproval", "handicapRounding", "handicapScoreCount", "handicapScoreSelection", "handicapTrendWeight", "handicapUseTrend", "handicapUseWeighting", "handicapWeightDecay", "handicapWeightRecent", "id", "maxTeams", "name", "numberOfWeeks", "playDay", "playTime", "prizeInfo", "registrationOpen", "slug", "startDate", "status", "subscriptionTier", "updatedAt") SELECT "adminPassword", "adminUsername", "billingEmail", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "expiresAt", "handicapBaseScore", "handicapBestOf", "handicapCapExceptional", "handicapDefault", "handicapDropHighest", "handicapDropLowest", "handicapExceptionalCap", "handicapFreezeWeek", "handicapLastOf", "handicapMax", "handicapMin", "handicapMultiplier", "handicapProvMultiplier", "handicapProvWeeks", "handicapRequireApproval", "handicapRounding", "handicapScoreCount", "handicapScoreSelection", "handicapTrendWeight", "handicapUseTrend", "handicapUseWeighting", "handicapWeightDecay", "handicapWeightRecent", "id", "maxTeams", "name", "numberOfWeeks", "playDay", "playTime", "prizeInfo", "registrationOpen", "slug", "startDate", "status", "subscriptionTier", "updatedAt" FROM "League";
DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WeeklyScore_leagueId_idx" ON "WeeklyScore"("leagueId");

-- CreateIndex
CREATE INDEX "WeeklyScore_seasonId_idx" ON "WeeklyScore"("seasonId");

-- CreateIndex
CREATE INDEX "WeeklyScore_teamId_idx" ON "WeeklyScore"("teamId");

-- CreateIndex
CREATE INDEX "WeeklyScore_leagueId_weekNumber_idx" ON "WeeklyScore"("leagueId", "weekNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScore_leagueId_weekNumber_teamId_key" ON "WeeklyScore"("leagueId", "weekNumber", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledMatchup_matchupId_key" ON "ScheduledMatchup"("matchupId");

-- CreateIndex
CREATE INDEX "ScheduledMatchup_leagueId_idx" ON "ScheduledMatchup"("leagueId");

-- CreateIndex
CREATE INDEX "ScheduledMatchup_seasonId_idx" ON "ScheduledMatchup"("seasonId");

-- CreateIndex
CREATE INDEX "ScheduledMatchup_leagueId_weekNumber_idx" ON "ScheduledMatchup"("leagueId", "weekNumber");

-- CreateIndex
CREATE INDEX "ScheduledMatchup_matchupId_idx" ON "ScheduledMatchup"("matchupId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledMatchup_leagueId_weekNumber_teamAId_key" ON "ScheduledMatchup"("leagueId", "weekNumber", "teamAId");
