"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { searchLeagues, getAllLeagues } from "@/lib/actions/leagues";

interface LeagueResult {
  id: number;
  name: string;
  slug: string;
  courseName: string | null;
  courseLocation: string | null;
  playDay: string | null;
  _count?: { teams: number };
}

export default function LeaguesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeagueResult[]>([]);
  const [allLeagues, setAllLeagues] = useState<LeagueResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Load all leagues on mount
  useEffect(() => {
    getAllLeagues().then((leagues) => {
      setAllLeagues(leagues);
      setResults(leagues);
      setLoading(false);
    });
  }, []);

  // Search as user types
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (query.length < 2) {
      setResults(allLeagues);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      const searchResults = await searchLeagues(query);
      setResults(searchResults);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, allLeagues]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-display font-bold text-scorecard-pencil uppercase tracking-wider">Find a League</h1>
          <Link
            href="/leagues/new"
            className="bg-fairway text-white px-4 py-2 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider text-sm"
          >
            Create League
          </Link>
        </div>

        {/* Search Input */}
        <div className="mb-8">
          <input
            type="text"
            placeholder="Search leagues by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pencil-input text-lg !border-b-2"
          />
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12 text-text-muted font-sans">Loading leagues...</div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted mb-4 font-sans">
              {query ? "No leagues found matching your search." : "No leagues yet."}
            </p>
            <Link
              href="/leagues/new"
              className="text-fairway hover:text-rough font-display font-semibold uppercase tracking-wider text-sm"
            >
              Create the first league
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {searching && (
              <div className="text-sm text-text-muted mb-2 font-sans">Searching...</div>
            )}
            {results.map((league) => (
              <Link
                key={league.id}
                href={`/league/${league.slug}`}
                className="block bg-surface-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all hover:-translate-y-0.5 border border-border-light"
              >
                <h2 className="text-xl font-display font-semibold text-scorecard-pencil uppercase tracking-wider mb-2">
                  {league.name}
                </h2>
                <div className="text-text-secondary space-y-1 font-sans">
                  {league.courseName && (
                    <p>
                      <span className="font-medium">Course:</span> {league.courseName}
                      {league.courseLocation && ` \u2014 ${league.courseLocation}`}
                    </p>
                  )}
                  {league.playDay && (
                    <p>
                      <span className="font-medium">Plays:</span> {league.playDay}s
                    </p>
                  )}
                  {league._count && (
                    <p className="text-sm text-text-muted font-mono tabular-nums">
                      {league._count.teams} team{league._count.teams !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
