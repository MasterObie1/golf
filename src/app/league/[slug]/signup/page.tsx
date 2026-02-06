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
  const [activeSeasonName, setActiveSeasonName] = useState<string | null>(null);
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
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  function getFieldError(field: string): string | null {
    const value = formData[field as keyof typeof formData];
    switch (field) {
      case "teamName":
        if (!value) return "Team name is required";
        if (value.length < 2) return "Team name must be at least 2 characters";
        return null;
      case "captainName":
        if (!value) return "Captain name is required";
        if (value.length < 2) return "Captain name must be at least 2 characters";
        return null;
      case "email":
        if (!value) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email address";
        return null;
      case "phone":
        if (!value) return "Phone number is required";
        if (value.length < 10) return "Phone number must be at least 10 digits";
        return null;
      default:
        return null;
    }
  }

  function handleBlur(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  useEffect(() => {
    getLeaguePublicInfo(slug)
      .then((league) => {
        setLeagueName(league.name);
        setRegistrationOpen(league.registrationOpen);
        const activeSeason = (league as { seasons?: { name: string }[] }).seasons?.[0];
        setActiveSeasonName(activeSeason?.name || null);
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
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
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
          <h1 className="text-2xl font-bold text-green-dark mb-2">
            Registration Submitted!
          </h1>
          <p className="text-gray-600 mb-6">
            Your team registration has been submitted for review. The league admin
            will approve your team shortly.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-green-primary text-white px-6 py-3 rounded-lg hover:bg-green-dark transition-colors"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Registration Closed
          </h1>
          <p className="text-gray-600 mb-6">
            Team registration for {leagueName} is currently closed.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-green-primary text-white px-6 py-3 rounded-lg hover:bg-green-dark transition-colors"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  if (!activeSeasonName) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            No Active Season
          </h1>
          <p className="text-gray-600 mb-6">
            The league admin needs to create a season before teams can register.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-green-primary text-white px-6 py-3 rounded-lg hover:bg-green-dark transition-colors"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}`}
            className="text-green-primary hover:text-green-dark"
          >
            &larr; Back to {leagueName}
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-green-dark mb-2">Team Signup</h1>
          <p className="text-gray-600 mb-2">{leagueName}</p>
          <p className="text-sm text-gray-500 mb-6">
            Registering for: <span className="font-medium">{activeSeasonName}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-1">
                Team Name
              </label>
              <input
                id="teamName"
                type="text"
                value={formData.teamName}
                onChange={(e) =>
                  setFormData({ ...formData, teamName: e.target.value })
                }
                onBlur={() => handleBlur("teamName")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-primary ${
                  touched.teamName && getFieldError("teamName") ? "border-red-400" : "border-gray-300"
                }`}
                required
                minLength={2}
                maxLength={50}
                aria-describedby={touched.teamName && getFieldError("teamName") ? "teamName-error" : undefined}
              />
              {touched.teamName && getFieldError("teamName") && (
                <p id="teamName-error" role="alert" className="mt-1 text-sm text-red-600">
                  {getFieldError("teamName")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="captainName" className="block text-sm font-medium text-gray-700 mb-1">
                Captain Name
              </label>
              <input
                id="captainName"
                type="text"
                value={formData.captainName}
                onChange={(e) =>
                  setFormData({ ...formData, captainName: e.target.value })
                }
                onBlur={() => handleBlur("captainName")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-primary ${
                  touched.captainName && getFieldError("captainName") ? "border-red-400" : "border-gray-300"
                }`}
                required
                minLength={2}
                maxLength={100}
                aria-describedby={touched.captainName && getFieldError("captainName") ? "captainName-error" : undefined}
              />
              {touched.captainName && getFieldError("captainName") && (
                <p id="captainName-error" role="alert" className="mt-1 text-sm text-red-600">
                  {getFieldError("captainName")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                onBlur={() => handleBlur("email")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-primary ${
                  touched.email && getFieldError("email") ? "border-red-400" : "border-gray-300"
                }`}
                required
                aria-describedby={touched.email && getFieldError("email") ? "email-error" : undefined}
              />
              {touched.email && getFieldError("email") && (
                <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">
                  {getFieldError("email")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                onBlur={() => handleBlur("phone")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-primary ${
                  touched.phone && getFieldError("phone") ? "border-red-400" : "border-gray-300"
                }`}
                required
                minLength={10}
                maxLength={20}
                aria-describedby={touched.phone && getFieldError("phone") ? "phone-error" : undefined}
              />
              {touched.phone && getFieldError("phone") && (
                <p id="phone-error" role="alert" className="mt-1 text-sm text-red-600">
                  {getFieldError("phone")}
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-green-primary text-white py-3 rounded-lg hover:bg-green-dark transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Register Team"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
