"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime, type NewsItem } from "@/lib/rss";

export function GolfNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNews() {
      try {
        const response = await fetch("/api/golf-news");
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        setNews(data);
      } catch (err) {
        setError("Unable to load news");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 w-full border border-white/80">
        <h2 className="text-lg font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-4 flex items-center gap-2">
          <NewspaperIcon />
          Golf News
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-scorecard-line/30 rounded w-3/4 mb-2" />
              <div className="h-3 bg-scorecard-line/20 rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || news.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 w-full border border-white/80">
        <h2 className="text-lg font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-4 flex items-center gap-2">
          <NewspaperIcon />
          Golf News
        </h2>
        <p className="text-text-muted text-sm font-sans">
          {error || "No news available"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 w-full border border-white/80">
      <h2 className="text-lg font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-4 flex items-center gap-2">
        <NewspaperIcon />
        Golf News
      </h2>
      <div className="space-y-4">
        {news.map((item, index) => (
          <a
            key={index}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <h3 className="text-sm font-medium font-sans text-scorecard-pencil group-hover:text-fairway transition-colors line-clamp-2">
              {item.title}
            </h3>
            <p className="text-xs text-text-secondary mt-1 font-sans">
              {formatRelativeTime(item.pubDate)}
            </p>
          </a>
        ))}
      </div>
      <a
        href="https://www.espn.com/golf/"
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-4 pt-4 border-t border-scorecard-line/40 text-xs text-text-secondary hover:text-fairway transition-colors font-sans"
      >
        More from ESPN Golf &rarr;
      </a>
    </div>
  );
}

function NewspaperIcon() {
  return (
    <svg
      className="w-5 h-5 text-fairway"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />
    </svg>
  );
}
