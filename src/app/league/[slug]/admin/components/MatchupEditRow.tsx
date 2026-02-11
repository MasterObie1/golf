"use client";

import { useState } from "react";
import { updateMatchup } from "@/lib/actions/matchups";
import { calculateNetScore, suggestPoints } from "@/lib/handicap";
import type { AdminMatchup } from "@/lib/types/admin";

interface MatchupEditRowProps {
  matchup: AdminMatchup;
  slug: string;
  onSaved: () => void;
  onCancel: () => void;
}

export default function MatchupEditRow({ matchup, slug, onSaved, onCancel }: MatchupEditRowProps) {
  const [grossA, setGrossA] = useState<number | "">(matchup.teamAGross);
  const [handicapA, setHandicapA] = useState<number | "">(matchup.teamAHandicap);
  const [pointsA, setPointsA] = useState<number | "">(matchup.teamAPoints);
  const [subA, setSubA] = useState(matchup.teamAIsSub);

  const [grossB, setGrossB] = useState<number | "">(matchup.teamBGross);
  const [handicapB, setHandicapB] = useState<number | "">(matchup.teamBHandicap);
  const [pointsB, setPointsB] = useState<number | "">(matchup.teamBPoints);
  const [subB, setSubB] = useState(matchup.teamBIsSub);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const netA = grossA !== "" && handicapA !== "" ? calculateNetScore(grossA, handicapA) : null;
  const netB = grossB !== "" && handicapB !== "" ? calculateNetScore(grossB, handicapB) : null;

  function handleRecalculatePoints() {
    if (netA === null || netB === null) return;
    const suggested = suggestPoints(netA, netB);
    setPointsA(suggested.teamAPoints);
    setPointsB(suggested.teamBPoints);
  }

  async function handleSave() {
    if (grossA === "" || handicapA === "" || pointsA === "" || grossB === "" || handicapB === "" || pointsB === "") {
      setError("All fields are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await updateMatchup(slug, {
        matchupId: matchup.id,
        teamAGross: grossA,
        teamAHandicap: handicapA,
        teamAPoints: pointsA,
        teamAIsSub: subA,
        teamBGross: grossB,
        teamBHandicap: handicapB,
        teamBPoints: pointsB,
        teamBIsSub: subB,
      });
      if (result.success) {
        onSaved();
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("handleSave error:", err);
      setError("Failed to save. Please try again.");
    }
    setSaving(false);
  }

  const pointsTotal = (pointsA !== "" && pointsB !== "") ? Number(pointsA) + Number(pointsB) : null;

  return (
    <tr>
      <td colSpan={6} className="p-0">
        <div className="bg-info-bg border border-info-border rounded-lg m-2 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display font-semibold uppercase tracking-wider text-sm text-text-primary">
              Edit Matchup — Week {matchup.weekNumber}
            </h3>
            <button
              onClick={onCancel}
              className="text-sm font-display font-medium uppercase tracking-wider text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-error-bg border border-error-border rounded-lg text-sm font-sans text-error-text">
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Team A */}
            <div className="space-y-3 p-3 bg-surface rounded-lg border border-border">
              <h4 className="font-display font-semibold uppercase tracking-wider text-sm text-fairway">
                {matchup.teamA.name}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Gross</label>
                  <input
                    type="number"
                    value={grossA}
                    onChange={(e) => setGrossA(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full pencil-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Handicap</label>
                  <input
                    type="number"
                    step="0.1"
                    value={handicapA}
                    onChange={(e) => setHandicapA(e.target.value ? parseFloat(e.target.value) : "")}
                    className="w-full pencil-input text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-sans text-text-secondary">
                  Net: <span className="font-mono tabular-nums font-semibold text-text-primary">{netA !== null ? netA.toFixed(1) : "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`editSubA-${matchup.id}`}
                    checked={subA}
                    onChange={(e) => setSubA(e.target.checked)}
                    className="w-3.5 h-3.5 text-fairway accent-fairway"
                  />
                  <label htmlFor={`editSubA-${matchup.id}`} className="text-xs font-sans text-text-secondary">Sub</label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Points</label>
                <input
                  type="number"
                  step="0.5"
                  value={pointsA}
                  onChange={(e) => setPointsA(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full pencil-input text-sm"
                />
              </div>
            </div>

            {/* Team B */}
            <div className="space-y-3 p-3 bg-surface rounded-lg border border-border">
              <h4 className="font-display font-semibold uppercase tracking-wider text-sm text-fairway">
                {matchup.teamB.name}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Gross</label>
                  <input
                    type="number"
                    value={grossB}
                    onChange={(e) => setGrossB(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full pencil-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Handicap</label>
                  <input
                    type="number"
                    step="0.1"
                    value={handicapB}
                    onChange={(e) => setHandicapB(e.target.value ? parseFloat(e.target.value) : "")}
                    className="w-full pencil-input text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-sans text-text-secondary">
                  Net: <span className="font-mono tabular-nums font-semibold text-text-primary">{netB !== null ? netB.toFixed(1) : "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`editSubB-${matchup.id}`}
                    checked={subB}
                    onChange={(e) => setSubB(e.target.checked)}
                    className="w-3.5 h-3.5 text-fairway accent-fairway"
                  />
                  <label htmlFor={`editSubB-${matchup.id}`} className="text-xs font-sans text-text-secondary">Sub</label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Points</label>
                <input
                  type="number"
                  step="0.5"
                  value={pointsB}
                  onChange={(e) => setPointsB(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full pencil-input text-sm"
                />
              </div>
            </div>
          </div>

          {/* Points total & recalculate */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={handleRecalculatePoints}
              disabled={netA === null || netB === null}
              className="text-sm font-sans text-info-text hover:underline disabled:opacity-50 disabled:no-underline"
            >
              Recalculate points from net scores
            </button>
            {pointsTotal !== null && (
              <span className={`text-sm font-mono tabular-nums ${pointsTotal === 20 ? "text-fairway" : "text-error-text"}`}>
                Total: {pointsTotal} / 20
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2 bg-bunker/20 text-text-primary font-display font-semibold uppercase tracking-wider text-sm rounded-lg hover:bg-bunker/30"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || grossA === "" || grossB === "" || handicapA === "" || handicapB === "" || pointsA === "" || pointsB === ""}
              className="flex-1 py-2 bg-fairway text-white font-display font-semibold uppercase tracking-wider text-sm rounded-lg hover:bg-rough disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
