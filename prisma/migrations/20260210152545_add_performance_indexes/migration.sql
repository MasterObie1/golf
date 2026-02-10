-- CreateIndex
CREATE INDEX "Scorecard_seasonId_idx" ON "Scorecard"("seasonId");

-- CreateIndex
CREATE INDEX "Scorecard_courseId_idx" ON "Scorecard"("courseId");

-- CreateIndex
CREATE INDEX "ScheduledMatchup_teamAId_idx" ON "ScheduledMatchup"("teamAId");

-- CreateIndex
CREATE INDEX "ScheduledMatchup_teamBId_idx" ON "ScheduledMatchup"("teamBId");

-- DropIndex (redundant with @unique constraint on accessToken)
DROP INDEX "Scorecard_accessToken_idx";
