-- CreateTable
CREATE TABLE "Season" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leagueId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "numberOfWeeks" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Matchup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekNumber" INTEGER NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leagueId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "teamAId" INTEGER NOT NULL,
    "teamAGross" INTEGER NOT NULL,
    "teamAHandicap" REAL NOT NULL,
    "teamANet" REAL NOT NULL,
    "teamAPoints" REAL NOT NULL,
    "teamAIsSub" BOOLEAN NOT NULL DEFAULT false,
    "teamBId" INTEGER NOT NULL,
    "teamBGross" INTEGER NOT NULL,
    "teamBHandicap" REAL NOT NULL,
    "teamBNet" REAL NOT NULL,
    "teamBPoints" REAL NOT NULL,
    "teamBIsSub" BOOLEAN NOT NULL DEFAULT false,
    "isForfeit" BOOLEAN NOT NULL DEFAULT false,
    "forfeitTeamId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Matchup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Matchup_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Matchup_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Matchup_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Matchup" ("createdAt", "forfeitTeamId", "id", "isForfeit", "leagueId", "playedAt", "teamAGross", "teamAHandicap", "teamAId", "teamAIsSub", "teamANet", "teamAPoints", "teamBGross", "teamBHandicap", "teamBId", "teamBIsSub", "teamBNet", "teamBPoints", "updatedAt", "weekNumber") SELECT "createdAt", "forfeitTeamId", "id", "isForfeit", "leagueId", "playedAt", "teamAGross", "teamAHandicap", "teamAId", "teamAIsSub", "teamANet", "teamAPoints", "teamBGross", "teamBHandicap", "teamBId", "teamBIsSub", "teamBNet", "teamBPoints", "updatedAt", "weekNumber" FROM "Matchup";
DROP TABLE "Matchup";
ALTER TABLE "new_Matchup" RENAME TO "Matchup";
CREATE INDEX "Matchup_leagueId_idx" ON "Matchup"("leagueId");
CREATE INDEX "Matchup_seasonId_idx" ON "Matchup"("seasonId");
CREATE INDEX "Matchup_teamAId_idx" ON "Matchup"("teamAId");
CREATE INDEX "Matchup_teamBId_idx" ON "Matchup"("teamBId");
CREATE INDEX "Matchup_leagueId_weekNumber_idx" ON "Matchup"("leagueId", "weekNumber");
CREATE UNIQUE INDEX "Matchup_leagueId_weekNumber_teamAId_teamBId_key" ON "Matchup"("leagueId", "weekNumber", "teamAId", "teamBId");
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "captainName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalPoints" REAL NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Team_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("captainName", "createdAt", "email", "id", "leagueId", "losses", "name", "phone", "status", "ties", "totalPoints", "updatedAt", "wins") SELECT "captainName", "createdAt", "email", "id", "leagueId", "losses", "name", "phone", "status", "ties", "totalPoints", "updatedAt", "wins" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");
CREATE INDEX "Team_seasonId_idx" ON "Team"("seasonId");
CREATE UNIQUE INDEX "Team_seasonId_name_key" ON "Team"("seasonId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Season_leagueId_idx" ON "Season"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_leagueId_seasonNumber_key" ON "Season"("leagueId", "seasonNumber");
