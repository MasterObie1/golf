"use client";

import { useState } from "react";
import {
  updateLeagueSettings,
  updateHandicapSettings,
  changeLeaguePassword,
  getLeagueBySlug,
  getMatchupHistory,
  getTeams,
} from "@/lib/actions";

interface League {
  id: number;
  slug: string;
  maxTeams: number;
  registrationOpen: boolean;
  handicapBaseScore: number;
  handicapMultiplier: number;
  handicapRounding: string;
  handicapDefault: number;
  handicapMax: number | null;
  handicapMin: number | null;
  handicapScoreSelection: string;
  handicapScoreCount: number | null;
  handicapBestOf: number | null;
  handicapLastOf: number | null;
  handicapDropHighest: number;
  handicapDropLowest: number;
  handicapUseWeighting: boolean;
  handicapWeightRecent: number;
  handicapWeightDecay: number;
  handicapCapExceptional: boolean;
  handicapExceptionalCap: number | null;
  handicapProvWeeks: number;
  handicapProvMultiplier: number;
  handicapFreezeWeek: number | null;
  handicapUseTrend: boolean;
  handicapTrendWeight: number;
  handicapRequireApproval: boolean;
}

interface SettingsTabProps {
  slug: string;
  league: League;
  approvedTeamsCount: number;
  onDataRefresh: (data: { league?: unknown; matchups?: unknown; teams?: unknown }) => void;
}

