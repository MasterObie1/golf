"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { searchLeagues, getAllLeagues } from "@/lib/actions";

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

  return (
    <div className="min-h-screen bg-green-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-green-800">Find a League</h1>
          <Link
            href="/leagues/new"
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-lg"
          />
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading leagues...</div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {query ? "No leagues found matching your search." : "No leagues yet."}
            </p>
            <Link
              href="/leagues/new"
              className="text-green-600 hover:text-green-700 font-medium"
            >
              Create the first league
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {searching && (
              <div className="text-sm text-gray-500 mb-2">Searching...</div>
            )}
            {results.map((league) => (
              <Link
                key={league.id}
                href={`/league/${league.slug}`}
                className="block bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border border-gray-100"
              >
                <h2 className="text-xl font-semibold text-green-800 mb-2">
                  {league.name}
                </h2>
                <div className="text-gray-600 space-y-1">
                  {league.courseName && (
                    <p>
                      <span className="font-medium">Course:</span> {league.courseName}
                      {league.courseLocation && ` - ${league.courseLocation}`}
                    </p>
                  )}
                  {league.playDay && (
                    <p>
                      <span className="font-medium">Plays:</span> {league.playDay}s
                    </p>
                  )}
                  {league._count && (
                    <p className="text-sm text-gray-500">
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
          <Link href="/" className="text-green-600 hover:text-green-700">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
