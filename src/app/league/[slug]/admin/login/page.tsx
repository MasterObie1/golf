"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function LeagueAdminLoginPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, leagueSlug: slug }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Redirect to admin dashboard
      router.push(`/league/${slug}/admin`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rough flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-scorecard-paper rounded-lg shadow-lg p-8 border border-scorecard-line/50">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-board-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-board-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-scorecard-pencil uppercase tracking-wider">
            Admin Login
          </h1>
          <p className="text-text-secondary text-sm mt-1 font-sans">
            League administration access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pencil-input w-full"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="bg-error-bg border border-error-border text-error-text px-4 py-3 rounded-lg text-sm font-sans">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-fairway text-white py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href={`/league/${slug}`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider"
          >
            &larr; Back to League
          </Link>
        </div>
      </div>
    </div>
  );
}
