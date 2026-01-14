import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Use Turso in production, local SQLite in development
  const isProduction = process.env.NODE_ENV === "production";

  const adapter = new PrismaLibSql({
    url: isProduction
      ? process.env.TURSO_DATABASE_URL!
      : (process.env.DATABASE_URL || "file:./dev.db"),
    authToken: isProduction ? process.env.TURSO_AUTH_TOKEN : undefined,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
