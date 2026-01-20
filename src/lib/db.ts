import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const useTurso = !!tursoUrl;

  if (useTurso && !tursoToken) {
    throw new Error(
      "TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing. " +
      "Please add TURSO_AUTH_TOKEN to your environment variables."
    );
  }

  const dbUrl = useTurso ? tursoUrl : (process.env.DATABASE_URL || "file:./dev.db");

  try {
    const adapter = new PrismaLibSql({
      url: dbUrl,
      authToken: useTurso ? tursoToken : undefined,
    });

    return new PrismaClient({ adapter });
  } catch (error) {
    console.error("Failed to create Prisma client:", error);
    throw new Error(
      `Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
