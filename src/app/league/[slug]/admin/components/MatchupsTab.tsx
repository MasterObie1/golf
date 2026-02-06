"use client";

import { useState } from "react";
import {
  previewMatchup,
  submitMatchup,
  submitForfeit,
  deleteMatchup,
  getCurrentWeekNumber,
  getMatchupHistory,
  type MatchupPreview,
} from "@/lib/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Team {
  id: number;
  name: string;
}

interface Matchup {
  id: number;
  weekNumber: number;
  teamA: { id: number; name: string };
  teamB: { id: number; name: string };
  teamAPoints: number;
  teamBPoints: number;
}

interface MatchupsTabProps {
  slug: string;
  leagueId: number;
  teams: Team[];
  matchups: Matchup[];
  weekNumber: number;
  onDataRefresh: (data: { weekNumber?: number; matchups?: Matchup[] }) => void;
}

export default function MatchupsTab({
  slug,
  leagueId,
  teams,
  matchups,
  weekNumber: initialWeekNumber,
  onDataRefresh,
}: MatchupsTabProps) {
  // Form state
  const [teamAId, setTeamAId] = useState<number | "">("");
  const [teamBId, setTeamBId] = useState<number | "">("");
  const [teamAGross, setTeamAGross] = useState<number | "">("");
  const [teamBGross, setTeamBGross] = useState<number | "">("");
  const [teamAHandicapManual, setTeamAHandicapManual] = useState<number | "">("");
  const [teamBHandicapManual, setTeamBHandicapManual] = useState<number | "">("");
  const [teamAIsSub, setTeamAIsSub] = useState(false);
  const [teamBIsSub, setTeamBIsSub] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<MatchupPreview | null>(null);
  const [teamAPointsOverride, setTeamAPointsOverride] = useState<number | "">("");
  const [teamBPointsOverride, setTeamBPointsOverride] = useState<number | "">("");

  // Forfeit state
  const [isForfeitMode, setIsForfeitMode] = useState(false);
  const [winningTeamId, setWinningTeamId] = useState<number | "">("");
  const [forfeitingTeamId, setForfeitingTeamId] = useState<number | "">("");

  // Week number (local)
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber);

  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; matchupId: number }>({ open: false, matchupId: 0 });

  const isWeekOne = weekNumber === 1;

  async function handlePreview() {
    if (teamAId === "" || teamBId === "" || teamAGross === "" || teamBGross === "") {
      setMessage({ type: "error", text: "Please fill in all required fields." });
      return;
    }
    if (teamAId === teamBId) {
      setMessage({ type: "error", text: "Please select two different teams." });
      return;
    }
    if (isWeekOne && (teamAHandicapManual === "" || teamBHandicapManual === "")) {
      setMessage({ type: "error", text: "Week 1 requires manual handicap entry." });
      return;
    }
    if (teamAIsSub && teamAHandicapManual === "") {
      setMessage({ type: "error", text: "Substitute players require manual handicap entry." });
      return;
    }
    if (teamBIsSub && teamBHandicapManual === "") {
      setMessage({ type: "error", text: "Substitute players require manual handicap entry." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const previewData = await previewMatchup(
        leagueId,
        weekNumber,
        teamAId as number,
        teamAGross as number,
        (isWeekOne || teamAIsSub) ? (teamAHandicapManual as number) : null,
        teamAIsSub,
        teamBId as number,
        teamBGross as number,
        (isWeekOne || teamBIsSub) ? (teamBHandicapManual as number) : null,
        teamBIsSub
      );
      setPreview(previewData);
      setTeamAPointsOverride("");
      setTeamBPointsOverride("");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to generate preview." });
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!preview) return;

    setLoading(true);
    try {
      await submitMatchup(
        slug,
        preview.weekNumber,
        preview.teamAId,
        preview.teamAGross,
        preview.teamAHandicap,
        preview.teamANet,
        typeof teamAPointsOverride === "number" ? teamAPointsOverride : preview.teamAPoints,
        preview.teamAIsSub,
        preview.teamBId,
        preview.teamBGross,
        preview.teamBHandicap,
        preview.teamBNet,
        typeof teamBPointsOverride === "number" ? teamBPointsOverride : preview.teamBPoints,
        preview.teamBIsSub
      );
      setMessage({ type: "success", text: "Matchup submitted successfully!" });
      setPreview(null);
      setTeamAId("");
      setTeamBId("");
      setTeamAGross("");
      setTeamBGross("");
      setTeamAHandicapManual("");
      setTeamBHandicapManual("");
      setTeamAIsSub(false);
      setTeamBIsSub(false);
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(leagueId),
        getMatchupHistory(leagueId),
      ]);
      setWeekNumber(currentWeek);
      onDataRefresh({ weekNumber: currentWeek, matchups: matchupsData });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to submit matchup. May already exist for this week." });
    }
    setLoading(false);
  }

  function handleCancelPreview() {
    setPreview(null);
    setMessage(null);
  }

  async function handleSubmitForfeit() {
    if (winningTeamId === "" || forfeitingTeamId === "") {
      setMessage({ type: "error", text: "Please select both teams." });
      return;
    }
    if (winningTeamId === forfeitingTeamId) {
      setMessage({ type: "error", text: "Please select two different teams." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await submitForfeit(slug, weekNumber, winningTeamId as number, forfeitingTeamId as number);
      setMessage({ type: "success", text: "Forfeit recorded successfully!" });
      setWinningTeamId("");
      setForfeitingTeamId("");
      setIsForfeitMode(false);
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(leagueId),
        getMatchupHistory(leagueId),
      ]);
      setWeekNumber(currentWeek);
      onDataRefresh({ weekNumber: currentWeek, matchups: matchupsData });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to record forfeit. Teams may have already played this week." });
    }
    setLoading(false);
  }

  function handleDeleteMatchup(matchupId: number) {
    setDeleteConfirm({ open: true, matchupId });
  }

  async function executeDeleteMatchup() {
    const { matchupId } = deleteConfirm;
    setDeleteConfirm({ open: false, matchupId: 0 });
    setLoading(true);
    try {
      await deleteMatchup(slug, matchupId);
      setMessage({ type: "success", text: "Matchup deleted successfully!" });
      const [currentWeek, matchupsData] = await Promise.all([
        getCurrentWeekNumber(leagueId),
        getMatchupHistory(leagueId),
      ]);
      setWeekNumber(currentWeek);
      onDataRefresh({ weekNumber: currentWeek, matchups: matchupsData });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to delete matchup." });
    }
    setLoading(false);
  }

  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Matchup"
        message="Are you sure you want to delete this matchup? Team stats will be reversed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={executeDeleteMatchup}
        onCancel={() => setDeleteConfirm({ open: false, matchupId: 0 })}
      />
      {/* Message Banner */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Matchup Entry Form */}
      {!preview ? (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {isForfeitMode ? "Record Forfeit" : "Enter Matchup Results"}
            </h2>
            <button
              onClick={() => {
                setIsForfeitMode(!isForfeitMode);
                setMessage(null);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                isForfeitMode
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {isForfeitMode ? "Cancel Forfeit" : "Record Forfeit"}
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Week Number
            </label>
            <input
              type="number"
              value={weekNumber}
              onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
              min={1}
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
            {isWeekOne && !isForfeitMode && (
              <p className="mt-2 text-sm text-yellow-700 font-medium">
                Week 1: Manual handicap entry required
              </p>
            )}
          </div>

          {isForfeitMode ? (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">
                  A forfeit awards 20 points to the winning team and 0 points to the forfeiting team.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    Winning Team (receives 20 pts)
                  </label>
                  <select
                    value={winningTeamId}
                    onChange={(e) => setWinningTeamId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <label className="block text-sm font-medium text-red-700 mb-2">
                    Forfeiting Team (receives 0 pts)
                  </label>
                  <select
                    value={forfeitingTeamId}
                    onChange={(e) => setForfeitingTeamId(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleSubmitForfeit}
                disabled={loading || teams.length < 2}
                className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Recording..." : "Record Forfeit"}
              </button>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-8">
                {/* Team A */}
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-lg text-green-700">Team A</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Team
                    </label>
                    <select
                      value={teamAId}
                      onChange={(e) => setTeamAId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">-- Select Team --</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gross Score
                    </label>
                    <input
                      type="number"
                      value={teamAGross}
                      onChange={(e) => setTeamAGross(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  {(isWeekOne || teamAIsSub) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Handicap (Manual)
                      </label>
                      <input
                        type="number"
                        value={teamAHandicapManual}
                        onChange={(e) => setTeamAHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="teamAIsSub"
                      checked={teamAIsSub}
                      onChange={(e) => setTeamAIsSub(e.target.checked)}
                      className="w-4 h-4 text-green-600"
                    />
                    <label htmlFor="teamAIsSub" className="text-sm text-gray-600">
                      Substitute played
                    </label>
                  </div>
                </div>

                {/* Team B */}
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-lg text-green-700">Team B</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Team
                    </label>
                    <select
                      value={teamBId}
                      onChange={(e) => setTeamBId(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">-- Select Team --</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gross Score
                    </label>
                    <input
                      type="number"
                      value={teamBGross}
                      onChange={(e) => setTeamBGross(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  {(isWeekOne || teamBIsSub) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Handicap (Manual)
                      </label>
                      <input
                        type="number"
                        value={teamBHandicapManual}
                        onChange={(e) => setTeamBHandicapManual(e.target.value ? parseInt(e.target.value) : "")}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="teamBIsSub"
                      checked={teamBIsSub}
                      onChange={(e) => setTeamBIsSub(e.target.checked)}
                      className="w-4 h-4 text-green-600"
                    />
                    <label htmlFor="teamBIsSub" className="text-sm text-gray-600">
                      Substitute played
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button
                  onClick={handlePreview}
                  disabled={loading || teams.length < 2}
                  className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Preview Results"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Preview Panel */
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-800">Preview - Week {preview.weekNumber}</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4 text-center">Gross</th>
                  <th className="py-3 px-4 text-center">Handicap</th>
                  <th className="py-3 px-4 text-center">Net</th>
                  <th className="py-3 px-4 text-center">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-gray-50">
                  <td className="py-3 px-4 font-medium">
                    {preview.teamAName}
                    {preview.teamAIsSub && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">SUB</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">{preview.teamAGross}</td>
                  <td className="py-3 px-4 text-center">{preview.teamAHandicap}</td>
                  <td className="py-3 px-4 text-center font-semibold">{preview.teamANet.toFixed(1)}</td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number"
                      step="0.5"
                      value={teamAPointsOverride}
                      onChange={(e) => setTeamAPointsOverride(e.target.value ? parseFloat(e.target.value) : "")}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                    />
                  </td>
                </tr>
                <tr className="bg-white">
                  <td className="py-3 px-4 font-medium">
                    {preview.teamBName}
                    {preview.teamBIsSub && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">SUB</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">{preview.teamBGross}</td>
                  <td className="py-3 px-4 text-center">{preview.teamBHandicap}</td>
                  <td className="py-3 px-4 text-center font-semibold">{preview.teamBNet.toFixed(1)}</td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number"
                      step="0.5"
                      value={teamBPointsOverride}
                      onChange={(e) => setTeamBPointsOverride(e.target.value ? parseFloat(e.target.value) : "")}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {teamAPointsOverride !== "" && teamBPointsOverride !== "" && (
            <div className={`mt-4 p-3 rounded-lg ${
              Number(teamAPointsOverride) + Number(teamBPointsOverride) === 20
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}>
              Total: {Number(teamAPointsOverride) + Number(teamBPointsOverride)} / 20 points
              {Number(teamAPointsOverride) + Number(teamBPointsOverride) !== 20 && (
                <span className="ml-2 font-medium">(Must equal 20)</span>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleCancelPreview}
              className="flex-1 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                loading ||
                teamAPointsOverride === "" ||
                teamBPointsOverride === "" ||
                Number(teamAPointsOverride) + Number(teamBPointsOverride) !== 20
              }
              className="flex-1 py-3 bg-yellow-400 text-yellow-900 font-semibold rounded-lg hover:bg-yellow-500 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Matchup"}
            </button>
          </div>
        </div>
      )}

      {/* Recent Matchups */}
      {matchups.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Recent Matchups</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="py-2 px-3">Week</th>
                  <th className="py-2 px-3">Team A</th>
                  <th className="py-2 px-3 text-center">Pts</th>
                  <th className="py-2 px-3">Team B</th>
                  <th className="py-2 px-3 text-center">Pts</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {matchups.slice(0, 10).map((matchup) => (
                  <tr key={matchup.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{matchup.weekNumber}</td>
                    <td className="py-2 px-3 font-medium">{matchup.teamA.name}</td>
                    <td className="py-2 px-3 text-center font-semibold text-green-700">{matchup.teamAPoints}</td>
                    <td className="py-2 px-3 font-medium">{matchup.teamB.name}</td>
                    <td className="py-2 px-3 text-center font-semibold text-green-700">{matchup.teamBPoints}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleDeleteMatchup(matchup.id)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
