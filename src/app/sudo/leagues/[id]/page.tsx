"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface League {
  id: number;
  name: string;
  slug: string;
  adminUsername: string;
  status: string;
  subscriptionTier: string;
  scoringType: string;
  scheduleType: string | null;
  scheduleVisibility: string;
  byePointsMode: string;
  maxTeams: number;
  registrationOpen: boolean;
  courseName: string | null;
  courseLocation: string | null;
  playDay: string | null;
  playTime: string | null;
  contactEmail: string | null;
  createdAt: string;
  _count: {
    teams: number;
    matchups: number;
    scheduledMatchups: number;
  };
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function LeagueManagementPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function fetchLeague() {
      try {
        const res = await fetch(`/api/sudo/leagues/${id}`);
        if (!res.ok) throw new Error("League not found");
        const data = await res.json();
        setLeague(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load league");
      } finally {
        setLoading(false);
      }
    }
    fetchLeague();
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!league) return;
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch(`/api/sudo/leagues/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setLeague({ ...league, status: newStatus });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!league || deleteConfirmText !== league.name) return;
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch(`/api/sudo/leagues/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete league");
      router.push("/sudo");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete league");
      setActionLoading(false);
    }
  };

  const handleImpersonate = async () => {
    if (!league) return;
    setError("");
    setActionLoading(true);
    try {
      const res = await fetch(`/api/sudo/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: league.id }),
      });
      if (!res.ok) throw new Error("Failed to impersonate");
      // Redirect to the league admin panel
      window.location.href = `/league/${league.slug}/admin`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to impersonate");
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-putting/60 font-sans">Loading...</div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-board-red/20 border border-board-red/50 text-board-red px-4 py-3 rounded-lg font-sans">
          {error || "League not found"}
        </div>
        <Link
          href="/sudo"
          className="mt-4 inline-block text-board-yellow hover:text-board-yellow/80 font-display text-sm uppercase tracking-wider"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/sudo"
          className="text-putting/60 hover:text-white text-sm font-display uppercase tracking-wider"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-white uppercase tracking-wider">{league.name}</h1>
          <p className="text-putting/60 font-mono">/{league.slug}</p>
        </div>
        <span
          className={`inline-flex px-3 py-1 text-sm font-display font-medium rounded uppercase tracking-wider ${
            league.status === "active"
              ? "bg-fairway/20 text-fairway"
              : league.status === "suspended"
              ? "bg-board-yellow/20 text-board-yellow"
              : "bg-board-red/20 text-board-red"
          }`}
        >
          {league.status}
        </span>
      </div>

      {error && (
        <div className="mb-6 bg-board-red/20 border border-board-red/50 text-board-red px-4 py-3 rounded-lg font-sans">
          {error}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/80 text-xs font-display uppercase tracking-wider">Teams</div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">{league._count.teams}</div>
        </div>
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/80 text-xs font-display uppercase tracking-wider">Matchups</div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">{league._count.matchups}</div>
        </div>
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/80 text-xs font-display uppercase tracking-wider">Scoring</div>
          <div className="text-lg font-bold text-white mt-1">
            <span className={`inline-flex px-2 py-0.5 text-xs font-display font-medium rounded uppercase tracking-wider ${
              league.scoringType === "stroke_play"
                ? "bg-water/20 text-water"
                : league.scoringType === "hybrid"
                ? "bg-putting/20 text-putting"
                : "bg-rough text-putting/80"
            }`}>
              {league.scoringType === "stroke_play" ? "Stroke Play"
                : league.scoringType === "hybrid" ? "Hybrid"
                : "Match Play"}
            </span>
          </div>
        </div>
        <div className="bg-board-green border border-board-green/80 rounded-lg p-4">
          <div className="text-putting/80 text-xs font-display uppercase tracking-wider">Schedule</div>
          <div className="text-lg font-bold text-white mt-1">
            {league._count.scheduledMatchups > 0 ? (
              <span className="text-fairway text-sm font-mono tabular-nums">{league._count.scheduledMatchups} matchups</span>
            ) : (
              <span className="text-putting/40 text-sm font-sans">Not generated</span>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-board-green border border-board-green/80 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-display font-semibold text-board-yellow uppercase tracking-wider mb-4">League Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm font-sans">
          <div>
            <span className="text-putting/80">Admin Username:</span>
            <span className="text-white ml-2">{league.adminUsername}</span>
          </div>
          <div>
            <span className="text-putting/80">Subscription:</span>
            <span className="text-white ml-2">{league.subscriptionTier}</span>
          </div>
          {league.courseName && (
            <div>
              <span className="text-putting/80">Course:</span>
              <span className="text-white ml-2">{league.courseName}</span>
            </div>
          )}
          {league.courseLocation && (
            <div>
              <span className="text-putting/80">Location:</span>
              <span className="text-white ml-2">{league.courseLocation}</span>
            </div>
          )}
          {league.playDay && (
            <div>
              <span className="text-putting/80">Play Day:</span>
              <span className="text-white ml-2">{league.playDay}</span>
            </div>
          )}
          {league.playTime && (
            <div>
              <span className="text-putting/80">Play Time:</span>
              <span className="text-white ml-2">{league.playTime}</span>
            </div>
          )}
          {league.contactEmail && (
            <div>
              <span className="text-putting/80">Contact:</span>
              <span className="text-white ml-2">{league.contactEmail}</span>
            </div>
          )}
          <div>
            <span className="text-putting/80">Created:</span>
            <span className="text-white ml-2">
              {new Date(league.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-board-green border border-board-green/80 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-display font-semibold text-board-yellow uppercase tracking-wider mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleImpersonate}
            disabled={actionLoading}
            className="px-4 py-2 bg-board-yellow text-rough rounded-lg hover:bg-board-yellow/90 disabled:opacity-50 text-sm font-display font-semibold uppercase tracking-wider"
          >
            Login as Admin
          </button>
          <Link
            href={`/league/${league.slug}`}
            target="_blank"
            className="px-4 py-2 bg-rough text-putting/80 rounded-lg hover:bg-rough/80 hover:text-white text-sm font-display font-medium uppercase tracking-wider"
          >
            View League Page
          </Link>
          <Link
            href={`/league/${league.slug}/admin`}
            target="_blank"
            className="px-4 py-2 bg-rough text-putting/80 rounded-lg hover:bg-rough/80 hover:text-white text-sm font-display font-medium uppercase tracking-wider"
          >
            View Admin Panel
          </Link>
        </div>
      </div>

      {/* Status management */}
      <div className="bg-board-green border border-board-green/80 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-display font-semibold text-board-yellow uppercase tracking-wider mb-4">Status Management</h2>
        <div className="flex flex-wrap gap-3">
          {league.status !== "active" && (
            <button
              onClick={() => handleStatusChange("active")}
              disabled={actionLoading}
              className="px-4 py-2 bg-fairway text-white rounded-lg hover:bg-fairway/90 disabled:opacity-50 text-sm font-display font-semibold uppercase tracking-wider"
            >
              Activate
            </button>
          )}
          {league.status !== "suspended" && (
            <button
              onClick={() => handleStatusChange("suspended")}
              disabled={actionLoading}
              className="px-4 py-2 bg-board-yellow text-rough rounded-lg hover:bg-board-yellow/90 disabled:opacity-50 text-sm font-display font-semibold uppercase tracking-wider"
            >
              Suspend
            </button>
          )}
          {league.status !== "cancelled" && (
            <button
              onClick={() => handleStatusChange("cancelled")}
              disabled={actionLoading}
              className="px-4 py-2 bg-board-red text-white rounded-lg hover:bg-board-red/90 disabled:opacity-50 text-sm font-display font-semibold uppercase tracking-wider"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-board-red/10 border border-board-red/30 rounded-lg p-6">
        <h2 className="text-lg font-display font-semibold text-board-red uppercase tracking-wider mb-4">Danger Zone</h2>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-board-red text-white rounded-lg hover:bg-board-red/90 text-sm font-display font-semibold uppercase tracking-wider"
          >
            Delete League
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-putting/80 text-sm font-sans">
              This will permanently delete the league and all associated data
              (teams, matchups). This action cannot be undone.
            </p>
            <p className="text-putting/80 text-sm font-sans">
              Type <strong className="text-white">{league.name}</strong> to
              confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full max-w-md px-4 py-2 bg-rough border-b-2 border-putting/40 text-white placeholder-putting/30 focus:outline-none focus:border-board-red font-sans transition-colors"
              placeholder="Enter league name"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== league.name || actionLoading}
                className="px-4 py-2 bg-board-red text-white rounded-lg hover:bg-board-red/90 disabled:opacity-50 text-sm font-display font-semibold uppercase tracking-wider"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                className="px-4 py-2 bg-rough text-putting/80 rounded-lg hover:bg-rough/80 hover:text-white text-sm font-display font-medium uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
