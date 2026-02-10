"use client";

import { useState } from "react";
import Link from "next/link";
import { createLeague } from "@/lib/actions/leagues";

export default function NewLeaguePage() {
  const [name, setName] = useState("");
  const [scoringType, setScoringType] = useState<"match_play" | "stroke_play" | "hybrid">("match_play");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    slug: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const result = await createLeague(name, password, scoringType);
      if (result.success) {
        setSuccess({
          slug: result.data.slug,
        });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to create league. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-scorecard-paper rounded-lg shadow-lg p-8 border border-scorecard-line/50">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-fairway/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-fairway" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-display font-bold text-scorecard-pencil uppercase tracking-wider">League Created!</h1>
          </div>

          <div className="bg-surface rounded-lg p-4 mb-6 border border-border-light">
            <h2 className="font-display font-semibold text-scorecard-pencil uppercase tracking-wider text-sm mb-3">Admin Access</h2>
            <p className="text-sm text-text-secondary font-sans">
              Use the password you just set to log in to the admin dashboard.
              You can change it later in admin settings.
            </p>
          </div>

          <div className="bg-board-yellow/10 border border-board-yellow/30 rounded-lg p-4 mb-6">
            <h2 className="font-display font-semibold text-wood uppercase tracking-wider text-sm mb-2">Bookmark Your Admin URL</h2>
            <p className="text-sm text-text-secondary mb-2 font-sans">
              The admin panel is only visible after logging in. Save this URL:
            </p>
            <code className="block bg-board-yellow/10 px-3 py-2 rounded text-xs text-scorecard-pencil break-all font-mono">
              {typeof window !== 'undefined' ? window.location.origin : ''}/league/{success.slug}/admin
            </code>
          </div>

          <div className="space-y-3">
            <Link
              href={`/league/${success.slug}/admin/login`}
              className="block w-full bg-fairway text-white text-center py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider"
            >
              Go to Admin Login
            </Link>
            <Link
              href={`/league/${success.slug}`}
              className="block w-full bg-surface text-text-primary text-center py-3 rounded-lg hover:bg-bunker/20 transition-colors font-sans border border-border"
            >
              View League Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-scorecard-paper rounded-lg shadow-lg p-8 border border-scorecard-line/50">
        <h1 className="text-2xl font-display font-bold text-scorecard-pencil text-center mb-6 uppercase tracking-wider">
          Create a New League
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              League Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Thursday Night Golf League"
              className="pencil-input w-full"
              required
              minLength={3}
            />
            <p className="text-xs text-text-muted mt-1 font-sans">
              This will be the public name of your league
            </p>
          </div>

          <div>
            <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Scoring Format
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "match_play" as const, label: "Match Play", desc: "Head-to-head matchups each week" },
                { value: "stroke_play" as const, label: "Stroke Play", desc: "All teams compete against the field" },
                { value: "hybrid" as const, label: "Hybrid", desc: "Match play + field position points" },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScoringType(option.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    scoringType === option.value
                      ? "border-fairway bg-fairway/5"
                      : "border-scorecard-line/50 hover:border-scorecard-line"
                  }`}
                >
                  <div className={`text-sm font-display font-semibold uppercase tracking-wider ${
                    scoringType === option.value ? "text-fairway" : "text-scorecard-pencil"
                  }`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-text-muted mt-1 font-sans">{option.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1 font-sans">
              You can change this later in league settings
            </p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Admin Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="pencil-input w-full"
              required
              minLength={8}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="pencil-input w-full"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="bg-error-bg border border-error-border text-error-text px-4 py-3 rounded-lg font-sans text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || name.trim().length < 3 || password.length < 8 || password !== confirmPassword}
            className="w-full bg-fairway text-white py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create League"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/leagues" className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider">
            &larr; Back to League Search
          </Link>
        </div>
      </div>
    </div>
  );
}
