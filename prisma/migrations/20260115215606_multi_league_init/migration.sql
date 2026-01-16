-- CreateTable
CREATE TABLE "League" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "leagueId" INTEGER NOT NULL,
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
    CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Matchup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "weekNumber" INTEGER NOT NULL,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leagueId" INTEGER NOT NULL,
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
    CONSTRAINT "Matchup_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Matchup_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Team_leagueId_name_key" ON "Team"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_leagueId_weekNumber_teamAId_teamBId_key" ON "Matchup"("leagueId", "weekNumber", "teamAId", "teamBId");
