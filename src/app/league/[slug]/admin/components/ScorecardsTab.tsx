"use client";

import { useState, useEffect, useRef } from "react";
import {
  generateScorecardLink,
  generateAllScorecardLinks,
  getScorecardsForWeek,
  getScorecardDetail,
  approveScorecard,
  rejectScorecard,
  emailScorecardLink,
  checkEmailConfigured,
  adminSaveHoleScore,
  adminCreateScorecard,
  adminCompleteAndApproveScorecard,
  adminLinkScorecardToMatchup,
  type ScorecardSummary as ScorecardSummaryType,
  type ScorecardDetail,
  type BulkScorecardResult,
} from "@/lib/actions/scorecards";
import { getMatchupsForWeek } from "@/lib/actions/matchups";
import { getSchedule, type ScheduleWeek } from "@/lib/actions/schedule";
import WeekPillSelector from "@/components/WeekPillSelector";
import { getCourseWithHoles, type CourseWithHoles } from "@/lib/actions/courses";
import ScorecardGrid from "@/components/ScorecardGrid";
import AdminScorecardGrid from "@/components/AdminScorecardGrid";
import ScorecardSummaryCard from "@/components/ScorecardSummary";
import type { AdminTeam } from "@/lib/types/admin";

interface MatchupOption {
  id: number;
  teamAId: number;
  teamAName: string;
  teamBId: number;
  teamBName: string;
  teamAGross: number | null;
  teamBGross: number | null;
}

interface ScorecardsTabProps {
  slug: string;
  leagueId: number;
  teams: AdminTeam[];
  weekNumber: number;
  activeSeason: { id: number; name: string } | null;
}

