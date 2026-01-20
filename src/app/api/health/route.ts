import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
      hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
    },
  };

  try {
    // Test database connection with a simple query
    const leagueCount = await prisma.league.count();
    checks.database = {
      status: "connected",
      leagueCount,
    };
  } catch (error) {
    checks.database = {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  const isHealthy = checks.database && (checks.database as { status: string }).status === "connected";

  return NextResponse.json(checks, { status: isHealthy ? 200 : 500 });
}
