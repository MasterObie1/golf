-- Per-round handicap calculation, sub day-of multiplier, preserve-recorded recalculation
ALTER TABLE "League" ADD COLUMN "handicapPerRound" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "League" ADD COLUMN "handicapSubMultiplier" REAL;
ALTER TABLE "League" ADD COLUMN "handicapPreserveRecorded" BOOLEAN NOT NULL DEFAULT false;
