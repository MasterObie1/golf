"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { registerTeam, getLeagueSettings } from "@/lib/actions";

export default function SignupPage() {
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      await registerTeam(teamName, captainName, email, phone);
      setMessage({
        type: "success",
        text: "Team registration submitted! You will be notified once your team is approved.",
      });
      // Clear form
      setTeamName("");
      setCaptainName("");
      setEmail("");
      setPhone("");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to register team",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--masters-cream)]">
      {/* Header Banner */}
      <div className="relative h-48 md:h-64">
        <Image
          src="https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1920&q=80"
          alt="Golf course"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--masters-green)]/70 to-[var(--masters-green)]/90" />
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white font-[family-name:var(--font-playfair)] drop-shadow-lg">
            Team Registration
          </h1>
        </div>
        {/* Navigation */}
        <div className="absolute top-4 right-4 flex gap-3">
          <Link
            href="/"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            Home
          </Link>
          <Link
            href="/leaderboard"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            Leaderboard
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-4 py-8 -mt-8">
        <div className="bg-white rounded-lg shadow-lg p-6 border border-[var(--masters-green)]/20">
          <p className="text-[var(--text-secondary)] mb-6 text-center">
            Register your team for the golf league. Your registration will be reviewed and approved by an administrator.
          </p>

          {message && (
            <div
              className={`mb-6 p-4 rounded-lg border ${
                message.type === "success"
                  ? "bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]"
                  : "bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="teamName" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Team Name *
              </label>
              <input
                type="text"
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] focus:border-[var(--masters-green)] outline-none"
                placeholder="Enter your team name"
              />
            </div>

            <div>
              <label htmlFor="captainName" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Captain Name *
              </label>
              <input
                type="text"
                id="captainName"
                value={captainName}
                onChange={(e) => setCaptainName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] focus:border-[var(--masters-green)] outline-none"
                placeholder="Enter captain's full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] focus:border-[var(--masters-green)] outline-none"
                placeholder="captain@example.com"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-[var(--masters-green)] focus:border-[var(--masters-green)] outline-none"
                placeholder="(555) 123-4567"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[var(--masters-green)] text-white font-semibold rounded-lg hover:bg-[var(--masters-green-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Register Team"}
            </button>
          </form>

          <p className="mt-6 text-sm text-[var(--text-muted)] text-center">
            Already registered? Check the{" "}
            <Link href="/leaderboard" className="text-[var(--masters-green)] hover:underline">
              leaderboard
            </Link>{" "}
            for approved teams.
          </p>
        </div>
      </div>
    </div>
  );
}
