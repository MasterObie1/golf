"use client";

import { useState } from "react";
import Link from "next/link";
import { createLeague } from "@/lib/actions";

export default function NewLeaguePage() {
  const [name, setName] = useState("");
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
      const result = await createLeague(name, password);
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
      <div className="min-h-screen bg-green-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-green-800">League Created!</h1>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-gray-800 mb-3">Admin Access</h2>
            <p className="text-sm text-gray-600">
              Use the password you just set to log in to the admin dashboard.
              You can change it later in admin settings.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-amber-800 mb-2">Bookmark Your Admin URL</h2>
            <p className="text-sm text-amber-700 mb-2">
              The admin panel is only visible after logging in. Save this URL:
            </p>
            <code className="block bg-amber-100 px-3 py-2 rounded text-xs text-amber-900 break-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}/league/{success.slug}/admin
            </code>
          </div>

          <div className="space-y-3">
            <Link
              href={`/league/${success.slug}/admin/login`}
              className="block w-full bg-green-600 text-white text-center py-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Go to Admin Login
            </Link>
            <Link
              href={`/league/${success.slug}`}
              className="block w-full bg-gray-100 text-gray-700 text-center py-3 rounded-lg hover:bg-gray-200 transition-colors"
            >
              View League Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-green-800 text-center mb-6">
          Create a New League
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              League Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Thursday Night Golf League"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
              minLength={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              This will be the public name of your league
            </p>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Admin Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
              minLength={8}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || name.trim().length < 3 || password.length < 8 || password !== confirmPassword}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create League"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/leagues" className="text-green-600 hover:text-green-700">
            &larr; Back to League Search
          </Link>
        </div>
      </div>
    </div>
  );
}
