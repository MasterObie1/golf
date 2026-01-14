-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Matchup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekNumber" INTEGER NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "Matchup_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Matchup_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Matchup" ("createdAt", "id", "playedAt", "teamAGross", "teamAHandicap", "teamAId", "teamAIsSub", "teamANet", "teamAPoints", "teamBGross", "teamBHandicap", "teamBId", "teamBIsSub", "teamBNet", "teamBPoints", "updatedAt", "weekNumber") SELECT "createdAt", "id", "playedAt", "teamAGross", "teamAHandicap", "teamAId", "teamAIsSub", "teamANet", "teamAPoints", "teamBGross", "teamBHandicap", "teamBId", "teamBIsSub", "teamBNet", "teamBPoints", "updatedAt", "weekNumber" FROM "Matchup";
DROP TABLE "Matchup";
ALTER TABLE "new_Matchup" RENAME TO "Matchup";
CREATE UNIQUE INDEX "Matchup_weekNumber_teamAId_teamBId_key" ON "Matchup"("weekNumber", "teamAId", "teamBId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
