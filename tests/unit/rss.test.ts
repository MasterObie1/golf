import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Need to reset module cache between tests to clear the RSS cache
let formatRelativeTime: typeof import("@/lib/rss").formatRelativeTime;
let getGolfNews: typeof import("@/lib/rss").getGolfNews;

const VALID_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>ESPN Golf</title>
    <item>
      <title>Tiger Woods wins</title>
      <link>https://espn.com/article/1</link>
      <description>Tiger &lt;b&gt;dominated&lt;/b&gt; the field.</description>
      <pubDate>Mon, 10 Feb 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Rory's comeback</title>
      <link>https://espn.com/article/2</link>
      <description>Rory shot a 62.</description>
      <pubDate>Mon, 10 Feb 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Masters preview</title>
      <link>https://espn.com/article/3</link>
      <description>Augusta awaits.</description>
      <pubDate>Mon, 10 Feb 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("@/lib/rss");
  formatRelativeTime = mod.formatRelativeTime;
  getGolfNews = mod.getGolfNews;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T15:00:00Z"));
  });

  it('returns "Just now" for less than 1 minute', () => {
    expect(formatRelativeTime("2026-02-10T14:59:30Z")).toBe("Just now");
  });

  it('returns "Xm ago" for minutes', () => {
    expect(formatRelativeTime("2026-02-10T14:45:00Z")).toBe("15m ago");
  });

  it('returns "Xh ago" for hours', () => {
    expect(formatRelativeTime("2026-02-10T12:00:00Z")).toBe("3h ago");
  });

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatRelativeTime("2026-02-09T15:00:00Z")).toBe("Yesterday");
  });

  it('returns "Xd ago" for 2-6 days', () => {
    expect(formatRelativeTime("2026-02-07T15:00:00Z")).toBe("3d ago");
  });

  it("returns formatted date for 7+ days", () => {
    const result = formatRelativeTime("2026-01-20T15:00:00Z");
    // Should be something like "Jan 20"
    expect(result).toContain("Jan");
    expect(result).toContain("20");
  });

  it('returns "Just now" for future dates', () => {
    // Slightly in the future results in negative diff, floor to < 1 minute
    expect(formatRelativeTime("2026-02-10T15:00:30Z")).toBe("Just now");
  });
});

describe("getGolfNews", () => {
  it("parses RSS XML and returns news items", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(VALID_RSS_XML, { status: 200 }),
    );

    const news = await getGolfNews(10);
    expect(news).toHaveLength(3);
    expect(news[0].title).toBe("Tiger Woods wins");
    expect(news[0].link).toBe("https://espn.com/article/1");
  });

  it("strips HTML from descriptions", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(VALID_RSS_XML, { status: 200 }),
    );

    const news = await getGolfNews(10);
    expect(news[0].description).toBe("Tiger dominated the field.");
    expect(news[0].description).not.toContain("<b>");
  });

  it("respects limit parameter", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(VALID_RSS_XML, { status: 200 }),
    );

    const news = await getGolfNews(2);
    expect(news).toHaveLength(2);
  });

  it("returns cached data within TTL", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(VALID_RSS_XML, { status: 200 }),
    );

    // First call fetches
    await getGolfNews(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call within TTL uses cache
    vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
    await getGolfNews(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, "fetch");

    // First fetch
    fetchSpy.mockResolvedValueOnce(new Response(VALID_RSS_XML, { status: 200 }));
    await getGolfNews(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance past 15-minute TTL
    vi.advanceTimersByTime(16 * 60 * 1000);

    // Second fetch with fresh Response
    fetchSpy.mockResolvedValueOnce(new Response(VALID_RSS_XML, { status: 200 }));
    await getGolfNews(10);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns stale cache on fetch error", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, "fetch");

    // First call succeeds
    fetchSpy.mockResolvedValueOnce(new Response(VALID_RSS_XML, { status: 200 }));
    const first = await getGolfNews(10);
    expect(first).toHaveLength(3);

    // Advance past TTL
    vi.advanceTimersByTime(16 * 60 * 1000);

    // Second call fails
    fetchSpy.mockRejectedValueOnce(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const second = await getGolfNews(10);
    expect(second).toHaveLength(3); // stale cache
  });

  it("returns empty array when no cache and fetch fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const news = await getGolfNews(10);
    expect(news).toEqual([]);
  });

  it("returns empty array on non-OK response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const news = await getGolfNews(10);
    expect(news).toEqual([]);
  });
});
