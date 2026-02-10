-- CreateTable
CREATE TABLE "Course" (
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

-- CreateTable
CREATE TABLE "Hole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseId" INTEGER NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "handicapIndex" INTEGER NOT NULL,
    "yardage" INTEGER,
    CONSTRAINT "Hole_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scorecard" (
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

-- CreateTable
CREATE TABLE "HoleScore" (
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
    "updatedAt" DATETIME NOT NULL,
    "scorecardMode" TEXT NOT NULL DEFAULT 'disabled',
    "scorecardRequireApproval" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_League" ("adminPassword", "adminUsername", "billingEmail", "byePointsFlat", "byePointsMode", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "expiresAt", "handicapBaseScore", "handicapBestOf", "handicapCapExceptional", "handicapDefault", "handicapDropHighest", "handicapDropLowest", "handicapExceptionalCap", "handicapFreezeWeek", "handicapLastOf", "handicapMax", "handicapMin", "handicapMultiplier", "handicapProvMultiplier", "handicapProvWeeks", "handicapRequireApproval", "handicapRounding", "handicapScoreCount", "handicapScoreSelection", "handicapTrendWeight", "handicapUseTrend", "handicapUseWeighting", "handicapWeightDecay", "handicapWeightRecent", "hybridFieldPointScale", "hybridFieldWeight", "id", "maxTeams", "midSeasonAddDefault", "midSeasonRemoveAction", "name", "numberOfWeeks", "playDay", "playTime", "playoffFormat", "playoffTeams", "playoffWeeks", "prizeInfo", "registrationOpen", "scheduleExtraWeeks", "scheduleType", "scheduleVisibility", "scoringType", "slug", "startDate", "status", "strokePlayBonusBeat", "strokePlayBonusShow", "strokePlayDnpPenalty", "strokePlayDnpPoints", "strokePlayMaxDnp", "strokePlayPointPreset", "strokePlayPointScale", "strokePlayProRate", "strokePlayTieMode", "subscriptionTier", "updatedAt") SELECT "adminPassword", "adminUsername", "billingEmail", "byePointsFlat", "byePointsMode", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "expiresAt", "handicapBaseScore", "handicapBestOf", "handicapCapExceptional", "handicapDefault", "handicapDropHighest", "handicapDropLowest", "handicapExceptionalCap", "handicapFreezeWeek", "handicapLastOf", "handicapMax", "handicapMin", "handicapMultiplier", "handicapProvMultiplier", "handicapProvWeeks", "handicapRequireApproval", "handicapRounding", "handicapScoreCount", "handicapScoreSelection", "handicapTrendWeight", "handicapUseTrend", "handicapUseWeighting", "handicapWeightDecay", "handicapWeightRecent", "hybridFieldPointScale", "hybridFieldWeight", "id", "maxTeams", "midSeasonAddDefault", "midSeasonRemoveAction", "name", "numberOfWeeks", "playDay", "playTime", "playoffFormat", "playoffTeams", "playoffWeeks", "prizeInfo", "registrationOpen", "scheduleExtraWeeks", "scheduleType", "scheduleVisibility", "scoringType", "slug", "startDate", "status", "strokePlayBonusBeat", "strokePlayBonusShow", "strokePlayDnpPenalty", "strokePlayDnpPoints", "strokePlayMaxDnp", "strokePlayPointPreset", "strokePlayPointScale", "strokePlayProRate", "strokePlayTieMode", "subscriptionTier", "updatedAt" FROM "League";
DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Course_leagueId_idx" ON "Course"("leagueId");

-- CreateIndex
CREATE INDEX "Hole_courseId_idx" ON "Hole"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Hole_courseId_holeNumber_key" ON "Hole"("courseId", "holeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_weeklyScoreId_key" ON "Scorecard"("weeklyScoreId");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_accessToken_key" ON "Scorecard"("accessToken");

-- CreateIndex
CREATE INDEX "Scorecard_leagueId_weekNumber_idx" ON "Scorecard"("leagueId", "weekNumber");

-- CreateIndex
CREATE INDEX "Scorecard_teamId_idx" ON "Scorecard"("teamId");

-- CreateIndex
CREATE INDEX "Scorecard_accessToken_idx" ON "Scorecard"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_leagueId_weekNumber_teamId_key" ON "Scorecard"("leagueId", "weekNumber", "teamId");

-- CreateIndex
CREATE INDEX "HoleScore_scorecardId_idx" ON "HoleScore"("scorecardId");

-- CreateIndex
CREATE UNIQUE INDEX "HoleScore_scorecardId_holeNumber_key" ON "HoleScore"("scorecardId", "holeNumber");
