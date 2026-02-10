"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { registerTeam } from "@/lib/actions/teams";
import { getLeaguePublicInfo } from "@/lib/actions/leagues";

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
        if (!league) {
          setError("League not found");
          setLoading(false);
          return;
        }
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
      const result = await registerTeam(
        slug,
        formData.teamName,
        formData.captainName,
        formData.email,
        formData.phone
      );
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-text-muted font-sans">Loading...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-scorecard-paper rounded-lg shadow-lg p-8 text-center border border-scorecard-line/50">
          <div className="w-16 h-16 bg-fairway/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-fairway"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-2">
            Registration Submitted!
          </h1>
          <p className="text-text-secondary mb-6 font-sans">
            Your team registration has been submitted for review. The league admin
            will approve your team shortly.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-fairway text-white px-6 py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-scorecard-paper rounded-lg shadow-lg p-8 text-center border border-scorecard-line/50">
          <h1 className="text-2xl font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-4">
            Registration Closed
          </h1>
          <p className="text-text-secondary mb-6 font-sans">
            Team registration for {leagueName} is currently closed.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-fairway text-white px-6 py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  if (!activeSeasonName) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-scorecard-paper rounded-lg shadow-lg p-8 text-center border border-scorecard-line/50">
          <h1 className="text-2xl font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-4">
            No Active Season
          </h1>
          <p className="text-text-secondary mb-6 font-sans">
            The league admin needs to create a season before teams can register.
          </p>
          <Link
            href={`/league/${slug}`}
            className="inline-block bg-fairway text-white px-6 py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider"
          >
            Back to League
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider"
          >
            &larr; Back to {leagueName}
          </Link>
        </div>

        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 border border-scorecard-line/50">
          <h1 className="text-2xl font-display font-bold text-scorecard-pencil uppercase tracking-wider mb-2">Team Signup</h1>
          <p className="text-text-secondary mb-2 font-sans">{leagueName}</p>
          <p className="text-sm text-text-muted mb-6 font-sans">
            Registering for: <span className="font-medium">{activeSeasonName}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="teamName" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
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
                className={`pencil-input w-full ${
                  touched.teamName && getFieldError("teamName") ? "!border-b-board-red" : ""
                }`}
                required
                minLength={2}
                maxLength={50}
                aria-describedby={touched.teamName && getFieldError("teamName") ? "teamName-error" : undefined}
              />
              {touched.teamName && getFieldError("teamName") && (
                <p id="teamName-error" role="alert" className="mt-1 text-sm text-board-red font-sans">
                  {getFieldError("teamName")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="captainName" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
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
                className={`pencil-input w-full ${
                  touched.captainName && getFieldError("captainName") ? "!border-b-board-red" : ""
                }`}
                required
                minLength={2}
                maxLength={100}
                aria-describedby={touched.captainName && getFieldError("captainName") ? "captainName-error" : undefined}
              />
              {touched.captainName && getFieldError("captainName") && (
                <p id="captainName-error" role="alert" className="mt-1 text-sm text-board-red font-sans">
                  {getFieldError("captainName")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
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
                className={`pencil-input w-full ${
                  touched.email && getFieldError("email") ? "!border-b-board-red" : ""
                }`}
                required
                aria-describedby={touched.email && getFieldError("email") ? "email-error" : undefined}
              />
              {touched.email && getFieldError("email") && (
                <p id="email-error" role="alert" className="mt-1 text-sm text-board-red font-sans">
                  {getFieldError("email")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
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
                className={`pencil-input w-full ${
                  touched.phone && getFieldError("phone") ? "!border-b-board-red" : ""
                }`}
                required
                minLength={10}
                maxLength={20}
                aria-describedby={touched.phone && getFieldError("phone") ? "phone-error" : undefined}
              />
              {touched.phone && getFieldError("phone") && (
                <p id="phone-error" role="alert" className="mt-1 text-sm text-board-red font-sans">
                  {getFieldError("phone")}
                </p>
              )}
            </div>

            {error && (
              <div className="bg-error-bg border border-error-border text-error-text px-4 py-3 rounded-lg font-sans text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-fairway text-white py-3 rounded-lg hover:bg-rough transition-colors font-display font-semibold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Register Team"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
