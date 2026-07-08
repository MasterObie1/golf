import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Test database connection with a simple query
    await prisma.league.count();
    return NextResponse.json({
      timestamp,
      database: { status: "connected" },
    });
  } catch (error) {
    // Log details server-side; the public response stays generic — env
    // configuration and driver error strings are internal information.
    console.error("Health check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        timestamp,
        database: { status: "error" },
      },
      { status: 500 }
    );
  }
}
