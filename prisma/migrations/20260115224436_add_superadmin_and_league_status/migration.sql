-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
INSERT INTO "new_League" ("adminPassword", "adminUsername", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "handicapBaseScore", "handicapDefault", "handicapMultiplier", "handicapRounding", "id", "maxTeams", "name", "numberOfWeeks", "playDay", "playTime", "prizeInfo", "registrationOpen", "slug", "startDate", "updatedAt") SELECT "adminPassword", "adminUsername", "contactEmail", "contactPhone", "courseLocation", "courseName", "createdAt", "description", "endDate", "entryFee", "handicapBaseScore", "handicapDefault", "handicapMultiplier", "handicapRounding", "id", "maxTeams", "name", "numberOfWeeks", "playDay", "playTime", "prizeInfo", "registrationOpen", "slug", "startDate", "updatedAt" FROM "League";
DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_username_key" ON "SuperAdmin"("username");
