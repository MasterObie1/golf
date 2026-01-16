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
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error || "League not found"}
        </div>
        <Link
          href="/sudo"
          className="mt-4 inline-block text-amber-500 hover:text-amber-400"
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
          className="text-slate-400 hover:text-white text-sm"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{league.name}</h1>
          <p className="text-slate-400">/{league.slug}</p>
        </div>
        <span
          className={`inline-flex px-3 py-1 text-sm font-medium rounded ${
            league.status === "active"
              ? "bg-green-900/50 text-green-400"
              : league.status === "suspended"
              ? "bg-amber-900/50 text-amber-400"
              : "bg-red-900/50 text-red-400"
          }`}
        >
          {league.status}
        </span>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase">Teams</div>
          <div className="text-2xl font-bold text-white">{league._count.teams}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase">Matchups</div>
          <div className="text-2xl font-bold text-white">{league._count.matchups}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase">Max Teams</div>
          <div className="text-2xl font-bold text-white">{league.maxTeams}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-slate-400 text-xs uppercase">Registration</div>
          <div className="text-2xl font-bold text-white">
            {league.registrationOpen ? "Open" : "Closed"}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">League Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Admin Username:</span>
            <span className="text-white ml-2">{league.adminUsername}</span>
          </div>
          <div>
            <span className="text-slate-400">Subscription:</span>
            <span className="text-white ml-2">{league.subscriptionTier}</span>
          </div>
          {league.courseName && (
            <div>
              <span className="text-slate-400">Course:</span>
              <span className="text-white ml-2">{league.courseName}</span>
            </div>
          )}
          {league.courseLocation && (
            <div>
              <span className="text-slate-400">Location:</span>
              <span className="text-white ml-2">{league.courseLocation}</span>
            </div>
          )}
          {league.playDay && (
            <div>
              <span className="text-slate-400">Play Day:</span>
              <span className="text-white ml-2">{league.playDay}</span>
            </div>
          )}
          {league.playTime && (
            <div>
              <span className="text-slate-400">Play Time:</span>
              <span className="text-white ml-2">{league.playTime}</span>
            </div>
          )}
          {league.contactEmail && (
            <div>
              <span className="text-slate-400">Contact:</span>
              <span className="text-white ml-2">{league.contactEmail}</span>
            </div>
          )}
          <div>
            <span className="text-slate-400">Created:</span>
            <span className="text-white ml-2">
              {new Date(league.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleImpersonate}
            disabled={actionLoading}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
          >
            Login as Admin
          </button>
          <Link
            href={`/league/${league.slug}`}
            target="_blank"
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 text-sm font-medium"
          >
            View League Page
          </Link>
          <Link
            href={`/league/${league.slug}/admin`}
            target="_blank"
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 text-sm font-medium"
          >
            View Admin Panel
          </Link>
        </div>
      </div>

      {/* Status management */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Status Management</h2>
        <div className="flex flex-wrap gap-3">
          {league.status !== "active" && (
            <button
              onClick={() => handleStatusChange("active")}
              disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              Activate
            </button>
          )}
          {league.status !== "suspended" && (
            <button
              onClick={() => handleStatusChange("suspended")}
              disabled={actionLoading}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
            >
              Suspend
            </button>
          )}
          {league.status !== "cancelled" && (
            <button
              onClick={() => handleStatusChange("cancelled")}
              disabled={actionLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-red-950/30 border border-red-900 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Delete League
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              This will permanently delete the league and all associated data
              (teams, matchups). This action cannot be undone.
            </p>
            <p className="text-slate-300 text-sm">
              Type <strong className="text-white">{league.name}</strong> to
              confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Enter league name"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== league.name || actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 text-sm font-medium"
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
