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