export default function ScorecardsTab({
  slug,
  leagueId,
  teams,
  weekNumber: initialWeekNumber,
  activeSeason,
}: ScorecardsTabProps) {
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber);
  const [fullSchedule, setFullSchedule] = useState<ScheduleWeek[]>([]);
  const initialDefaultApplied = useRef(false);
  const [scorecards, setScorecards] = useState<ScorecardSummaryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed" | "approved">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ScorecardDetail | null>(null);
  const [linkCopied, setLinkCopied] = useState<number | null>(null);
  const [emailSending, setEmailSending] = useState<number | null>(null);
  const [emailSent, setEmailSent] = useState<number | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);

  // Bulk generation state
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkScorecardResult[] | null>(null);
  const [bulkLinksCopied, setBulkLinksCopied] = useState(false);
  const bulkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Manual entry state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualTeamId, setManualTeamId] = useState<number | "">("");
  const [manualPlayerName, setManualPlayerName] = useState("");
  const [manualMatchupId, setManualMatchupId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDetail, setEditingDetail] = useState<ScorecardDetail | null>(null);
  const [savingScore, setSavingScore] = useState(false);

  // Course and matchup data
  const [course, setCourse] = useState<CourseWithHoles | null>(null);
  const [courseLoaded, setCourseLoaded] = useState(false);
  const [weekMatchups, setWeekMatchups] = useState<MatchupOption[]>([]);

  // Timer refs for setTimeout cleanup (prevent memory leaks on unmount)
  const linkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const emailTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => {
    clearTimeout(linkTimerRef.current);
    clearTimeout(emailTimerRef.current);
    clearTimeout(bulkTimerRef.current);
  }, []);

  // Load email config
  useEffect(() => {
    checkEmailConfigured().then(setEmailEnabled);
  }, []);

  // Load full schedule for week pills and default week
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getSchedule(leagueId);
        if (!cancelled) {
          setFullSchedule(data);
          if (!initialDefaultApplied.current && data.length > 0) {
            initialDefaultApplied.current = true;
            const firstIncomplete = data.find((w) =>
              w.matches.some((m) => m.teamB !== null && !m.matchup)
            );
            const targetWeek = firstIncomplete?.weekNumber ?? data[data.length - 1].weekNumber;
            if (targetWeek !== weekNumber) {
              setWeekNumber(targetWeek);
            }
          }
        }
      } catch (error) {
        console.error("loadFullSchedule error:", error);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  // Derived: total weeks and completed weeks for pill selector
  const totalWeeks = Math.max(fullSchedule.length, weekNumber);
  const completedWeeks = new Set(
    fullSchedule
      .filter((w) => {
        const nonByeMatches = w.matches.filter((m) => m.teamB !== null);
        return nonByeMatches.length > 0 && nonByeMatches.every((m) => m.matchup);
      })
      .map((w) => w.weekNumber)
  );

  // Load course data
  useEffect(() => {
    (async () => {
      try {
        const result = await getCourseWithHoles(slug);
        if (result) {
          setCourse(result);
        }
      } catch (error) { console.error("loadCourse error:", error); }
      setCourseLoaded(true);
    })();
  }, [leagueId]);

  // Load scorecards for week
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getScorecardsForWeek(slug, weekNumber);
        if (!cancelled) setScorecards(data);
      } catch (error) {
        console.error("loadScorecardsForWeek error:", error);
        if (!cancelled) setScorecards([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [leagueId, weekNumber]);

  // Load matchups when week changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMatchupsForWeek(leagueId, weekNumber);
        if (!cancelled) setWeekMatchups(data);
      } catch (error) {
        console.error("loadMatchupsForWeek error:", error);
        if (!cancelled) setWeekMatchups([]);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, weekNumber]);

  async function loadScorecards() {
    setLoading(true);
    try {
      const data = await getScorecardsForWeek(slug, weekNumber);
      setScorecards(data);
    } catch (error) {
      console.error("loadScorecards error:", error);
      setScorecards([]);
    }
    setLoading(false);
  }

  async function handleGenerateLink(teamId: number) {
    setMessage(null);
    setLinkCopied(-1); // Use -1 as a "generating..." sentinel

    // Reserve clipboard write NOW, in the user gesture context.
    // ClipboardItem accepts a Promise<Blob> so the actual content
    // can be resolved after the async server action completes.
    let resolveUrl!: (url: string) => void;
    let rejectUrl!: (err: Error) => void;
    const urlPromise = new Promise<string>((res, rej) => {
      resolveUrl = res;
      rejectUrl = rej;
    });

    let clipboardOk = false;
    let clipboardWritePromise: Promise<void> | null = null;
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        clipboardWritePromise = navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": urlPromise.then(
              (text) => new Blob([text], { type: "text/plain" })
            ),
          }),
        ]);
      } catch {
        // ClipboardItem not supported — will show URL as fallback
      }
    }

    try {
      const result = await generateScorecardLink(slug, teamId, weekNumber, activeSeason?.id);
      if (result.success) {
        const fullUrl = `${window.location.origin}${result.data.url}`;
        resolveUrl(fullUrl);

        if (clipboardWritePromise) {
          try {
            await clipboardWritePromise;
            clipboardOk = true;
          } catch {
            // Clipboard write failed
          }
        }

        if (clipboardOk) {
          setLinkCopied(teamId);
          linkTimerRef.current = setTimeout(() => setLinkCopied(null), 3000);
          setMessage({ type: "success", text: "Scorecard link copied to clipboard!" });
        } else {
          setLinkCopied(null);
          setMessage({ type: "success", text: fullUrl });
        }
        await loadScorecards();
      } else {
        rejectUrl(new Error(result.error));
        setLinkCopied(null);
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleGenerateLink error:", error);
      rejectUrl(new Error("Failed to generate link."));
      setLinkCopied(null);
      setMessage({ type: "error", text: "Failed to generate link." });
    }
  }

  async function handleEmailLink(teamId: number) {
    setMessage(null);
    setEmailSending(teamId);
    try {
      const result = await emailScorecardLink(slug, teamId, weekNumber, activeSeason?.id);
      if (result.success) {
        setEmailSent(teamId);
        emailTimerRef.current = setTimeout(() => setEmailSent(null), 3000);
        setMessage({ type: "success", text: "Scorecard link emailed!" });
        await loadScorecards();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleEmailLink error:", error);
      setMessage({ type: "error", text: "Failed to send email." });
    }
    setEmailSending(null);
  }

  async function handleGenerateAllLinks() {
    setMessage(null);
    setBulkGenerating(true);
    setBulkResults(null);
    try {
      const result = await generateAllScorecardLinks(slug, weekNumber, activeSeason?.id);
      if (result.success) {
        setBulkResults(result.data);
        setMessage({ type: "success", text: `Generated scorecard links for ${result.data.filter((r) => r.url).length} teams.` });
        await loadScorecards();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleGenerateAllLinks error:", error);
      setMessage({ type: "error", text: "Failed to generate links." });
    }
    setBulkGenerating(false);
  }

  async function handleCopyAllLinks() {
    if (!bulkResults) return;
    const lines = bulkResults
      .filter((r) => r.url)
      .map((r) => `${r.teamName}: ${window.location.origin}${r.url}`)
      .join("\n");
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([lines], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(lines);
      }
      setBulkLinksCopied(true);
      bulkTimerRef.current = setTimeout(() => setBulkLinksCopied(false), 3000);
    } catch {
      setMessage({ type: "error", text: "Copy failed — please select and copy manually." });
    }
  }

  async function handleExpand(scorecardId: number) {
    if (expandedId === scorecardId) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    // Close editing if expanding a different card
    if (editingId && editingId !== scorecardId) {
      setEditingId(null);
      setEditingDetail(null);
    }
    try {
      const result = await getScorecardDetail(slug, scorecardId);
      if (result.success) {
        setExpandedId(scorecardId);
        setExpandedDetail(result.data);
      }
    } catch (error) {
      console.error("handleExpand error:", error);
      setMessage({ type: "error", text: "Failed to load scorecard details." });
    }
  }

  async function handleApprove(scorecardId: number) {
    setMessage(null);
    try {
      const result = await approveScorecard(slug, scorecardId);
      if (result.success) {
        setMessage({ type: "success", text: "Scorecard approved!" });
        setExpandedId(null);
        setExpandedDetail(null);
        setEditingId(null);
        setEditingDetail(null);
        await loadScorecards();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleApprove error:", error);
      setMessage({ type: "error", text: "Failed to approve scorecard." });
    }
  }

  async function handleReject(scorecardId: number) {
    setMessage(null);
    try {
      const result = await rejectScorecard(slug, scorecardId);
      if (result.success) {
        setMessage({ type: "success", text: "Scorecard rejected. Player can edit and resubmit." });
        setExpandedId(null);
        setExpandedDetail(null);
        await loadScorecards();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleReject error:", error);
      setMessage({ type: "error", text: "Failed to reject scorecard." });
    }
  }

  // Manual entry: create scorecard and enter editing mode
  async function handleManualCreate() {
    if (!manualTeamId) return;
    setMessage(null);
    setCreating(true);
    try {
      const result = await adminCreateScorecard(
        slug,
        manualTeamId as number,
        weekNumber,
        activeSeason?.id,
        manualMatchupId || null,
        null,
        manualPlayerName || null
      );
      if (result.success) {
        setMessage({ type: "success", text: "Scorecard created. Enter scores below." });
        // Enter editing mode
        setEditingId(result.data.id);
        setEditingDetail(result.data);
        setExpandedId(result.data.id);
        setExpandedDetail(result.data);
        // Reset form
        setManualTeamId("");
        setManualPlayerName("");
        setManualMatchupId("");
        setShowManualEntry(false);
        await loadScorecards();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleManualCreate error:", error);
      setMessage({ type: "error", text: "Failed to create scorecard." });
    }
    setCreating(false);
  }

  // Start editing an existing scorecard
  async function handleStartEditing(scorecardId: number) {
    try {
      const result = await getScorecardDetail(slug, scorecardId);
      if (result.success) {
        setEditingId(scorecardId);
        setEditingDetail(result.data);
        setExpandedId(scorecardId);
        setExpandedDetail(result.data);
      }
    } catch (error) {
      console.error("handleStartEditing error:", error);
      setMessage({ type: "error", text: "Failed to load scorecard for editing." });
    }
  }

  // Save a hole score from the admin grid
  async function handleAdminSaveHoleScore(scorecardId: number, holeNumber: number, strokes: number) {
    setSavingScore(true);
    try {
      const result = await adminSaveHoleScore(slug, scorecardId, holeNumber, strokes);
      if (!result.success) {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleAdminSaveHoleScore error:", error);
      setMessage({ type: "error", text: "Failed to save score." });
    }
    setSavingScore(false);
  }

  // Complete and approve in one step
  async function handleCompleteAndApprove(scorecardId: number) {
    setMessage(null);
    try {
      const result = await adminCompleteAndApproveScorecard(slug, scorecardId);
      if (result.success) {
        setMessage({ type: "success", text: "Scorecard completed and approved!" });
        setEditingId(null);
        setEditingDetail(null);
        setExpandedId(null);
        setExpandedDetail(null);
        await loadScorecards();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleCompleteAndApprove error:", error);
      setMessage({ type: "error", text: "Failed to complete scorecard." });
    }
  }

  // Link/unlink a scorecard to a matchup
  async function handleLinkMatchup(scorecardId: number, matchupId: number | null) {
    setMessage(null);
    try {
      const result = await adminLinkScorecardToMatchup(slug, scorecardId, matchupId, null);
      if (result.success) {
        setMessage({ type: "success", text: matchupId ? "Scorecard linked to matchup." : "Matchup link removed." });
        await loadScorecards();
        // Refresh expanded detail if this is the expanded card
        if (expandedId === scorecardId) {
          const detail = await getScorecardDetail(slug, scorecardId);
          if (detail.success) setExpandedDetail(detail.data);
        }
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      console.error("handleLinkMatchup error:", error);
      setMessage({ type: "error", text: "Failed to link matchup." });
    }
  }

  const filtered = filter === "all" ? scorecards : scorecards.filter((sc) => sc.status === filter);
  const teamsWithScorecard = new Set(scorecards.map((sc) => sc.teamId));
  const teamsWithoutScorecard = teams.filter((t) => !teamsWithScorecard.has(t.id));
  const teamEmailMap = new Map(teams.map((t) => [t.id, t.email || null]));

  // Find matchup label for a scorecard
  function getMatchupLabel(matchupId: number | null): string | null {
    if (!matchupId) return null;
    const m = weekMatchups.find((m) => m.id === matchupId);
    if (!m) return `Matchup #${matchupId}`;
    return `${m.teamAName} vs ${m.teamBName}`;
  }

  return (
    <div>
      {message && (
        <div className={`mb-6 p-4 rounded-lg font-sans text-sm ${
          message.type === "success"
            ? "bg-fairway/10 border border-fairway/30 text-fairway"
            : "bg-error-bg border border-error-border text-error-text"
        }`}>
          {message.text}
        </div>
      )}

      <div className="mb-6 space-y-3">
        <h2 className="text-xl font-display font-semibold uppercase tracking-wider text-scorecard-pencil">
          Scorecards
        </h2>
        <WeekPillSelector
          totalWeeks={totalWeeks}
          selectedWeek={weekNumber}
          onWeekChange={setWeekNumber}
          completedWeeks={completedWeeks}
        />
      </div>

      {/* Filter Bar */}
      <div className="flex gap-2 mb-4">
        {(["all", "in_progress", "completed", "approved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-display font-semibold uppercase tracking-wider rounded-lg transition-colors ${
              filter === f
                ? "bg-fairway text-white"
                : "bg-bunker/20 text-text-secondary hover:bg-bunker/30"
            }`}
          >
            {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f === "completed" ? "Completed" : "Approved"}
            {f !== "all" && (
              <span className="ml-1 font-mono">
                ({scorecards.filter((sc) => sc.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Generate Links for Teams */}
      <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
        <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-text-secondary mb-3">
          Scorecard Links
        </h3>
        {teams.length === 0 ? (
          <p className="text-sm font-sans text-text-muted">
            No approved teams yet. Add teams in the Teams tab first.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Generate All Links button */}
            {teamsWithoutScorecard.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAllLinks}
                  disabled={bulkGenerating}
                  className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-fairway text-white rounded-lg hover:bg-rough transition-colors disabled:opacity-50"
                >
                  {bulkGenerating ? "Generating..." : "Generate All Links"}
                </button>
                <span className="text-xs font-sans text-text-muted">
                  {teamsWithoutScorecard.length} team{teamsWithoutScorecard.length !== 1 ? "s" : ""} remaining
                </span>
              </div>
            )}

            {/* Bulk results panel */}
            {bulkResults && (
              <div className="p-3 bg-fairway/5 border border-fairway/20 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-display font-semibold uppercase tracking-wider text-text-secondary">
                    Generated Links
                  </span>
                  <button
                    onClick={handleCopyAllLinks}
                    className={`px-3 py-1 text-xs font-display font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                      bulkLinksCopied
                        ? "bg-fairway text-white"
                        : "bg-scorecard-paper border border-scorecard-line/50 text-text-secondary hover:border-fairway hover:text-fairway"
                    }`}
                  >
                    {bulkLinksCopied ? "Copied!" : "Copy All Links"}
                  </button>
                </div>
                <div className="space-y-1">
                  {bulkResults.map((r) => (
                    <div key={r.teamId} className="flex items-center gap-2 text-sm font-sans">
                      <span className="font-display font-medium text-text-primary min-w-[120px]">{r.teamName}</span>
                      {r.url ? (
                        <span className="text-fairway text-xs truncate">Link ready</span>
                      ) : (
                        <span className="text-error-text text-xs">Failed</span>
                      )}
                      {r.email && (
                        <span className="text-text-muted text-xs truncate">{r.email}</span>
                      )}
                      {r.phone && (
                        <span className="text-text-muted text-xs">{r.phone}</span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setBulkResults(null)}
                  className="text-xs font-display text-text-muted hover:text-text-secondary uppercase tracking-wider"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Per-team buttons — always visible for all teams */}
            <div className="flex flex-wrap gap-2">
              {teams.map((team) => {
                const hasScorecard = teamsWithScorecard.has(team.id);
                return (
                  <div key={team.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleGenerateLink(team.id)}
                      disabled={linkCopied === -1}
                      className={`px-3 py-1.5 text-sm font-display font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                        linkCopied === team.id
                          ? "bg-fairway text-white"
                          : linkCopied === -1
                            ? "bg-bunker/20 text-text-muted animate-pulse"
                            : hasScorecard
                              ? "bg-fairway/10 border border-fairway/30 text-fairway hover:bg-fairway/20"
                              : "bg-scorecard-paper border border-scorecard-line/50 text-text-secondary hover:border-fairway hover:text-fairway"
                      }`}
                    >
                      {linkCopied === team.id ? "Copied!" : linkCopied === -1 ? "..." : team.name}
                    </button>
                    {emailEnabled && team.email && (
                      <button
                        onClick={() => handleEmailLink(team.id)}
                        disabled={emailSending === team.id}
                        title={`Email scorecard link to ${team.email}`}
                        className={`p-1.5 rounded-lg transition-colors ${
                          emailSent === team.id
                            ? "text-fairway"
                            : emailSending === team.id
                              ? "text-text-muted animate-pulse"
                              : "text-text-muted hover:text-fairway hover:bg-fairway/10"
                        }`}
                      >
                        {emailSent === team.id ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Manual Entry Section */}
      <div className="mb-6 p-4 bg-surface rounded-lg border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-text-secondary">
            Manual Entry
          </h3>
          <button
            onClick={() => setShowManualEntry(!showManualEntry)}
            disabled={!courseLoaded || !course}
            className={`px-3 py-1.5 text-xs font-display font-semibold uppercase tracking-wider rounded-lg transition-colors ${
              showManualEntry
                ? "bg-fairway text-white"
                : !course
                  ? "bg-bunker/10 text-text-muted cursor-not-allowed"
                  : "bg-scorecard-paper border border-scorecard-line/50 text-text-secondary hover:border-fairway hover:text-fairway"
            }`}
          >
            {showManualEntry ? "Close" : "Enter Scores"}
          </button>
        </div>

        {!courseLoaded ? (
          <p className="text-sm font-sans text-text-muted">Loading course data...</p>
        ) : !course ? (
          <p className="text-sm font-sans text-text-muted">
            No active course configured. Set up a course in the Course tab to enable manual score entry.
          </p>
        ) : showManualEntry ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Team Selection */}
              <div>
                <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
                  Team
                </label>
                <select
                  value={manualTeamId}
                  onChange={(e) => setManualTeamId(e.target.value ? parseInt(e.target.value) : "")}
                  className="pencil-input w-full"
                >
                  <option value="">Select team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Player Name (optional) */}
              <div>
                <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
                  Player Name <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={manualPlayerName}
                  onChange={(e) => setManualPlayerName(e.target.value)}
                  placeholder="Who played?"
                  className="pencil-input w-full"
                />
              </div>
            </div>

            {/* Matchup Linking (optional) */}
            {weekMatchups.length > 0 && (
              <div>
                <label className="block text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-1">
                  Link to Matchup <span className="text-text-muted">(optional)</span>
                </label>
                <select
                  value={manualMatchupId}
                  onChange={(e) => setManualMatchupId(e.target.value ? parseInt(e.target.value) : "")}
                  className="pencil-input w-full"
                >
                  <option value="">No matchup</option>
                  {weekMatchups.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.teamAName} vs {m.teamBName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleManualCreate}
              disabled={!manualTeamId || creating}
              className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-fairway text-white rounded-lg hover:bg-rough transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create & Start Entering"}
            </button>
          </div>
        ) : null}
      </div>

      {/* Scorecards List */}
      {loading ? (
        <div className="text-center text-text-muted font-sans py-8">Loading scorecards...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-text-muted font-sans py-8">
          {scorecards.length === 0
            ? teams.length === 0
              ? "Add teams in the Teams tab to get started with scorecards."
              : "No scorecards for this week yet. Click a team name above to generate a scorecard link, or use Manual Entry."
            : "No scorecards match the current filter."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sc) => (
            <div key={sc.id} className="border border-scorecard-line/50 rounded-lg overflow-hidden">
              <button
                onClick={() => handleExpand(sc.id)}
                className="w-full p-4 text-left hover:bg-surface-warm transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ScorecardSummaryCard
                      teamName={sc.teamName}
                      grossTotal={sc.grossTotal}
                      totalPar={sc.totalPar}
                      status={sc.status}
                      holesCompleted={sc.holesCompleted}
                      totalHoles={sc.totalHoles}
                      playerName={sc.playerName}
                      compact
                    />
                  </div>
                  {/* Matchup badge */}
                  {sc.matchupId && (
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs font-display uppercase tracking-wider bg-info-bg text-info-text rounded-full border border-info-text/20">
                      Matchup
                    </span>
                  )}
                  {/* Scorecard vs matchup mismatch badge (visible on collapsed row) */}
                  {sc.grossTotal != null && (() => {
                    const matchup = weekMatchups.find(
                      (m) => m.teamAId === sc.teamId || m.teamBId === sc.teamId
                    );
                    if (!matchup) return null;
                    const matchupGross = matchup.teamAId === sc.teamId
                      ? matchup.teamAGross
                      : matchup.teamBGross;
                    if (matchupGross == null) return null;
                    if (sc.grossTotal === matchupGross) {
                      return (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans font-medium text-fairway bg-fairway/10 rounded-full border border-fairway/20">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          Matchup {matchupGross}
                        </span>
                      );
                    }
                    return (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans font-bold text-error-text bg-error-bg rounded-full border border-error-border">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                        Matchup has {matchupGross}
                      </span>
                    );
                  })()}
                </div>
              </button>

              {expandedId === sc.id && expandedDetail && (
                <div className="border-t border-scorecard-line/50 p-4 bg-surface">
                  {/* Show AdminScorecardGrid if editing, otherwise read-only ScorecardGrid */}
                  {editingId === sc.id && editingDetail ? (
                    <AdminScorecardGrid
                      holes={editingDetail.course.holes}
                      holeScores={editingDetail.holeScores}
                      courseName={editingDetail.course.name}
                      totalPar={editingDetail.course.totalPar}
                      onSaveHoleScore={(holeNumber, strokes) =>
                        handleAdminSaveHoleScore(sc.id, holeNumber, strokes)
                      }
                      saving={savingScore}
                    />
                  ) : (
                    <ScorecardGrid
                      holes={expandedDetail.course.holes}
                      holeScores={expandedDetail.holeScores}
                      courseName={expandedDetail.course.name}
                      totalPar={expandedDetail.course.totalPar}
                      grossTotal={expandedDetail.grossTotal}
                      frontNine={expandedDetail.frontNine}
                      backNine={expandedDetail.backNine}
                    />
                  )}

                  {/* Scorecard vs matchup mismatch indicator */}
                  {expandedDetail.grossTotal != null && (() => {
                    const matchup = weekMatchups.find(
                      (m) => m.teamAId === expandedDetail.teamId || m.teamBId === expandedDetail.teamId
                    );
                    if (!matchup) return null;
                    const matchupGross = matchup.teamAId === expandedDetail.teamId
                      ? matchup.teamAGross
                      : matchup.teamBGross;
                    if (matchupGross == null) return null;
                    const matches = expandedDetail.grossTotal === matchupGross;
                    return matches ? (
                      <div className="mt-3 flex items-center gap-1.5 text-sm font-sans text-fairway">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        <span>Matches matchup score</span>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 flex items-start gap-2.5 text-sm font-sans font-medium text-error-text bg-error-bg border border-error-border rounded-lg">
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                        <span>Score mismatch — scorecard gross is <strong className="font-mono tabular-nums">{expandedDetail.grossTotal}</strong>, matchup has <strong className="font-mono tabular-nums">{matchupGross}</strong></span>
                      </div>
                    );
                  })()}

                  {/* Matchup linking dropdown */}
                  {weekMatchups.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
                        Matchup:
                      </label>
                      <select
                        value={expandedDetail.matchupId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          handleLinkMatchup(sc.id, val);
                        }}
                        className="pencil-input text-sm py-1"
                      >
                        <option value="">None</option>
                        {weekMatchups.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.teamAName} vs {m.teamBName}
                          </option>
                        ))}
                      </select>
                      {expandedDetail.matchupId && (
                        <span className="text-xs font-sans text-info-text">
                          {getMatchupLabel(expandedDetail.matchupId)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    {/* Edit Scores button — for non-approved scorecards */}
                    {sc.status !== "approved" && editingId !== sc.id && (
                      <button
                        onClick={() => handleStartEditing(sc.id)}
                        className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-board-yellow/20 text-board-yellow border border-board-yellow/30 rounded-lg hover:bg-board-yellow/30 transition-colors"
                      >
                        Edit Scores
                      </button>
                    )}

                    {/* Complete & Approve button — when editing */}
                    {editingId === sc.id && (
                      <>
                        <button
                          onClick={() => handleCompleteAndApprove(sc.id)}
                          className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-fairway text-white rounded-lg hover:bg-rough transition-colors"
                        >
                          Complete & Approve
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingDetail(null);
                            // Refresh the detail to show updated scores in read-only mode
                            handleExpand(sc.id);
                          }}
                          className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-bunker/20 text-text-secondary rounded-lg hover:bg-bunker/30 transition-colors"
                        >
                          Done Editing
                        </button>
                      </>
                    )}

                    {/* Regenerate Link */}
                    {editingId !== sc.id && (
                      <button
                        onClick={() => handleGenerateLink(sc.teamId)}
                        disabled={linkCopied === -1}
                        className={`px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                          linkCopied === sc.teamId
                            ? "bg-fairway text-white"
                            : linkCopied === -1
                              ? "bg-bunker/20 text-text-muted animate-pulse"
                              : "bg-bunker/20 text-text-secondary hover:bg-bunker/30"
                        }`}
                      >
                        {linkCopied === sc.teamId ? "Copied!" : linkCopied === -1 ? "Generating..." : "Copy Link"}
                      </button>
                    )}

                    {/* Email Link */}
                    {editingId !== sc.id && emailEnabled && teamEmailMap.get(sc.teamId) && (
                      <button
                        onClick={() => handleEmailLink(sc.teamId)}
                        disabled={emailSending === sc.teamId}
                        className={`px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                          emailSent === sc.teamId
                            ? "bg-fairway text-white"
                            : emailSending === sc.teamId
                              ? "bg-bunker/20 text-text-muted animate-pulse"
                              : "bg-bunker/20 text-text-secondary hover:bg-bunker/30"
                        }`}
                      >
                        {emailSent === sc.teamId
                          ? "Sent!"
                          : emailSending === sc.teamId
                            ? "Sending..."
                            : "Email Link"}
                      </button>
                    )}

                    {sc.status === "completed" && editingId !== sc.id && (
                      <>
                        <button
                          onClick={() => handleApprove(sc.id)}
                          className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-fairway text-white rounded-lg hover:bg-rough transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(sc.id)}
                          className="px-4 py-2 text-sm font-display font-semibold uppercase tracking-wider bg-board-red/80 text-white rounded-lg hover:bg-board-red transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {sc.status === "rejected" && editingId !== sc.id && (
                      <span className="px-4 py-2 text-sm font-sans text-text-muted">
                        Player can edit and resubmit
                      </span>
                    )}

                    {sc.status === "approved" && editingId !== sc.id && (
                      <span className="px-4 py-2 text-sm font-sans text-fairway flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Approved — gross total available for matchup/score entry
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
