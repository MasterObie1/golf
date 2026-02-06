"use client";

import { useState } from "react";
import {
  approveTeam,
  rejectTeam,
  deleteTeam,
  getTeams,
  getAllTeamsWithStatus,
} from "@/lib/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Team {
  id: number;
  name: string;
  status?: string;
  captainName?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface TeamsTabProps {
  slug: string;
  leagueId: number;
  maxTeams: number;
  allTeams: Team[];
  onTeamsChanged: (teams: Team[], allTeams: Team[]) => void;
}

export default function TeamsTab({ slug, leagueId, maxTeams, allTeams, onTeamsChanged }: TeamsTabProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    action: "reject" | "delete";
    teamId: number;
    teamName: string;
  }>({ open: false, action: "reject", teamId: 0, teamName: "" });

  const pendingTeams = allTeams.filter((t) => t.status === "pending");
  const approvedTeams = allTeams.filter((t) => t.status === "approved");
  const rejectedTeams = allTeams.filter((t) => t.status === "rejected");

  async function handleApproveTeam(teamId: number) {
    setLoading(true);
    setMessage(null);
    try {
      await approveTeam(slug, teamId);
      const [teamsData, allTeamsData] = await Promise.all([
        getTeams(leagueId),
        getAllTeamsWithStatus(slug),
      ]);
      onTeamsChanged(teamsData, allTeamsData);
      setMessage({ type: "success", text: "Team approved!" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to approve team." });
    }
    setLoading(false);
  }

  function handleRejectTeam(teamId: number) {
    setConfirmState({ open: true, action: "reject", teamId, teamName: "" });
  }

  function handleDeleteTeam(teamId: number, teamName: string) {
    setConfirmState({ open: true, action: "delete", teamId, teamName });
  }

  async function executeConfirmedAction() {
    const { action, teamId, teamName } = confirmState;
    setConfirmState((prev) => ({ ...prev, open: false }));
    setLoading(true);
    setMessage(null);

    try {
      if (action === "reject") {
        await rejectTeam(slug, teamId);
        setMessage({ type: "success", text: "Team rejected." });
      } else {
        await deleteTeam(slug, teamId);
        setMessage({ type: "success", text: `Team "${teamName}" deleted.` });
      }
      const [teamsData, allTeamsData] = await Promise.all([
        getTeams(leagueId),
        getAllTeamsWithStatus(slug),
      ]);
      onTeamsChanged(teamsData, allTeamsData);
    } catch (error) {
      const fallback = action === "reject" ? "Failed to reject team." : "Failed to delete team.";
      setMessage({ type: "error", text: error instanceof Error ? error.message : fallback });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.action === "reject" ? "Reject Team" : "Delete Team"}
        message={
          confirmState.action === "reject"
            ? "Are you sure you want to reject this team?"
            : `Are you sure you want to delete team "${confirmState.teamName}"? This cannot be undone.`
        }
        confirmLabel={confirmState.action === "reject" ? "Reject" : "Delete"}
        variant="danger"
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {pendingTeams.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 border border-yellow-300">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Pending Approval ({pendingTeams.length})
          </h2>
          <div className="space-y-4">
            {pendingTeams.map((team) => (
              <div key={team.id} className="p-4 bg-yellow-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-800">{team.name}</h3>
                    {team.captainName && <p className="text-sm text-gray-600">Captain: {team.captainName}</p>}
                    {team.email && <p className="text-sm text-gray-500">{team.email}</p>}
                    {team.phone && <p className="text-sm text-gray-500">{team.phone}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveTeam(team.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectTeam(team.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">
          Approved Teams ({approvedTeams.length}/{maxTeams})
        </h2>
        {approvedTeams.length === 0 ? (
          <p className="text-gray-500">No approved teams yet.</p>
        ) : (
          <div className="space-y-2">
            {approvedTeams.map((team) => (
              <div key={team.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-gray-800">{team.name}</span>
                  {team.captainName && <span className="ml-2 text-sm text-gray-500">({team.captainName})</span>}
                </div>
                <button
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  disabled={loading}
                  className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectedTeams.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 border border-red-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Rejected Teams ({rejectedTeams.length})
          </h2>
          <div className="space-y-2">
            {rejectedTeams.map((team) => (
              <div key={team.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="text-gray-600">{team.name}</span>
                <button
                  onClick={() => handleDeleteTeam(team.id, team.name)}
                  disabled={loading}
                  className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
