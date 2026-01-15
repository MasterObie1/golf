import { XMLParser } from "fast-xml-parser";

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

interface CacheEntry {
  data: NewsItem[];
  timestamp: number;
}

// In-memory cache
let cache: CacheEntry | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

const ESPN_GOLF_RSS = "https://www.espn.com/espn/rss/golf/news";

export async function getGolfNews(limit: number = 3): Promise<NewsItem[]> {
  const now = Date.now();

  // Return cached data if fresh
  if (cache && now - cache.timestamp < CACHE_TTL) {
    return cache.data.slice(0, limit);
  }

  try {
    const response = await fetch(ESPN_GOLF_RSS, {
      next: { revalidate: 3600 }, // Also use Next.js cache
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item || [];

    const newsItems: NewsItem[] = items.map((item: {
      title?: string;
      link?: string;
      description?: string;
      pubDate?: string;
    }) => ({
      title: item.title || "",
      link: item.link || "",
      description: stripHtml(item.description || ""),
      pubDate: item.pubDate || "",
    }));

    // Update cache
    cache = {
      data: newsItems,
      timestamp: now,
    };

    return newsItems.slice(0, limit);
  } catch (error) {
    console.error("Error fetching golf news:", error);

    // Return stale cache if available
    if (cache) {
      return cache.data.slice(0, limit);
    }

    return [];
  }
}

// Strip HTML tags from description
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Format relative time (e.g., "2 hours ago")
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
