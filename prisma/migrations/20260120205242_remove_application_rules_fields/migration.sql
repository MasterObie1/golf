-- Remove Application Rules fields from League table
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Create new table without the removed columns
CREATE TABLE "new_League" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "maxTeams" INTEGER NOT NULL DEFAULT 16,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "handicapBaseScore" REAL NOT NULL DEFAULT 35,
    "handicapMultiplier" REAL NOT NULL DEFAULT 0.9,
    "handicapRounding" TEXT NOT NULL DEFAULT 'floor',
    "handicapDefault" REAL NOT NULL DEFAULT 0,
    "handicapMax" REAL,
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
    "playDay" TEXT,
    "courseInfo" TEXT,
    "description" TEXT,
    "rulesUrl" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT
);

-- Copy data from old table (excluding removed columns)
INSERT INTO "new_League" (
    "id", "name", "slug", "createdAt", "updatedAt", "maxTeams", "registrationOpen",
    "handicapBaseScore", "handicapMultiplier", "handicapRounding", "handicapDefault",
    "handicapMax", "handicapMin", "handicapScoreSelection", "handicapScoreCount",
    "handicapBestOf", "handicapLastOf", "handicapDropHighest", "handicapDropLowest",
    "handicapUseWeighting", "handicapWeightRecent", "handicapWeightDecay",
    "handicapCapExceptional", "handicapExceptionalCap", "handicapProvWeeks",
    "handicapProvMultiplier", "handicapFreezeWeek", "handicapUseTrend",
    "handicapTrendWeight", "handicapRequireApproval", "startDate", "endDate",
    "playDay", "courseInfo", "description", "rulesUrl", "contactName",
    "contactEmail", "contactPhone"
)
SELECT
    "id", "name", "slug", "createdAt", "updatedAt", "maxTeams", "registrationOpen",
    "handicapBaseScore", "handicapMultiplier", "handicapRounding", "handicapDefault",
    "handicapMax", "handicapMin", "handicapScoreSelection", "handicapScoreCount",
    "handicapBestOf", "handicapLastOf", "handicapDropHighest", "handicapDropLowest",
    "handicapUseWeighting", "handicapWeightRecent", "handicapWeightDecay",
    "handicapCapExceptional", "handicapExceptionalCap", "handicapProvWeeks",
    "handicapProvMultiplier", "handicapFreezeWeek", "handicapUseTrend",
    "handicapTrendWeight", "handicapRequireApproval", "startDate", "endDate",
    "playDay", "courseInfo", "description", "rulesUrl", "contactName",
    "contactEmail", "contactPhone"
FROM "League";

-- Drop old table
DROP TABLE "League";

-- Rename new table to original name
ALTER TABLE "new_League" RENAME TO "League";

-- Recreate unique index on slug
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
