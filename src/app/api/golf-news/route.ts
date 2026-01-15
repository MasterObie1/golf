import { NextResponse } from "next/server";
import { getGolfNews } from "@/lib/rss";

export async function GET() {
  try {
    const news = await getGolfNews(3);
    return NextResponse.json(news);
  } catch (error) {
    console.error("Golf news API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch golf news" },
      { status: 500 }
    );
  }
}
