-- AlterTable
ALTER TABLE "ScheduledMatchup" ADD COLUMN "courseSide" TEXT;
ALTER TABLE "ScheduledMatchup" ADD COLUMN "startingHole" INTEGER;

-- AlterTable
ALTER TABLE "Scorecard" ADD COLUMN "courseSide" TEXT;

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
    "playMode" TEXT NOT NULL DEFAULT 'full_18',
    "playModeFirstWeekSide" TEXT NOT NULL DEFAULT 'front',
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
INSERT INTO "new_League" ("adminPassword", "adminUsername", "billingEmail", "byePointsFlat", "byePointsMode", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "expiresAt", "handicapBaseScore", "handicapBestOf", "handicapCapExceptional", "handicapDefault", "handicapDropHighest", "handicapDropLowest", "handicapExceptionalCap", "handicapFreezeWeek", "handicapLastOf", "handicapMax", "handicapMin", "handicapMultiplier", "handicapProvMultiplier", "handicapProvWeeks", "handicapRequireApproval", "handicapRounding", "handicapScoreCount", "handicapScoreSelection", "handicapTrendWeight", "handicapUseTrend", "handicapUseWeighting", "handicapWeightDecay", "handicapWeightRecent", "hybridFieldPointScale", "hybridFieldWeight", "id", "maxTeams", "midSeasonAddDefault", "midSeasonRemoveAction", "name", "numberOfWeeks", "playDay", "playTime", "playoffFormat", "playoffTeams", "playoffWeeks", "prizeInfo", "registrationOpen", "scheduleExtraWeeks", "scheduleType", "scheduleVisibility", "scorecardMode", "scorecardRequireApproval", "scoringType", "slug", "startDate", "status", "strokePlayBonusBeat", "strokePlayBonusShow", "strokePlayDnpPenalty", "strokePlayDnpPoints", "strokePlayMaxDnp", "strokePlayPointPreset", "strokePlayPointScale", "strokePlayProRate", "strokePlayTieMode", "subscriptionTier", "updatedAt") SELECT "adminPassword", "adminUsername", "billingEmail", "byePointsFlat", "byePointsMode", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "expiresAt", "handicapBaseScore", "handicapBestOf", "handicapCapExceptional", "handicapDefault", "handicapDropHighest", "handicapDropLowest", "handicapExceptionalCap", "handicapFreezeWeek", "handicapLastOf", "handicapMax", "handicapMin", "handicapMultiplier", "handicapProvMultiplier", "handicapProvWeeks", "handicapRequireApproval", "handicapRounding", "handicapScoreCount", "handicapScoreSelection", "handicapTrendWeight", "handicapUseTrend", "handicapUseWeighting", "handicapWeightDecay", "handicapWeightRecent", "hybridFieldPointScale", "hybridFieldWeight", "id", "maxTeams", "midSeasonAddDefault", "midSeasonRemoveAction", "name", "numberOfWeeks", "playDay", "playTime", "playoffFormat", "playoffTeams", "playoffWeeks", "prizeInfo", "registrationOpen", "scheduleExtraWeeks", "scheduleType", "scheduleVisibility", "scorecardMode", "scorecardRequireApproval", "scoringType", "slug", "startDate", "status", "strokePlayBonusBeat", "strokePlayBonusShow", "strokePlayDnpPenalty", "strokePlayDnpPoints", "strokePlayMaxDnp", "strokePlayPointPreset", "strokePlayPointScale", "strokePlayProRate", "strokePlayTieMode", "subscriptionTier", "updatedAt" FROM "League";
DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
