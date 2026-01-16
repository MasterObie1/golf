import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Use Turso if TURSO_DATABASE_URL is set, otherwise use local SQLite
  const useTurso = !!process.env.TURSO_DATABASE_URL;
  const dbUrl = useTurso
    ? process.env.TURSO_DATABASE_URL!
    : (process.env.DATABASE_URL || "file:./dev.db");

  const adapter = new PrismaLibSql({
    url: dbUrl,
    authToken: useTurso ? process.env.TURSO_AUTH_TOKEN : undefined,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
