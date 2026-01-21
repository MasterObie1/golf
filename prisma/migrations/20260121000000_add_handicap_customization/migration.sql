-- Add handicap customization fields to League table
-- Using ALTER TABLE to add new columns with defaults

-- Basic Formula additions
ALTER TABLE "League" ADD COLUMN "handicapMin" REAL;

-- Score Selection
ALTER TABLE "League" ADD COLUMN "handicapScoreSelection" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "League" ADD COLUMN "handicapScoreCount" INTEGER;
ALTER TABLE "League" ADD COLUMN "handicapBestOf" INTEGER;
ALTER TABLE "League" ADD COLUMN "handicapLastOf" INTEGER;
ALTER TABLE "League" ADD COLUMN "handicapDropHighest" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "League" ADD COLUMN "handicapDropLowest" INTEGER NOT NULL DEFAULT 0;

-- Score Weighting
ALTER TABLE "League" ADD COLUMN "handicapUseWeighting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "League" ADD COLUMN "handicapWeightRecent" REAL NOT NULL DEFAULT 1.5;
ALTER TABLE "League" ADD COLUMN "handicapWeightDecay" REAL NOT NULL DEFAULT 0.9;

-- Exceptional Score Handling
ALTER TABLE "League" ADD COLUMN "handicapCapExceptional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "League" ADD COLUMN "handicapExceptionalCap" REAL;

-- Time-Based Rules
ALTER TABLE "League" ADD COLUMN "handicapProvWeeks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "League" ADD COLUMN "handicapProvMultiplier" REAL NOT NULL DEFAULT 1.0;
ALTER TABLE "League" ADD COLUMN "handicapFreezeWeek" INTEGER;
ALTER TABLE "League" ADD COLUMN "handicapUseTrend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "League" ADD COLUMN "handicapTrendWeight" REAL NOT NULL DEFAULT 0.1;

-- Administrative
ALTER TABLE "League" ADD COLUMN "handicapRequireApproval" BOOLEAN NOT NULL DEFAULT false;
