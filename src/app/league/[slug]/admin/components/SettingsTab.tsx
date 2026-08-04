"use client";

import { useState, useMemo } from "react";
import {
  updateLeagueSettings,
  updateHandicapSettings,
  updateScorecardSettings,
  recalculateAllMatchups,
} from "@/lib/actions/league-settings";
import { changeLeaguePassword, getLeagueBySlug } from "@/lib/actions/leagues";
import { getMatchupHistory } from "@/lib/actions/matchups";
import { getTeams } from "@/lib/actions/teams";
import {
  updateScoringConfig,
  updateScheduleConfig,
  type ScoringConfigInput,
  type ScheduleConfigInput,
} from "@/lib/actions/scoring-config";
import { generatePointScale, getPointScalePresets } from "@/lib/scoring-utils";
import { DEFAULT_HANDICAP_SETTINGS, HANDICAP_PRESETS } from "@/lib/handicap";
import type { AdminLeague } from "@/lib/types/admin";
import { notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/composite";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const accordionItemClass =
  "mb-4 overflow-hidden rounded-lg border border-scorecard-line/50 last:border-b";
const accordionTriggerClass =
  "items-center rounded-none bg-surface px-4 py-3 font-display text-base font-medium uppercase tracking-wider text-scorecard-pencil transition-colors hover:bg-bunker/20 hover:no-underline";
const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground";
const checkboxClass = "w-4 h-4 accent-[var(--color-primary)]";

interface SettingsTabProps {
  slug: string;
  league: AdminLeague;
  approvedTeamsCount: number;
  hasSeasonData: boolean;
  onDataRefresh: (data: { league?: unknown; matchups?: unknown; teams?: unknown }) => void;
}

export default function SettingsTab({ slug, league, approvedTeamsCount, hasSeasonData, onDataRefresh }: SettingsTabProps) {
  const [loadingSection, setLoadingSection] = useState<string | null>(null);

  // Basic settings
  const [maxTeamsInput, setMaxTeamsInput] = useState(league.maxTeams);
  const [registrationOpenInput, setRegistrationOpenInput] = useState(league.registrationOpen);

  // Handicap settings - Basic Formula
  const [handicapBaseScore, setHandicapBaseScore] = useState(league.handicapBaseScore);
  const [handicapMultiplier, setHandicapMultiplier] = useState(league.handicapMultiplier);
  const [handicapUnderParMultiplier, setHandicapUnderParMultiplier] = useState<number | "">(league.handicapUnderParMultiplier ?? "");
  const [handicapUnderParCap, setHandicapUnderParCap] = useState<number | "">(league.handicapUnderParCap ?? "");
  const [handicapRounding, setHandicapRounding] = useState<"floor" | "round" | "ceil">(league.handicapRounding as "floor" | "round" | "ceil");
  const [handicapDefault, setHandicapDefault] = useState(league.handicapDefault);
  const [handicapMax, setHandicapMax] = useState<number | "">(league.handicapMax ?? "");
  const [handicapMin, setHandicapMin] = useState<number | "">(league.handicapMin ?? "");

  // Score Selection
  const [handicapScoreSelection, setHandicapScoreSelection] = useState<"all" | "last_n" | "best_of_last">((league.handicapScoreSelection ?? "all") as "all" | "last_n" | "best_of_last");
  const [handicapScoreCount, setHandicapScoreCount] = useState<number | "">(league.handicapScoreCount ?? "");
  const [handicapBestOf, setHandicapBestOf] = useState<number | "">(league.handicapBestOf ?? "");
  const [handicapLastOf, setHandicapLastOf] = useState<number | "">(league.handicapLastOf ?? "");
  const [handicapDropHighest, setHandicapDropHighest] = useState(league.handicapDropHighest ?? 0);
  const [handicapDropLowest, setHandicapDropLowest] = useState(league.handicapDropLowest ?? 0);

  // Score Weighting
  const [handicapUseWeighting, setHandicapUseWeighting] = useState(league.handicapUseWeighting ?? false);
  const [handicapWeightRecent, setHandicapWeightRecent] = useState(league.handicapWeightRecent ?? 1.5);
  const [handicapWeightDecay, setHandicapWeightDecay] = useState(league.handicapWeightDecay ?? 0.9);

  // Exceptional Score Handling
  const [handicapCapExceptional, setHandicapCapExceptional] = useState(league.handicapCapExceptional ?? false);
  const [handicapExceptionalCap, setHandicapExceptionalCap] = useState<number | "">(league.handicapExceptionalCap ?? "");

  // Time-Based Rules
  const [handicapProvWeeks, setHandicapProvWeeks] = useState(league.handicapProvWeeks ?? 0);
  const [handicapProvMultiplier, setHandicapProvMultiplier] = useState(league.handicapProvMultiplier ?? 1.0);
  const [handicapFreezeWeek, setHandicapFreezeWeek] = useState<number | "">(league.handicapFreezeWeek ?? "");
  const [handicapUseTrend, setHandicapUseTrend] = useState(league.handicapUseTrend ?? false);
  const [handicapTrendWeight, setHandicapTrendWeight] = useState(league.handicapTrendWeight ?? 0.1);

  // Administrative
  const [handicapRequireApproval, setHandicapRequireApproval] = useState(league.handicapRequireApproval ?? false);

  // Scoring config
  const [scoringType, setScoringType] = useState(league.scoringType);
  // Detect corrupt JSON config on mount (#17)
  const parseWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (league.strokePlayPointScale) {
      try { JSON.parse(league.strokePlayPointScale); }
      catch { warnings.push("point scale"); }
    }
    if (league.hybridFieldPointScale) {
      try { JSON.parse(league.hybridFieldPointScale); }
      catch { warnings.push("hybrid field point scale"); }
    }
    return warnings;
  }, [league.strokePlayPointScale, league.hybridFieldPointScale]);

  const [strokePlayPointPreset, setStrokePlayPointPreset] = useState(league.strokePlayPointPreset ?? "linear");
  const [strokePlayPointScale, setStrokePlayPointScale] = useState<number[]>(() => {
    if (league.strokePlayPointScale) {
      try { return JSON.parse(league.strokePlayPointScale) as number[]; }
      catch (error) { console.error("Failed to parse strokePlayPointScale:", error); }
    }
    return generatePointScale("linear", approvedTeamsCount);
  });
  const [strokePlayBonusShow, setStrokePlayBonusShow] = useState(league.strokePlayBonusShow);
  const [strokePlayBonusBeat, setStrokePlayBonusBeat] = useState(league.strokePlayBonusBeat);
  const [strokePlayDnpPoints, setStrokePlayDnpPoints] = useState(league.strokePlayDnpPoints);
  const [strokePlayTieMode, setStrokePlayTieMode] = useState(league.strokePlayTieMode ?? "split");
  const [strokePlayDnpPenalty, setStrokePlayDnpPenalty] = useState(league.strokePlayDnpPenalty);
  const [strokePlayMaxDnp, setStrokePlayMaxDnp] = useState<number | "">(league.strokePlayMaxDnp ?? "");
  const [strokePlayProRate, setStrokePlayProRate] = useState(league.strokePlayProRate);
  const [hybridFieldWeight, setHybridFieldWeight] = useState(league.hybridFieldWeight);
  const [hybridFieldPointScale, _setHybridFieldPointScale] = useState<number[]>(() => {
    if (league.hybridFieldPointScale) {
      try { return JSON.parse(league.hybridFieldPointScale) as number[]; }
      catch (error) { console.error("Failed to parse hybridFieldPointScale:", error); }
    }
    return generatePointScale("linear", approvedTeamsCount);
  });

  // Play mode
  const [playMode, setPlayMode] = useState(league.playMode ?? "full_18");
  const [playModeFirstWeekSide, setPlayModeFirstWeekSide] = useState(league.playModeFirstWeekSide ?? "front");

  // Schedule config
  const [scheduleVisibility, setScheduleVisibility] = useState(league.scheduleVisibility ?? "full");
  const [byePointsMode, setByePointsMode] = useState(league.byePointsMode ?? "flat");
  const [byePointsFlat, setByePointsFlat] = useState(league.byePointsFlat);
  const [scheduleExtraWeeks, setScheduleExtraWeeks] = useState(league.scheduleExtraWeeks ?? "flex");
  const [midSeasonAddDefault, setMidSeasonAddDefault] = useState(league.midSeasonAddDefault ?? "start_from_here");
  const [midSeasonRemoveAction, setMidSeasonRemoveAction] = useState(league.midSeasonRemoveAction ?? "bye_opponents");
  const [playoffWeeks, setPlayoffWeeks] = useState(league.playoffWeeks);
  const [playoffTeams, setPlayoffTeams] = useState(league.playoffTeams);
  const [playoffFormat, setPlayoffFormat] = useState(league.playoffFormat ?? "single_elimination");

  // Scorecard settings
  const [scorecardMode, setScorecardMode] = useState(league.scorecardMode ?? "disabled");
  const [scorecardRequireApproval, setScorecardRequireApproval] = useState(league.scorecardRequireApproval);

  // Preview and UI
  const [handicapPreviewAvg, setHandicapPreviewAvg] = useState(42);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");

  // H5: Re-sync handicap-related state when parent passes updated league data (render-time adjustment)
  const [syncedLeague, setSyncedLeague] = useState(league);
  if (syncedLeague !== league) {
    setSyncedLeague(league);
    setHandicapBaseScore(league.handicapBaseScore);
    setHandicapMultiplier(league.handicapMultiplier);
    setHandicapUnderParMultiplier(league.handicapUnderParMultiplier ?? "");
    setHandicapUnderParCap(league.handicapUnderParCap ?? "");
    setHandicapRounding((league.handicapRounding ?? "floor") as "floor" | "round" | "ceil");
    setHandicapDefault(league.handicapDefault);
    setHandicapMax(league.handicapMax ?? "");
    setHandicapMin(league.handicapMin ?? "");
    setHandicapScoreSelection((league.handicapScoreSelection ?? "all") as "all" | "last_n" | "best_of_last");
    setHandicapScoreCount(league.handicapScoreCount ?? "");
    setHandicapBestOf(league.handicapBestOf ?? "");
    setHandicapLastOf(league.handicapLastOf ?? "");
    setHandicapDropHighest(league.handicapDropHighest ?? 0);
    setHandicapDropLowest(league.handicapDropLowest ?? 0);
    setHandicapUseWeighting(league.handicapUseWeighting ?? false);
    setHandicapWeightRecent(league.handicapWeightRecent ?? 1.5);
    setHandicapWeightDecay(league.handicapWeightDecay ?? 0.9);
    setHandicapCapExceptional(league.handicapCapExceptional ?? false);
    setHandicapExceptionalCap(league.handicapExceptionalCap ?? "");
    setHandicapProvWeeks(league.handicapProvWeeks ?? 0);
    setHandicapProvMultiplier(league.handicapProvMultiplier ?? 1.0);
    setHandicapFreezeWeek(league.handicapFreezeWeek ?? "");
    setHandicapUseTrend(league.handicapUseTrend ?? false);
    setHandicapTrendWeight(league.handicapTrendWeight ?? 0.1);
    setHandicapRequireApproval(league.handicapRequireApproval ?? false);
  }

  function calculatePreviewHandicap(avg: number): number {
    const isUnderPar = avg <= handicapBaseScore;
    const effectiveMultiplier =
      isUnderPar && handicapUnderParMultiplier !== "" ? handicapUnderParMultiplier : handicapMultiplier;
    const rawHandicap = (avg - handicapBaseScore) * effectiveMultiplier;
    let result: number;
    switch (handicapRounding) {
      case "floor": result = Math.floor(rawHandicap); break;
      case "ceil": result = Math.ceil(rawHandicap); break;
      case "round": result = Math.round(rawHandicap); break;
      default: result = Math.floor(rawHandicap);
    }
    if (isUnderPar && handicapUnderParCap !== "" && result > handicapUnderParCap) {
      result = handicapUnderParCap;
    }
    if (handicapMax !== "" && result > handicapMax) result = handicapMax;
    if (handicapMin !== "" && result < handicapMin) result = handicapMin;
    return result;
  }

  function applyPreset(presetName: string) {
    setSelectedPreset(presetName);
    if (presetName === "custom") return;

    const preset = HANDICAP_PRESETS.find(p => p.name === presetName);
    if (!preset) return;

    // Reset all fields to defaults, then apply preset overrides
    const merged = { ...DEFAULT_HANDICAP_SETTINGS, ...preset.settings };

    setHandicapBaseScore(merged.baseScore);
    setHandicapMultiplier(merged.multiplier);
    setHandicapUnderParMultiplier(merged.underParMultiplier ?? "");
    setHandicapUnderParCap(merged.underParCap ?? "");
    setHandicapRounding(merged.rounding);
    setHandicapDefault(merged.defaultHandicap);
    setHandicapMax(merged.maxHandicap ?? "");
    setHandicapMin(merged.minHandicap ?? "");
    setHandicapScoreSelection(merged.scoreSelection);
    setHandicapScoreCount(merged.scoreCount ?? "");
    setHandicapBestOf(merged.bestOf ?? "");
    setHandicapLastOf(merged.lastOf ?? "");
    setHandicapDropHighest(merged.dropHighest);
    setHandicapDropLowest(merged.dropLowest);
    setHandicapUseWeighting(merged.useWeighting);
    setHandicapWeightRecent(merged.weightRecent);
    setHandicapWeightDecay(merged.weightDecay);
    setHandicapCapExceptional(merged.capExceptional);
    setHandicapExceptionalCap(merged.exceptionalCap ?? "");
    setHandicapProvWeeks(merged.provWeeks);
    setHandicapProvMultiplier(merged.provMultiplier);
    setHandicapFreezeWeek(merged.freezeWeek ?? "");
    setHandicapUseTrend(merged.useTrend);
    setHandicapTrendWeight(merged.trendWeight);
    setHandicapRequireApproval(merged.requireApproval);
  }

  const handicapHasErrors =
    (handicapScoreSelection === "best_of_last" && (handicapBestOf === "" || handicapLastOf === "")) ||
    (handicapScoreSelection === "best_of_last" && typeof handicapBestOf === "number" && typeof handicapLastOf === "number" && handicapBestOf > handicapLastOf) ||
    (handicapScoreSelection === "last_n" && handicapScoreCount === "");

  async function handleSaveSettings() {
    setLoadingSection("basic");
    try {
      const result = await updateLeagueSettings(slug, maxTeamsInput, registrationOpenInput);
      if (!result.success) {
        notify.error(result.error);
        setLoadingSection(null);
        return;
      }
      const leagueData = await getLeagueBySlug(slug);
      onDataRefresh({ league: leagueData });
      notify.success("Settings saved successfully!");
    } catch (error) {
      console.error("handleSaveSettings error:", error);
      notify.error("Failed to save settings.");
    }
    setLoadingSection(null);
  }

  async function handleSaveHandicapSettings() {
    // Blank numeric inputs coerce to 0; a 0 multiplier would zero every handicap
    // on recalc and a 0 base score would explode them. Block the save instead.
    if (!isFinite(handicapMultiplier) || handicapMultiplier <= 0) {
      notify.error("Multiplier must be greater than 0.");
      return;
    }
    if (!isFinite(handicapBaseScore) || handicapBaseScore <= 0) {
      notify.error("Base score must be greater than 0.");
      return;
    }
    setLoadingSection("handicap");
    try {
      // Convert empty string placeholders to null for server.
      // State uses `number | ""` so empty inputs render as blank rather than 0.
      // The `=== "" ? null : value` pattern ensures the server receives
      // `number | null` instead of `number | ""`.
      const result = await updateHandicapSettings(slug, {
        baseScore: handicapBaseScore,
        multiplier: handicapMultiplier,
        underParMultiplier: handicapUnderParMultiplier === "" ? null : handicapUnderParMultiplier,
        underParCap: handicapUnderParCap === "" ? null : handicapUnderParCap,
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
      if (!result.success) {
        notify.error(result.error);
        setLoadingSection(null);
        return;
      }
      const [leagueData, matchupsResult, teamsData] = await Promise.all([
        getLeagueBySlug(slug),
        getMatchupHistory(league.id),
        getTeams(league.id),
      ]);
      onDataRefresh({ league: leagueData, matchups: matchupsResult.matchups, teams: teamsData });
      notify.success("Handicap formula saved and all stats recalculated!");
    } catch (error) {
      console.error("handleSaveHandicapSettings error:", error);
      notify.error("Failed to save handicap settings.");
    }
    setLoadingSection(null);
  }

  async function handleRecalculateAll() {
    if (!confirm("Recompute every matchup's handicap, net score, points, and team totals from the current settings? Week-1 manual entries are preserved.")) return;
    setLoadingSection("recalc");
    try {
      const result = await recalculateAllMatchups(slug);
      if (!result.success) {
        notify.error(result.error);
        setLoadingSection(null);
        return;
      }
      const [leagueData, matchupsResult, teamsData] = await Promise.all([
        getLeagueBySlug(slug),
        getMatchupHistory(league.id),
        getTeams(league.id),
      ]);
      onDataRefresh({ league: leagueData, matchups: matchupsResult.matchups, teams: teamsData });
      notify.success("All matchups recalculated.");
    } catch (error) {
      console.error("handleRecalculateAll error:", error);
      notify.error("Failed to recalculate matchups.");
    }
    setLoadingSection(null);
  }

  async function handleSaveScoringConfig() {
    setLoadingSection("scoring");
    try {
      const config: ScoringConfigInput = {
        scoringType: scoringType as "match_play" | "stroke_play" | "hybrid",
        strokePlayPointPreset: strokePlayPointPreset as "linear" | "weighted" | "pga_style" | "custom",
        strokePlayPointScale: strokePlayPointScale.length > 0 ? strokePlayPointScale : null,
        strokePlayBonusShow,
        strokePlayBonusBeat,
        strokePlayDnpPoints,
        strokePlayTieMode: strokePlayTieMode as "split" | "same",
        strokePlayDnpPenalty,
        strokePlayMaxDnp: strokePlayMaxDnp === "" ? null : strokePlayMaxDnp,
        strokePlayProRate,
        hybridFieldWeight,
        hybridFieldPointScale: hybridFieldPointScale.length > 0 ? hybridFieldPointScale : null,
      };
      const result = await updateScoringConfig(slug, config);
      if (result.success) {
        const leagueData = await getLeagueBySlug(slug);
        onDataRefresh({ league: leagueData });
        notify.success("Scoring configuration saved!");
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleSaveScoringConfig error:", error);
      notify.error("Failed to save scoring configuration.");
    }
    setLoadingSection(null);
  }

  async function handleSaveScheduleConfig() {
    setLoadingSection("schedule");
    try {
      const config: ScheduleConfigInput = {
        scheduleVisibility: scheduleVisibility as "full" | "current_week" | "hidden",
        byePointsMode: byePointsMode as "zero" | "flat" | "league_average" | "team_average",
        byePointsFlat,
        scheduleExtraWeeks: scheduleExtraWeeks as "flex" | "continue_round",
        midSeasonAddDefault: midSeasonAddDefault as "start_from_here" | "fill_byes" | "pro_rate" | "catch_up",
        midSeasonRemoveAction: midSeasonRemoveAction as "bye_opponents" | "regenerate",
        playoffWeeks,
        playoffTeams,
        playoffFormat: playoffFormat as "single_elimination" | "double_elimination" | "round_robin",
        playMode: playMode as "full_18" | "nine_hole_alternating" | "nine_hole_front" | "nine_hole_back",
        playModeFirstWeekSide: playModeFirstWeekSide as "front" | "back",
      };
      const result = await updateScheduleConfig(slug, config);
      if (result.success) {
        const leagueData = await getLeagueBySlug(slug);
        onDataRefresh({ league: leagueData });
        notify.success("Schedule configuration saved!");
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleSaveScheduleConfig error:", error);
      notify.error("Failed to save schedule configuration.");
    }
    setLoadingSection(null);
  }

  function handlePointPresetChange(preset: string, setter: (s: number[]) => void) {
    if (preset !== "custom") {
      setter(generatePointScale(preset, approvedTeamsCount || 8));
    }
  }

  return (
    <div className="bg-scorecard-paper rounded-lg shadow-md border border-scorecard-line/50 p-6">
      {parseWarnings.length > 0 && (
        <div className="mb-6 p-4 rounded-lg font-sans bg-warning-bg border border-warning-border text-warning-text">
          Some scoring configuration data was corrupted and has been reset to defaults. Save your settings to fix this.
        </div>
      )}

      <h2 className="text-xl font-display font-semibold mb-6 text-scorecard-pencil uppercase tracking-wider">League Settings</h2>

      <div className="space-y-6">
        <div>
          <label htmlFor="settings-max-teams" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Maximum Number of Teams</label>
          <input id="settings-max-teams" type="number" value={maxTeamsInput} onChange={(e) => setMaxTeamsInput(parseInt(e.target.value) || 1)} min={1} className="pencil-input w-32 font-mono tabular-nums" />
          <p className="mt-1 text-sm font-sans text-text-muted">Currently {approvedTeamsCount} approved team(s)</p>
        </div>

        <div>
          <label htmlFor="settings-registration-open" className="flex items-center gap-3 cursor-pointer">
            <input id="settings-registration-open" type="checkbox" checked={registrationOpenInput} onChange={(e) => setRegistrationOpenInput(e.target.checked)} className={checkboxClass} />
            <span className="text-scorecard-pencil font-display font-medium uppercase tracking-wider">Registration Open</span>
          </label>
        </div>

        <SubmitButton type="button" onClick={handleSaveSettings} disabled={loadingSection !== null} pending={loadingSection === "basic"}>
          Save Settings
        </SubmitButton>
      </div>

      {/* Scoring Format Section */}
      <div className="mt-8 pt-8 border-t border-scorecard-line/50">
        <Accordion type="multiple">
          <AccordionItem value="scoring" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Scoring Format</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50 space-y-6">
              {/* Scoring Type Selector */}
              <div>
                <label id="settings-scoring-type-label" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Scoring Type</label>
                {hasSeasonData ? (
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex px-3 py-1.5 text-sm font-display font-semibold uppercase tracking-wider rounded-lg ${
                        scoringType === "stroke_play"
                          ? "bg-info-bg text-info-text"
                          : scoringType === "hybrid"
                          ? "bg-bunker/30 text-wood"
                          : "bg-fairway/10 text-primary"
                      }`}>
                        {scoringType === "stroke_play" ? "Stroke Play"
                          : scoringType === "hybrid" ? "Hybrid"
                          : "Match Play"}
                      </span>
                    </div>
                    <p className="text-sm font-sans text-warning-text bg-warning-bg border border-warning-border rounded-lg p-3">
                      The current season has existing data. To change the scoring type, create a new season first.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: "match_play", label: "Match Play", desc: "Head-to-head matchups, 20-point split" },
                        { value: "stroke_play", label: "Stroke Play", desc: "All teams compete against the field" },
                        { value: "hybrid", label: "Hybrid", desc: "Match play + field position points" },
                      ] as const).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setScoringType(option.value)}
                          className={`p-3 rounded-lg border-2 text-left transition-colors ${
                            scoringType === option.value
                              ? "border-fairway bg-fairway/10"
                              : "border-scorecard-line/50 hover:border-putting/50"
                          }`}
                        >
                          <div className={`text-sm font-display font-semibold uppercase tracking-wider ${scoringType === option.value ? "text-primary" : "text-scorecard-pencil"}`}>
                            {option.label}
                          </div>
                          <div className="text-xs font-sans text-text-muted mt-1">{option.desc}</div>
                        </button>
                      ))}
                    </div>
                    {scoringType !== league.scoringType && (
                      <p className="text-sm font-sans text-warning-text bg-warning-bg border border-warning-border rounded-lg p-3 mt-3">
                        Scoring type will be changed. This affects how scores are entered and standings are calculated.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Stroke Play / Hybrid Options */}
              {(scoringType === "stroke_play" || scoringType === "hybrid") && (
                <>
                  <div>
                    <label id="settings-point-scale-label" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Point Scale Preset</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {getPointScalePresets().map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setStrokePlayPointPreset(preset.id);
                            handlePointPresetChange(preset.id, setStrokePlayPointScale);
                          }}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-display font-semibold uppercase tracking-wider ${
                            strokePlayPointPreset === preset.id
                              ? "bg-fairway text-white border-fairway"
                              : "bg-scorecard-paper text-text-secondary border-scorecard-line/50 hover:border-fairway"
                          }`}
                          title={preset.description}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                    {strokePlayPointPreset === "custom" && (
                      <div>
                        <label htmlFor="settings-custom-point-scale" className="block text-xs font-display text-text-muted uppercase tracking-wider mb-1">Custom point values (1st place to last, comma-separated)</label>
                        <input
                          id="settings-custom-point-scale"
                          type="text"
                          value={strokePlayPointScale.join(", ")}
                          onChange={(e) => {
                            const vals = e.target.value.split(",").map((v) => parseInt(v.trim())).filter((v) => !isNaN(v));
                            setStrokePlayPointScale(vals);
                          }}
                          className="pencil-input w-full font-mono tabular-nums"
                          placeholder="15, 12, 10, 8, 6, 4, 2, 1"
                        />
                      </div>
                    )}
                    {strokePlayPointScale.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {strokePlayPointScale.map((pts, i) => (
                          <span key={i} className="px-2 py-0.5 bg-bunker/20 rounded text-xs font-mono tabular-nums text-text-secondary">
                            {i + 1}{i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"}: {pts}pts
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="settings-bonus-show" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Bonus Points: Show Up</label>
                      <input id="settings-bonus-show" type="number" value={strokePlayBonusShow} onChange={(e) => setStrokePlayBonusShow(parseFloat(e.target.value) || 0)} min="0" step="0.5" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">Extra points just for playing</p>
                    </div>
                    <div>
                      <label htmlFor="settings-bonus-beat" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Bonus Points: Beat Net Score</label>
                      <input id="settings-bonus-beat" type="number" value={strokePlayBonusBeat} onChange={(e) => setStrokePlayBonusBeat(parseFloat(e.target.value) || 0)} min="0" step="0.5" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">Extra points for net below par</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="settings-tie-mode" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Tie Handling</label>
                      <select id="settings-tie-mode" value={strokePlayTieMode} onChange={(e) => setStrokePlayTieMode(e.target.value)} className={`${selectClass} max-w-xs`}>
                        <option value="split">Split Points (average tied positions)</option>
                        <option value="same">Same Points (all get higher value)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="settings-dnp-points" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">DNP Points</label>
                      <input id="settings-dnp-points" type="number" value={strokePlayDnpPoints} onChange={(e) => setStrokePlayDnpPoints(parseFloat(e.target.value) || 0)} min="0" step="0.5" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">Points for teams that didn&apos;t play</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="settings-dnp-penalty" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">DNP Penalty (per week)</label>
                      <input id="settings-dnp-penalty" type="number" value={strokePlayDnpPenalty} onChange={(e) => setStrokePlayDnpPenalty(parseFloat(e.target.value) || 0)} max="0" step="0.5" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">Negative value subtracted from total</p>
                    </div>
                    <div>
                      <label htmlFor="settings-max-dnp" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Max DNP Weeks</label>
                      <input id="settings-max-dnp" type="number" value={strokePlayMaxDnp} onChange={(e) => setStrokePlayMaxDnp(e.target.value ? parseInt(e.target.value) : "")} min="1" placeholder="No limit" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">Auto-disqualify after this many</p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="settings-pro-rate" className="flex items-center gap-2 cursor-pointer">
                      <input id="settings-pro-rate" type="checkbox" checked={strokePlayProRate} onChange={(e) => setStrokePlayProRate(e.target.checked)} className={checkboxClass} />
                      <span className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">Pro-Rate Standings for Missed Weeks</span>
                    </label>
                    <p className="text-xs font-sans text-text-muted mt-1 ml-6">Use points-per-week average instead of total for teams with fewer rounds</p>
                  </div>
                </>
              )}

              {/* Hybrid-Specific */}
              {scoringType === "hybrid" && (
                <div className="border-t border-scorecard-line/50 pt-4">
                  <h4 className="text-sm font-display font-semibold text-text-secondary uppercase tracking-wider mb-3">Hybrid Mode Settings</h4>
                  <div className="mb-4">
                    <label htmlFor="settings-hybrid-field-weight" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
                      Field Weight: <span className="font-mono tabular-nums">{Math.round(hybridFieldWeight * 100)}%</span> field / <span className="font-mono tabular-nums">{Math.round((1 - hybridFieldWeight) * 100)}%</span> match
                    </label>
                    <input
                      id="settings-hybrid-field-weight"
                      type="range"
                      value={hybridFieldWeight}
                      onChange={(e) => setHybridFieldWeight(parseFloat(e.target.value))}
                      min="0"
                      max="1"
                      step="0.05"
                      className="w-full max-w-xs accent-fairway"
                    />
                    <p className="text-xs font-sans text-text-muted mt-1">Balance between field position points and match play points</p>
                  </div>
                </div>
              )}

              <SubmitButton type="button" onClick={handleSaveScoringConfig} disabled={loadingSection !== null} pending={loadingSection === "scoring"}>
                Save Scoring Config
              </SubmitButton>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Schedule Settings Section */}
      <div className="mt-8 pt-8 border-t border-scorecard-line/50">
        <Accordion type="multiple">
          <AccordionItem value="schedule" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Schedule Settings</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50 space-y-6">
              {/* Course Play Mode */}
              <div>
                <label id="settings-play-mode-label" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Holes Per Week</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "full", label: "Full Course", desc: "Play all holes every week" },
                    { value: "nine", label: "9 Holes Per Week", desc: "Play 9 holes each week" },
                  ] as const).map((opt) => {
                    const isSelected = opt.value === "full" ? playMode === "full_18" : playMode !== "full_18";
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPlayMode(opt.value === "full" ? "full_18" : "nine_hole_alternating")}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          isSelected
                            ? "border-fairway bg-fairway/10"
                            : "border-scorecard-line/50 hover:border-putting/50"
                        }`}
                      >
                        <div className={`text-xs font-display font-semibold uppercase tracking-wider ${isSelected ? "text-primary" : "text-scorecard-pencil"}`}>
                          {opt.label}
                        </div>
                        <div className="text-xs font-sans text-text-muted mt-1">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {playMode !== "full_18" && (
                  <div className="mt-3">
                    <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Which 9?</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "nine_hole_alternating", label: "Alternating", desc: "Front one week, back the next" },
                        { value: "nine_hole_front", label: "Front 9 Always", desc: "Always play holes 1–9" },
                        { value: "nine_hole_back", label: "Back 9 Always", desc: "Always play holes 10–18" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlayMode(opt.value)}
                          className={`p-3 rounded-lg border-2 text-left transition-colors ${
                            playMode === opt.value
                              ? "border-fairway bg-fairway/10"
                              : "border-scorecard-line/50 hover:border-putting/50"
                          }`}
                        >
                          <div className={`text-xs font-display font-semibold uppercase tracking-wider ${playMode === opt.value ? "text-primary" : "text-scorecard-pencil"}`}>
                            {opt.label}
                          </div>
                          <div className="text-xs font-sans text-text-muted mt-1">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                    {playMode === "nine_hole_alternating" && (
                      <div className="mt-3">
                        <label className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Week 1 Plays</label>
                        <div className="flex gap-3">
                          {([
                            { value: "front", label: "Front 9 First" },
                            { value: "back", label: "Back 9 First" },
                          ] as const).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPlayModeFirstWeekSide(opt.value)}
                              className={`px-4 py-2 rounded-lg border-2 text-sm font-display font-semibold uppercase tracking-wider transition-colors ${
                                playModeFirstWeekSide === opt.value
                                  ? "border-fairway bg-fairway/10 text-primary"
                                  : "border-scorecard-line/50 text-text-secondary hover:border-putting/50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs font-sans text-text-muted mt-1">Odd weeks play this side, even weeks play the other</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="settings-schedule-visibility" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Schedule Visibility</label>
                <select id="settings-schedule-visibility" value={scheduleVisibility} onChange={(e) => setScheduleVisibility(e.target.value)} className={`${selectClass} max-w-xs`}>
                  <option value="full">Full Schedule (show all weeks)</option>
                  <option value="current_week">Current Week Only</option>
                  <option value="hidden">Hidden (admin only)</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-bye-points-mode" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Bye Week Points</label>
                  <select id="settings-bye-points-mode" value={byePointsMode} onChange={(e) => setByePointsMode(e.target.value)} className={selectClass}>
                    <option value="zero">Zero Points</option>
                    <option value="flat">Flat Amount</option>
                    <option value="league_average">League Average</option>
                    <option value="team_average">Team&apos;s Own Average</option>
                  </select>
                </div>
                {byePointsMode === "flat" && (
                  <div>
                    <label htmlFor="settings-bye-points-flat" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Flat Bye Points</label>
                    <input id="settings-bye-points-flat" type="number" value={byePointsFlat} onChange={(e) => setByePointsFlat(parseFloat(e.target.value) || 0)} min="0" step="0.5" className="pencil-input w-32 font-mono tabular-nums" />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="settings-extra-weeks" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Extra Weeks Handling</label>
                <select id="settings-extra-weeks" value={scheduleExtraWeeks} onChange={(e) => setScheduleExtraWeeks(e.target.value)} className={`${selectClass} max-w-xs`}>
                  <option value="flex">Flex (allow manual matchups beyond schedule)</option>
                  <option value="continue_round">Continue Round Robin</option>
                </select>
                <p className="text-xs font-sans text-text-muted mt-1">What happens when the season has more weeks than the schedule covers</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-mid-season-add" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Mid-Season Team Addition</label>
                  <select id="settings-mid-season-add" value={midSeasonAddDefault} onChange={(e) => setMidSeasonAddDefault(e.target.value)} className={selectClass}>
                    <option value="start_from_here">Start From Current Week</option>
                    <option value="fill_byes">Fill Bye Slots</option>
                    <option value="pro_rate">Pro-Rate Standings</option>
                    <option value="catch_up">Catch-Up Mode</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="settings-mid-season-remove" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Team Removal Action</label>
                  <select id="settings-mid-season-remove" value={midSeasonRemoveAction} onChange={(e) => setMidSeasonRemoveAction(e.target.value)} className={selectClass}>
                    <option value="bye_opponents">Give Opponents Bye Points</option>
                    <option value="regenerate">Regenerate Schedule</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-scorecard-line/50 pt-4">
                <h4 className="text-sm font-display font-semibold text-text-secondary uppercase tracking-wider mb-3">Playoffs</h4>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="settings-playoff-weeks" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Playoff Weeks</label>
                    <input id="settings-playoff-weeks" type="number" value={playoffWeeks} onChange={(e) => setPlayoffWeeks(parseInt(e.target.value) || 0)} min="0" max="4" className="pencil-input w-32 font-mono tabular-nums" />
                    <p className="text-xs font-sans text-text-muted mt-1">0 = no playoffs</p>
                  </div>
                  {playoffWeeks > 0 && (
                    <>
                      <div>
                        <label htmlFor="settings-playoff-teams" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Teams in Playoffs</label>
                        <input id="settings-playoff-teams" type="number" value={playoffTeams} onChange={(e) => setPlayoffTeams(parseInt(e.target.value) || 2)} min="2" max="8" className="pencil-input w-32 font-mono tabular-nums" />
                      </div>
                      <div>
                        <label htmlFor="settings-playoff-format" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Playoff Format</label>
                        <select id="settings-playoff-format" value={playoffFormat} onChange={(e) => setPlayoffFormat(e.target.value)} className={selectClass}>
                          <option value="single_elimination">Single Elimination</option>
                          <option value="double_elimination">Double Elimination</option>
                          <option value="round_robin">Round Robin</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <SubmitButton type="button" onClick={handleSaveScheduleConfig} disabled={loadingSection !== null} pending={loadingSection === "schedule"}>
                Save Schedule Settings
              </SubmitButton>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Scorecard Entry Settings */}
      <div className="mt-8 pt-8 border-t border-scorecard-line/50">
        <Accordion type="multiple">
          <AccordionItem value="scorecard" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Scorecard Entry</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50 space-y-4">
              <p className="text-sm font-sans text-text-muted">
                Enable hole-by-hole scorecard entry so players can enter their own scores from their phone.
                Completed scorecards provide gross totals that pre-fill into your matchup/weekly score forms.
              </p>
              <div>
                <label id="settings-scorecard-mode-label" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Scorecard Mode</label>
                <div className="flex gap-3">
                  {([
                    { value: "disabled", label: "Disabled", desc: "Scorecards off — enter scores manually" },
                    { value: "optional", label: "Optional", desc: "Players can use scorecards, but not required" },
                    { value: "required", label: "Required", desc: "Scorecards required before entering matchups" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setScorecardMode(opt.value)}
                      className={`flex-1 p-3 rounded-lg border-2 text-left transition-colors ${
                        scorecardMode === opt.value
                          ? "border-fairway bg-fairway/10"
                          : "border-scorecard-line/50 hover:border-putting/50"
                      }`}
                    >
                      <div className={`text-sm font-display font-semibold uppercase tracking-wider ${scorecardMode === opt.value ? "text-primary" : "text-scorecard-pencil"}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs font-sans text-text-muted mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {scorecardMode !== "disabled" && (
                <div>
                  <label htmlFor="settings-scorecard-approval" className="flex items-center gap-3 cursor-pointer">
                    <input
                      id="settings-scorecard-approval"
                      type="checkbox"
                      checked={scorecardRequireApproval}
                      onChange={(e) => setScorecardRequireApproval(e.target.checked)}
                      className={checkboxClass}
                    />
                    <div>
                      <span className="text-scorecard-pencil font-display font-medium uppercase tracking-wider text-sm">Require Admin Approval</span>
                      <p className="text-xs font-sans text-text-muted">Admin must approve scorecards before scores count</p>
                    </div>
                  </label>
                </div>
              )}
              <SubmitButton
                type="button"
                onClick={async () => {
                  setLoadingSection("scorecard");
                  try {
                    const result = await updateScorecardSettings(slug, scorecardMode as "disabled" | "optional" | "required", scorecardRequireApproval);
                    if (!result.success) {
                      notify.error(result.error);
                      setLoadingSection(null);
                      return;
                    }
                    const leagueData = await getLeagueBySlug(slug);
                    onDataRefresh({ league: leagueData });
                    notify.success("Scorecard settings saved!");
                  } catch (error) {
                    console.error("saveScorecardSettings error:", error);
                    notify.error("Failed to save scorecard settings.");
                  }
                  setLoadingSection(null);
                }}
                disabled={loadingSection !== null}
                pending={loadingSection === "scorecard"}
              >
                Save Scorecard Settings
              </SubmitButton>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Password Change Section */}
      <div className="mt-8 pt-8 border-t border-scorecard-line/50">
        <h3 className="text-lg font-display font-semibold mb-4 text-scorecard-pencil uppercase tracking-wider">Change Admin Password</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const currentPw = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
            const newPw = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
            const confirmPw = (form.elements.namedItem("confirmNewPassword") as HTMLInputElement).value;
            if (newPw !== confirmPw) { notify.error("New passwords do not match"); return; }
            if (newPw.length < 8) { notify.error("New password must be at least 8 characters"); return; }
            try {
              const result = await changeLeaguePassword(slug, currentPw, newPw);
              if (result.success) {
                notify.success("Password changed successfully");
                form.reset();
              } else {
                notify.error(result.error);
              }
            } catch (error) {
              console.error("changePassword error:", error);
              notify.error("Failed to change password. Please try again.");
            }
          }}
          className="space-y-4 max-w-md"
        >
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Current Password</label>
            <input type="password" name="currentPassword" id="currentPassword" required minLength={1} className="pencil-input w-full" />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">New Password</label>
            <input type="password" name="newPassword" id="newPassword" required minLength={8} className="pencil-input w-full" />
          </div>
          <div>
            <label htmlFor="confirmNewPassword" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Confirm New Password</label>
            <input type="password" name="confirmNewPassword" id="confirmNewPassword" required minLength={8} className="pencil-input w-full" />
          </div>
          <Button type="submit" variant="accent">Change Password</Button>
        </form>
      </div>

      {/* Handicap Formula */}
      <div className="mt-8 pt-8 border-t border-scorecard-line/50">
        <h3 className="text-lg font-display font-semibold mb-4 text-scorecard-pencil uppercase tracking-wider">Handicap Configuration</h3>

        {/* Preset Templates */}
        <div className="mb-6">
          <label id="settings-quick-presets-label" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Quick Presets</label>
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
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-display font-semibold uppercase tracking-wider ${selectedPreset === preset.name ? "bg-fairway text-white border-fairway" : "bg-scorecard-paper text-text-secondary border-scorecard-line/50 hover:border-fairway"}`}
                title={preset.desc}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-1">Applying a preset will reset all handicap settings to the preset values.</p>
        </div>

        <Accordion type="multiple" defaultValue={["basic"]}>
          {/* Basic Formula Section */}
          <AccordionItem value="basic" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Basic Formula</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50">
              <p className="text-sm font-sans text-text-muted mb-4">Formula: (Average Score - Base Score) x Multiplier</p>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="hc-base-score" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Base Score (Par)</label>
                  <input id="hc-base-score" type="number" value={handicapBaseScore} onChange={(e) => { setHandicapBaseScore(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }} className="pencil-input w-full font-mono tabular-nums" />
                </div>
                <div>
                  <label htmlFor="hc-multiplier" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Multiplier</label>
                  <input id="hc-multiplier" type="number" value={handicapMultiplier} onChange={(e) => { setHandicapMultiplier(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }} step="0.01" className="pencil-input w-full font-mono tabular-nums" />
                </div>
                <div>
                  <label htmlFor="hc-rounding" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Rounding</label>
                  <select id="hc-rounding" value={handicapRounding} onChange={(e) => { setHandicapRounding(e.target.value as "floor" | "round" | "ceil"); setSelectedPreset("custom"); }} className={selectClass}>
                    <option value="floor">Floor (round down)</option>
                    <option value="round">Round (nearest)</option>
                    <option value="ceil">Ceiling (round up)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="hc-default" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Default Handicap</label>
                  <input id="hc-default" type="number" value={handicapDefault} onChange={(e) => { setHandicapDefault(parseFloat(e.target.value) || 0); setSelectedPreset("custom"); }} className="pencil-input w-full font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">When no scores available</p>
                </div>
                <div>
                  <label htmlFor="hc-max" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Maximum Handicap</label>
                  <input id="hc-max" type="number" value={handicapMax} onChange={(e) => { setHandicapMax(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="No limit" className="pencil-input w-full font-mono tabular-nums" />
                </div>
                <div>
                  <label htmlFor="hc-min" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Minimum Handicap</label>
                  <input id="hc-min" type="number" value={handicapMin} onChange={(e) => { setHandicapMin(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="No limit" className="pencil-input w-full font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">For scratch golfers</p>
                </div>
                <div>
                  <label htmlFor="hc-under-par-multiplier" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Under-Par Multiplier</label>
                  <input id="hc-under-par-multiplier" type="number" value={handicapUnderParMultiplier} onChange={(e) => { setHandicapUnderParMultiplier(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} step="0.01" placeholder="Use main" className="pencil-input w-full font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">Multiplier when avg &le; par (e.g. 1.1)</p>
                </div>
                <div>
                  <label htmlFor="hc-under-par-cap" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Under-Par Cap</label>
                  <input id="hc-under-par-cap" type="number" value={handicapUnderParCap} onChange={(e) => { setHandicapUnderParCap(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="No cap" className="pencil-input w-full font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">Max handicap when avg &le; par (e.g. -1)</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Score Selection Section */}
          <AccordionItem value="selection" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Score Selection</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="hc-selection-method" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Selection Method</label>
                  <select id="hc-selection-method" value={handicapScoreSelection} onChange={(e) => {
                    const newValue = e.target.value as "all" | "last_n" | "best_of_last";
                    setHandicapScoreSelection(newValue);
                    setSelectedPreset("custom");
                    // When changing away from best_of_last, clear to empty so the
                    // fields appear blank if the user switches back (prompting fresh input).
                    if (newValue !== "best_of_last") {
                      setHandicapBestOf("");
                      setHandicapLastOf("");
                    }
                    // When changing away from last_n, clear to empty
                    if (newValue !== "last_n") {
                      setHandicapScoreCount("");
                    }
                  }} className={`${selectClass} max-w-xs`}>
                    <option value="all">Use All Scores</option>
                    <option value="last_n">Use Last N Scores</option>
                    <option value="best_of_last">Best X of Last Y Scores</option>
                  </select>
                </div>
                {handicapScoreSelection === "last_n" && (
                  <div>
                    <label htmlFor="hc-score-count" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Number of Recent Scores</label>
                    <input id="hc-score-count" type="number" value={handicapScoreCount} onChange={(e) => { setHandicapScoreCount(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} min="1" className="pencil-input w-32 font-mono tabular-nums" />
                  </div>
                )}
                {handicapScoreSelection === "last_n" && handicapScoreCount === "" && (
                  <p className="text-sm text-text-muted mt-1">Score count is required for this selection method.</p>
                )}
                {handicapScoreSelection === "best_of_last" && (
                  <>
                    <div>
                      <label htmlFor="hc-best-of" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Use Best</label>
                      <input id="hc-best-of" type="number" value={handicapBestOf} onChange={(e) => { setHandicapBestOf(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} min="1" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">Best X scores</p>
                    </div>
                    <div>
                      <label htmlFor="hc-last-of" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Of Last</label>
                      <input id="hc-last-of" type="number" value={handicapLastOf} onChange={(e) => { setHandicapLastOf(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} min="1" className="pencil-input w-32 font-mono tabular-nums" />
                      <p className="text-xs font-sans text-text-muted mt-1">From last Y rounds</p>
                    </div>
                  </>
                )}
                {handicapScoreSelection === "best_of_last" && typeof handicapBestOf === "number" && typeof handicapLastOf === "number" && handicapBestOf > handicapLastOf && (
                  <p className="text-sm text-board-red mt-1">Best-of count must be less than or equal to last-of count.</p>
                )}
                {handicapScoreSelection === "best_of_last" && (handicapBestOf === "" || handicapLastOf === "") && (
                  <p className="text-sm text-text-muted mt-1">Both best-of and last-of counts are required for this selection method.</p>
                )}
                <div>
                  <label htmlFor="hc-drop-highest" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Drop Highest Scores</label>
                  <input id="hc-drop-highest" type="number" value={handicapDropHighest} onChange={(e) => { setHandicapDropHighest(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }} min="0" className="pencil-input w-32 font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">Remove worst rounds</p>
                </div>
                <div>
                  <label htmlFor="hc-drop-lowest" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Drop Lowest Scores</label>
                  <input id="hc-drop-lowest" type="number" value={handicapDropLowest} onChange={(e) => { setHandicapDropLowest(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }} min="0" className="pencil-input w-32 font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">Remove best rounds</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Score Weighting Section */}
          <AccordionItem value="weighting" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Score Weighting</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50">
              <div className="mb-4">
                <label htmlFor="hc-use-weighting" className="flex items-center gap-2 cursor-pointer">
                  <input id="hc-use-weighting" type="checkbox" checked={handicapUseWeighting} onChange={(e) => { setHandicapUseWeighting(e.target.checked); setSelectedPreset("custom"); }} className={checkboxClass} />
                  <span className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">Enable Recency Weighting</span>
                </label>
                <p className="text-xs font-sans text-text-muted mt-1 ml-6">Recent scores count more towards handicap</p>
              </div>
              {handicapUseWeighting && (
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label htmlFor="hc-weight-recent" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Recent Score Weight</label>
                    <input id="hc-weight-recent" type="number" value={handicapWeightRecent} onChange={(e) => { setHandicapWeightRecent(parseFloat(e.target.value) || 1); setSelectedPreset("custom"); }} step="0.1" min="1" className="pencil-input w-32 font-mono tabular-nums" />
                    <p className="text-xs font-sans text-text-muted mt-1">Weight for most recent (1.0 = no boost)</p>
                  </div>
                  <div>
                    <label htmlFor="hc-weight-decay" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Decay Factor</label>
                    <input id="hc-weight-decay" type="number" value={handicapWeightDecay} onChange={(e) => { setHandicapWeightDecay(parseFloat(e.target.value) || 0.9); setSelectedPreset("custom"); }} step="0.05" min="0.1" max="1" className="pencil-input w-32 font-mono tabular-nums" />
                    <p className="text-xs font-sans text-text-muted mt-1">Each older score x this factor</p>
                  </div>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-scorecard-line/40">
                <label htmlFor="hc-cap-exceptional" className="flex items-center gap-2 cursor-pointer">
                  <input id="hc-cap-exceptional" type="checkbox" checked={handicapCapExceptional} onChange={(e) => { setHandicapCapExceptional(e.target.checked); setSelectedPreset("custom"); }} className={checkboxClass} />
                  <span className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">Cap Exceptional Scores</span>
                </label>
                <p className="text-xs font-sans text-text-muted mt-1 ml-6">Limit very high scores before averaging</p>
              </div>
              {handicapCapExceptional && (
                <div className="mt-4">
                  <label htmlFor="hc-exceptional-cap" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Maximum Score Value</label>
                  <input id="hc-exceptional-cap" type="number" value={handicapExceptionalCap} onChange={(e) => { setHandicapExceptionalCap(e.target.value ? parseFloat(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="e.g., 50" className="pencil-input w-32 font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">Scores above this are reduced to this value</p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Time-Based Rules Section */}
          <AccordionItem value="timebased" className={accordionItemClass}>
            <AccordionTrigger className={accordionTriggerClass}>Time-Based Rules</AccordionTrigger>
            <AccordionContent className="p-4 border-t border-scorecard-line/50">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="hc-prov-weeks" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Provisional Period (Weeks)</label>
                  <input id="hc-prov-weeks" type="number" value={handicapProvWeeks} onChange={(e) => { setHandicapProvWeeks(parseInt(e.target.value) || 0); setSelectedPreset("custom"); }} min="0" className="pencil-input w-32 font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">0 = disabled</p>
                </div>
                {handicapProvWeeks > 0 && (
                  <div>
                    <label htmlFor="hc-prov-multiplier" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Provisional Multiplier</label>
                    <input id="hc-prov-multiplier" type="number" value={handicapProvMultiplier} onChange={(e) => { setHandicapProvMultiplier(parseFloat(e.target.value) || 1); setSelectedPreset("custom"); }} step="0.1" className="pencil-input w-32 font-mono tabular-nums" />
                    <p className="text-xs font-sans text-text-muted mt-1">Multiply handicap by this during provisional</p>
                  </div>
                )}
                <div>
                  <label htmlFor="hc-freeze-week" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Freeze Handicaps After Week</label>
                  <input id="hc-freeze-week" type="number" value={handicapFreezeWeek} onChange={(e) => { setHandicapFreezeWeek(e.target.value ? parseInt(e.target.value) : ""); setSelectedPreset("custom"); }} placeholder="Never" min="1" className="pencil-input w-32 font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">Lock handicaps for playoffs</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-scorecard-line/40">
                <label htmlFor="hc-use-trend" className="flex items-center gap-2 cursor-pointer">
                  <input id="hc-use-trend" type="checkbox" checked={handicapUseTrend} onChange={(e) => { setHandicapUseTrend(e.target.checked); setSelectedPreset("custom"); }} className={checkboxClass} />
                  <span className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">Enable Trend Adjustment</span>
                </label>
                <p className="text-xs font-sans text-text-muted mt-1 ml-6">Adjust handicap based on improvement/decline trend</p>
              </div>
              {handicapUseTrend && (
                <div className="mt-4">
                  <label htmlFor="hc-trend-weight" className="block text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-1">Trend Weight</label>
                  <input id="hc-trend-weight" type="number" value={handicapTrendWeight} onChange={(e) => { setHandicapTrendWeight(parseFloat(e.target.value) || 0.1); setSelectedPreset("custom"); }} step="0.05" min="0" max="0.5" className="pencil-input w-32 font-mono tabular-nums" />
                  <p className="text-xs font-sans text-text-muted mt-1">How much to factor in trend (0.1 = 10%)</p>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-scorecard-line/40">
                <label htmlFor="hc-require-approval" className="flex items-center gap-2 cursor-pointer">
                  <input id="hc-require-approval" type="checkbox" checked={handicapRequireApproval} onChange={(e) => { setHandicapRequireApproval(e.target.checked); setSelectedPreset("custom"); }} className={checkboxClass} />
                  <span className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">Require Admin Approval for Handicap Changes</span>
                </label>
                <p className="text-xs font-sans text-text-muted mt-1 ml-6">Manual review before handicap adjustments take effect</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Preview Calculator */}
        <div className="mt-6 p-4 bg-surface rounded-lg border border-scorecard-line/50">
          <h4 className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider mb-3">Preview Calculator</h4>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label htmlFor="hc-preview-avg" className="block text-xs font-display text-text-muted uppercase tracking-wider mb-1">Test Average Score</label>
              <input id="hc-preview-avg" type="number" value={handicapPreviewAvg} onChange={(e) => setHandicapPreviewAvg(parseFloat(e.target.value) || 0)} className="pencil-input w-24 font-mono tabular-nums" />
            </div>
            <div className="text-text-light">=</div>
            <div className="bg-scorecard-paper px-4 py-2 rounded-lg border border-fairway/30">
              <span className="text-xs font-display text-text-muted uppercase tracking-wider">Applied Handicap: </span>
              <span className="text-lg font-mono tabular-nums font-bold text-primary">{calculatePreviewHandicap(handicapPreviewAvg)}</span>
              {handicapMax !== "" && calculatePreviewHandicap(handicapPreviewAvg) >= handicapMax && <span className="ml-2 text-xs font-display text-warning-text font-medium uppercase tracking-wider">(max capped)</span>}
              {handicapMin !== "" && calculatePreviewHandicap(handicapPreviewAvg) <= handicapMin && <span className="ml-2 text-xs font-display text-info-text font-medium uppercase tracking-wider">(min capped)</span>}
            </div>
          </div>
          <p className="text-xs font-sans text-text-muted mt-2">
            Formula{handicapPreviewAvg <= handicapBaseScore && handicapUnderParMultiplier !== "" ? " (under-par multiplier)" : ""}: (<span className="font-mono tabular-nums">{handicapPreviewAvg}</span> - <span className="font-mono tabular-nums">{handicapBaseScore}</span>) x <span className="font-mono tabular-nums">{handicapPreviewAvg <= handicapBaseScore && handicapUnderParMultiplier !== "" ? handicapUnderParMultiplier : handicapMultiplier}</span> = <span className="font-mono tabular-nums">{((handicapPreviewAvg - handicapBaseScore) * (handicapPreviewAvg <= handicapBaseScore && handicapUnderParMultiplier !== "" ? handicapUnderParMultiplier : handicapMultiplier)).toFixed(2)}</span>
          </p>
        </div>

        <div className="mt-6 flex gap-3 flex-wrap">
          <SubmitButton type="button" onClick={handleSaveHandicapSettings} disabled={loadingSection !== null || handicapHasErrors} pending={loadingSection === "handicap"}>
            Save Handicap Settings
          </SubmitButton>
          <SubmitButton
            type="button"
            variant="secondary"
            onClick={handleRecalculateAll}
            disabled={loadingSection !== null}
            pending={loadingSection === "recalc"}
            title="Recompute all matchup handicaps, net scores, points, and team totals from current settings. Week-1 manual entries are preserved."
          >
            Recalculate All Matchups
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}
