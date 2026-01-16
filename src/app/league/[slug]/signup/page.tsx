"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { registerTeam, getLeaguePublicInfo } from "@/lib/actions";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function LeagueSignupPage({ params }: Props) {
  const { slug } = use(params);

  const [leagueName, setLeagueName] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    teamName: "",
    captainName: "",
    email: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getLeaguePublicInfo(slug)
      .then((league) => {
        setLeagueName(league.name);
        setRegistrationOpen(league.registrationOpen);
        setLoading(false);
      })
      .catch(() => {
        setError("League not found");
        setLoading(false);
      });
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await registerTeam(
        slug,
        formData.teamName,
        formData.captainName,
        formData.email,
        formData.phone
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
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
          <h1 className="text-2xl font-bold text-green-800 mb-2">
            Registration Submitted!
          </h1>
          <p className="text-gray-600 mb-6">
            Your team registration has been submitted for review. The league admin
            will approve your team shortly.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Registration Closed
          </h1>
          <p className="text-gray-600 mb-6">
            Team registration for {leagueName} is currently closed.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}`}
            className="text-green-600 hover:text-green-700"
          >
            &larr; Back to {leagueName}
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-green-800 mb-2">Team Signup</h1>
          <p className="text-gray-600 mb-6">{leagueName}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={formData.teamName}
                onChange={(e) =>
                  setFormData({ ...formData, teamName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
                minLength={2}
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Captain Name
              </label>
              <input
                type="text"
                value={formData.captainName}
                onChange={(e) =>
                  setFormData({ ...formData, captainName: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
                minLength={2}
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
                minLength={10}
                maxLength={20}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Register Team"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
