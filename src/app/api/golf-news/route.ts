import { NextResponse } from "next/server";
import { getGolfNews } from "@/lib/rss";

// Disable Next.js route caching for fresh news
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const news = await getGolfNews(5);
    return NextResponse.json(news);
  } catch (error) {
    console.error("Golf news API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch golf news" },
      { status: 500 }
    );
  }
}