export default function SettingsTab({ slug, league, approvedTeamsCount, onDataRefresh }: SettingsTabProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Basic settings
  const [maxTeamsInput, setMaxTeamsInput] = useState(league.maxTeams);
  const [registrationOpenInput, setRegistrationOpenInput] = useState(league.registrationOpen);

  // Handicap settings - Basic Formula
  const [handicapBaseScore, setHandicapBaseScore] = useState(league.handicapBaseScore);
  const [handicapMultiplier, setHandicapMultiplier] = useState(league.handicapMultiplier);
  const [handicapRounding, setHandicapRounding] = useState<"floor" | "round" | "ceil">(league.handicapRounding as "floor" | "round" | "ceil");
  const [handicapDefault, setHandicapDefault] = useState(league.handicapDefault);
  const [handicapMax, setHandicapMax] = useState<number | "">(league.handicapMax ?? "");
  const [handicapMin, setHandicapMin] = useState<number | "">(league.handicapMin ?? "");

  // Score Selection
  const [handicapScoreSelection, setHandicapScoreSelection] = useState<"all" | "last_n" | "best_of_last">((league.handicapScoreSelection || "all") as "all" | "last_n" | "best_of_last");
  const [handicapScoreCount, setHandicapScoreCount] = useState<number | "">(league.handicapScoreCount ?? "");
  const [handicapBestOf, setHandicapBestOf] = useState<number | "">(league.handicapBestOf ?? "");
  const [handicapLastOf, setHandicapLastOf] = useState<number | "">(league.handicapLastOf ?? "");
  const [handicapDropHighest, setHandicapDropHighest] = useState(league.handicapDropHighest || 0);
  const [handicapDropLowest, setHandicapDropLowest] = useState(league.handicapDropLowest || 0);

  // Score Weighting
  const [handicapUseWeighting, setHandicapUseWeighting] = useState(league.handicapUseWeighting || false);
  const [handicapWeightRecent, setHandicapWeightRecent] = useState(league.handicapWeightRecent || 1.5);
  const [handicapWeightDecay, setHandicapWeightDecay] = useState(league.handicapWeightDecay || 0.9);

  // Exceptional Score Handling
  const [handicapCapExceptional, setHandicapCapExceptional] = useState(league.handicapCapExceptional || false);
  const [handicapExceptionalCap, setHandicapExceptionalCap] = useState<number | "">(league.handicapExceptionalCap ?? "");

  // Time-Based Rules
  const [handicapProvWeeks, setHandicapProvWeeks] = useState(league.handicapProvWeeks || 0);
  const [handicapProvMultiplier, setHandicapProvMultiplier] = useState(league.handicapProvMultiplier || 1.0);
  const [handicapFreezeWeek, setHandicapFreezeWeek] = useState<number | "">(league.handicapFreezeWeek ?? "");
  const [handicapUseTrend, setHandicapUseTrend] = useState(league.handicapUseTrend || false);
  const [handicapTrendWeight, setHandicapTrendWeight] = useState(league.handicapTrendWeight || 0.1);

  // Administrative
  const [handicapRequireApproval, setHandicapRequireApproval] = useState(league.handicapRequireApproval || false);

  // Preview and UI
  const [handicapPreviewAvg, setHandicapPreviewAvg] = useState(42);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["basic"]));

  function calculatePreviewHandicap(avg: number): number {
    const rawHandicap = (avg - handicapBaseScore) * handicapMultiplier;
    let result: number;
    switch (handicapRounding) {
      case "floor": result = Math.floor(rawHandicap); break;
      case "ceil": result = Math.ceil(rawHandicap); break;
      case "round": result = Math.round(rawHandicap); break;
      default: result = Math.floor(rawHandicap);
    }
    if (handicapMax !== "" && result > handicapMax) result = handicapMax;
    if (handicapMin !== "" && result < handicapMin) result = handicapMin;
    return result;
  }

  function toggleSection(section: string) {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) newSet.delete(section);
      else newSet.add(section);
      return newSet;
    });
  }

  function applyPreset(presetName: string) {
    setSelectedPreset(presetName);
    switch (presetName) {
      case "simple":
        setHandicapScoreSelection("all");
        setHandicapDropHighest(0);
        setHandicapDropLowest(0);
        setHandicapUseWeighting(false);
        break;
      case "usga_style":
        setHandicapScoreSelection("best_of_last");
        setHandicapBestOf(4);
        setHandicapLastOf(8);
        setHandicapMultiplier(0.96);
        setHandicapUseWeighting(false);
        break;
      case "forgiving":
        setHandicapScoreSelection("last_n");
        setHandicapScoreCount(5);
        setHandicapDropHighest(1);
        setHandicapDropLowest(0);
        setHandicapUseWeighting(false);
        break;
      case "competitive":
        setHandicapScoreSelection("all");
        setHandicapDropHighest(0);
        setHandicapDropLowest(0);
        setHandicapUseWeighting(true);
        setHandicapWeightRecent(1.3);
        setHandicapWeightDecay(0.95);
        break;
      case "strict":
        setHandicapScoreSelection("all");
        setHandicapMax(18);
        setHandicapCapExceptional(true);
        setHandicapExceptionalCap(50);
        setHandicapUseTrend(true);
        setHandicapTrendWeight(0.15);
        break;
    }
  }

  async function handleSaveSettings() {
    setLoading(true);
    try {
      await updateLeagueSettings(slug, maxTeamsInput, registrationOpenInput);
      const leagueData = await getLeagueBySlug(slug);
      onDataRefresh({ league: leagueData });
      setMessage({ type: "success", text: "Settings saved successfully!" });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings." });
    }
    setLoading(false);
  }

  async function handleSaveHandicapSettings() {
    setLoading(true);
    try {
      await updateHandicapSettings(slug, {
        baseScore: handicapBaseScore,
        multiplier: handicapMultiplier,
        rounding: handicapRounding,
        defaultHandicap: handicapDefault,
        maxHandicap: handicapMax === "" ? null : handicapMax,
        minHandicap: handicapMin === "" ? null : handicapMin,
        scoreSelection: handicapScoreSelection,
        scoreCount: handicapScoreCount === "" ? null : handicapScoreCount,
        bestOf: handicapBestOf === "" ? null : handicapBestOf,
        lastOf: handicapLastOf === "" ? null : handicapLastOf,
        dropHighest: handicapDropHighest,
        dropLowest: handicapDropLowest,
        useWeighting: handicapUseWeighting,
        weightRecent: handicapWeightRecent,
        weightDecay: handicapWeightDecay,
        capExceptional: handicapCapExceptional,
        exceptionalCap: handicapExceptionalCap === "" ? null : handicapExceptionalCap,
        provWeeks: handicapProvWeeks,
        provMultiplier: handicapProvMultiplier,
        freezeWeek: handicapFreezeWeek === "" ? null : handicapFreezeWeek,
        useTrend: handicapUseTrend,
        trendWeight: handicapTrendWeight,
        requireApproval: handicapRequireApproval,
      });
      const [leagueData, matchupsData, teamsData] = await Promise.all([
        getLeagueBySlug(slug),
        getMatchupHistory(league.id),
        getTeams(league.id),
      ]);
      onDataRefresh({ league: leagueData, matchups: matchupsData, teams: teamsData });
      setMessage({ type: "success", text: "Handicap formula saved and all stats recalculated!" });
    } catch (error) {
      console.error("Handicap settings error:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save handicap settings." });
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.type === "success" ? "bg-green-100 text-green-800 border border-green-200" : "bg-red-100 text-red-800 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-6 text-gray-800">League Settings</h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Number of Teams</label>
          <input type="number" value={maxTeamsInput} onChange={(e) => setMaxTeamsInput(parseInt(e.target.value) || 1)} min={1} className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          <p className="mt-1 text-sm text-gray-500">Currently {approvedTeamsCount} approved team(s)</p>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={registrationOpenInput} onChange={(e) => setRegistrationOpenInput(e.target.checked)} className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500" />
            <span className="text-gray-800 font-medium">Registration Open</span>
          </label>
        </div>

        <button onClick={handleSaveSettings} disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {loading ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Password Change Section */}
      <div className="mt-8 pt-8 border-t">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Change Admin Password</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const currentPw = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
            const newPw = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
            const confirmPw = (form.elements.namedItem("confirmNewPassword") as HTMLInputElement).value;
            if (newPw !== confirmPw) { setMessage({ type: "error", text: "New passwords do not match" }); return; }
            if (newPw.length < 8) { setMessage({ type: "error", text: "New password must be at least 8 characters" }); return; }
            try {
              await changeLeaguePassword(slug, currentPw, newPw);
              setMessage({ type: "success", text: "Password changed successfully" });
              form.reset();
            } catch (error) {
              setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to change password" });
            }
          }}
          className="space-y-4 max-w-md"
        >
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" name="currentPassword" id="currentPassword" required minLength={1} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" name="newPassword" id="newPassword" required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type="password" name="confirmNewPassword" id="confirmNewPassword" required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <button type="submit" className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700">Change Password</button>
        </form>
      </div>

      {/* Handicap Formula */}
      <div className="mt-8 pt-8 border-t">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Handicap Configuration</h3>

        {/* Preset Templates */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Quick Presets</label>
          <div className="flex flex-wrap gap-2">
            {[
              { name: "simple", label: "Simple Average", desc: "Basic formula using all scores" },
              { name: "usga_style", label: "USGA-Inspired", desc: "Best 4 of last 8, like official handicaps" },
              { name: "forgiving", label: "Forgiving", desc: "Drops worst scores, uses recent rounds" },
              { name: "competitive", label: "Competitive", desc: "80% handicap, slight edge to better players" },
              { name: "strict", label: "Strict", desc: "Caps and trend adjustment to prevent sandbagging" },
              { name: "custom", label: "Custom", desc: "Full control over all settings" },
            ].map(preset => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset.name)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${selectedPreset === preset.name ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-300 hover:border-green-500"}`}
                title={preset.desc}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Basic Formula Section */}
        <div className="mb-4 border rounded-lg overflow-hidden">
          <button onClick={() => toggleSection("basic")} className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100">
            <span>Basic Formula</span>
            <span className="text-gray-500">{expandedSections.has("basic") ? "\u2212" : "+"}</span>
          </button>
          {expandedSections.has("basic") && (
            <div className="p-4 border-t">
              <p className="text-sm text-gray-500 mb-4">Formula: (Average Score - Base Score) x Multiplier</p>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Score (Par)</label>
                  <input type="number" value={handicapBaseScore} onChange={(e) => { setHandicapBaseScore(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Multiplier</label>
                  <input type="number" value={handicapMultiplier} onChange={(e) => { setHandicapMultiplier(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }} step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rounding</label>
                  <select value={handicapRounding} onChange={(e) => { setHandicapRounding(e.target.value as "floor" | "round" | "ceil"); setSelectedPreset("custom"); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                    <option value="floor">Floor (round down)</option>
                    <option value="round">Round (nearest)</option>
                    <option value="ceil">Ceiling (round up)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Handicap</label>
                  <input type="number" value={handicapDefault} onChange={(e) => { setHandicapDefault(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">When no scores available</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Handicap</label>
                  <input type="number" value={handicapMax} onChange={(e) => { setHandicapMax(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="No limit" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Handicap</label>
                  <input type="number" value={handicapMin} onChange={(e) => { setHandicapMin(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="No limit" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">For scratch golfers</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Score Selection Section */}
        <div className="mb-4 border rounded-lg overflow-hidden">
          <button onClick={() => toggleSection("selection")} className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100">
            <span>Score Selection</span>
            <span className="text-gray-500">{expandedSections.has("selection") ? "\u2212" : "+"}</span>
          </button>
          {expandedSections.has("selection") && (
            <div className="p-4 border-t">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selection Method</label>
                  <select value={handicapScoreSelection} onChange={(e) => { setHandicapScoreSelection(e.target.value as "all" | "last_n" | "best_of_last"); setSelectedPreset("custom"); }} className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                    <option value="all">Use All Scores</option>
                    <option value="last_n">Use Last N Scores</option>
                    <option value="best_of_last">Best X of Last Y Scores</option>
                  </select>
                </div>
                {handicapScoreSelection === "last_n" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Recent Scores</label>
                    <input type="number" value={handicapScoreCount} onChange={(e) => { setHandicapScoreCount(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} min="1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  </div>
                )}
                {handicapScoreSelection === "best_of_last" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Use Best</label>
                      <input type="number" value={handicapBestOf} onChange={(e) => { setHandicapBestOf(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} min="1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                      <p className="text-xs text-gray-500 mt-1">Best X scores</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Of Last</label>
                      <input type="number" value={handicapLastOf} onChange={(e) => { setHandicapLastOf(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} min="1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                      <p className="text-xs text-gray-500 mt-1">From last Y rounds</p>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Drop Highest Scores</label>
                  <input type="number" value={handicapDropHighest} onChange={(e) => { setHandicapDropHighest(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }} min="0" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">Remove worst rounds</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Drop Lowest Scores</label>
                  <input type="number" value={handicapDropLowest} onChange={(e) => { setHandicapDropLowest(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }} min="0" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">Remove best rounds</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Score Weighting Section */}
        <div className="mb-4 border rounded-lg overflow-hidden">
          <button onClick={() => toggleSection("weighting")} className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100">
            <span>Score Weighting</span>
            <span className="text-gray-500">{expandedSections.has("weighting") ? "\u2212" : "+"}</span>
          </button>
          {expandedSections.has("weighting") && (
            <div className="p-4 border-t">
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={handicapUseWeighting} onChange={(e) => { setHandicapUseWeighting(e.target.checked); setSelectedPreset("custom"); }} className="w-4 h-4 text-green-600 rounded" />
                  <span className="text-sm font-medium text-gray-700">Enable Recency Weighting</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">Recent scores count more towards handicap</p>
              </div>
              {handicapUseWeighting && (
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recent Score Weight</label>
                    <input type="number" value={handicapWeightRecent} onChange={(e) => { setHandicapWeightRecent(parseFloat(e.target.value) || 1); setSelectedPreset("custom"); }} step="0.1" min="1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                    <p className="text-xs text-gray-500 mt-1">Weight for most recent (1.0 = no boost)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Decay Factor</label>
                    <input type="number" value={handicapWeightDecay} onChange={(e) => { setHandicapWeightDecay(parseFloat(e.target.value) || 0.9); setSelectedPreset("custom"); }} step="0.05" min="0.1" max="1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                    <p className="text-xs text-gray-500 mt-1">Each older score x this factor</p>
                  </div>
                </div>
              )}
              <div className="mt-4 pt-4 border-t">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={handicapCapExceptional} onChange={(e) => { setHandicapCapExceptional(e.target.checked); setSelectedPreset("custom"); }} className="w-4 h-4 text-green-600 rounded" />
                  <span className="text-sm font-medium text-gray-700">Cap Exceptional Scores</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">Limit very high scores before averaging</p>
              </div>
              {handicapCapExceptional && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Score Value</label>
                  <input type="number" value={handicapExceptionalCap} onChange={(e) => { setHandicapExceptionalCap(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="e.g., 50" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">Scores above this are reduced to this value</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Time-Based Rules Section */}
        <div className="mb-4 border rounded-lg overflow-hidden">
          <button onClick={() => toggleSection("timebased")} className="w-full px-4 py-3 bg-gray-50 text-left font-medium text-gray-800 flex justify-between items-center hover:bg-gray-100">
            <span>Time-Based Rules</span>
            <span className="text-gray-500">{expandedSections.has("timebased") ? "\u2212" : "+"}</span>
          </button>
          {expandedSections.has("timebased") && (
            <div className="p-4 border-t">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provisional Period (Weeks)</label>
                  <input type="number" value={handicapProvWeeks} onChange={(e) => { setHandicapProvWeeks(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }} min="0" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">0 = disabled</p>
                </div>
                {handicapProvWeeks > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provisional Multiplier</label>
                    <input type="number" value={handicapProvMultiplier} onChange={(e) => { setHandicapProvMultiplier(parseFloat(e.target.value) || 1); setSelectedPreset("custom"); }} step="0.1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                    <p className="text-xs text-gray-500 mt-1">Multiply handicap by this during provisional</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Freeze Handicaps After Week</label>
                  <input type="number" value={handicapFreezeWeek} onChange={(e) => { setHandicapFreezeWeek(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="Never" min="1" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">Lock handicaps for playoffs</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={handicapUseTrend} onChange={(e) => { setHandicapUseTrend(e.target.checked); setSelectedPreset("custom"); }} className="w-4 h-4 text-green-600 rounded" />
                  <span className="text-sm font-medium text-gray-700">Enable Trend Adjustment</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">Adjust handicap based on improvement/decline trend</p>
              </div>
              {handicapUseTrend && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trend Weight</label>
                  <input type="number" value={handicapTrendWeight} onChange={(e) => { setHandicapTrendWeight(parseFloat(e.target.value) || 0.1); setSelectedPreset("custom"); }} step="0.05" min="0" max="0.5" className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-500 mt-1">How much to factor in trend (0.1 = 10%)</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview Calculator */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Preview Calculator</h4>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Test Average Score</label>
              <input type="number" value={handicapPreviewAvg} onChange={(e) => setHandicapPreviewAvg(parseFloat(e.target.value) || 0)} className="w-24 px-3 py-1.5 border border-gray-300 rounded" />
            </div>
            <div className="text-gray-400">=</div>
            <div className="bg-white px-4 py-2 rounded-lg border border-green-200">
              <span className="text-xs text-gray-500">Applied Handicap: </span>
              <span className="text-lg font-bold text-green-700">{calculatePreviewHandicap(handicapPreviewAvg)}</span>
              {handicapMax !== "" && calculatePreviewHandicap(handicapPreviewAvg) >= handicapMax && <span className="ml-2 text-xs text-orange-600 font-medium">(max capped)</span>}
              {handicapMin !== "" && calculatePreviewHandicap(handicapPreviewAvg) <= handicapMin && <span className="ml-2 text-xs text-blue-600 font-medium">(min capped)</span>}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Formula: ({handicapPreviewAvg} - {handicapBaseScore}) x {handicapMultiplier} = {((handicapPreviewAvg - handicapBaseScore) * handicapMultiplier).toFixed(2)}
          </p>
        </div>

        <button onClick={handleSaveHandicapSettings} disabled={loading} className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {loading ? "Saving..." : "Save Handicap Settings"}
        </button>
      </div>
    </div>
  );
}
