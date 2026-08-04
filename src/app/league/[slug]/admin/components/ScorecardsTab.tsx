"use client";

import { useState, useEffect, useRef } from "react";
import { Check, CircleCheck, Mail, TriangleAlert } from "lucide-react";
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
import ScorecardSummaryCard from "@/components/ScorecardSummary";
import { notify } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/composite";
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
  }, [leagueId, slug]);

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
  }, [leagueId, slug, weekNumber]);

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
          notify.success("Scorecard link copied to clipboard!");
        } else {
          setLinkCopied(null);
          notify.success(fullUrl);
        }
        await loadScorecards();
      } else {
        rejectUrl(new Error(result.error));
        setLinkCopied(null);
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleGenerateLink error:", error);
      rejectUrl(new Error("Failed to generate link."));
      setLinkCopied(null);
      notify.error("Failed to generate link.");
    }
  }

  async function handleEmailLink(teamId: number) {
    setEmailSending(teamId);
    try {
      const result = await emailScorecardLink(slug, teamId, weekNumber, activeSeason?.id);
      if (result.success) {
        setEmailSent(teamId);
        emailTimerRef.current = setTimeout(() => setEmailSent(null), 3000);
        notify.success("Scorecard link emailed!");
        await loadScorecards();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleEmailLink error:", error);
      notify.error("Failed to send email.");
    }
    setEmailSending(null);
  }

  async function handleGenerateAllLinks() {
    setBulkGenerating(true);
    setBulkResults(null);
    try {
      const result = await generateAllScorecardLinks(slug, weekNumber, activeSeason?.id);
      if (result.success) {
        setBulkResults(result.data);
        notify.success(`Generated scorecard links for ${result.data.filter((r) => r.url).length} teams.`);
        await loadScorecards();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleGenerateAllLinks error:", error);
      notify.error("Failed to generate links.");
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
      notify.error("Copy failed — please select and copy manually.");
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
      notify.error("Failed to load scorecard details.");
    }
  }

  async function handleApprove(scorecardId: number) {
    try {
      const result = await approveScorecard(slug, scorecardId);
      if (result.success) {
        notify.success("Scorecard approved!");
        setExpandedId(null);
        setExpandedDetail(null);
        setEditingId(null);
        setEditingDetail(null);
        await loadScorecards();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleApprove error:", error);
      notify.error("Failed to approve scorecard.");
    }
  }

  async function handleReject(scorecardId: number) {
    try {
      const result = await rejectScorecard(slug, scorecardId);
      if (result.success) {
        notify.success("Scorecard rejected. Player can edit and resubmit.");
        setExpandedId(null);
        setExpandedDetail(null);
        await loadScorecards();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleReject error:", error);
      notify.error("Failed to reject scorecard.");
    }
  }

  // Manual entry: create scorecard and enter editing mode
  async function handleManualCreate() {
    if (!manualTeamId) return;
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
        notify.success("Scorecard created. Enter scores below.");
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
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleManualCreate error:", error);
      notify.error("Failed to create scorecard.");
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
      notify.error("Failed to load scorecard for editing.");
    }
  }

  // Save a hole score from the admin grid
  async function handleAdminSaveHoleScore(scorecardId: number, holeNumber: number, strokes: number) {
    setSavingScore(true);
    try {
      const result = await adminSaveHoleScore(slug, scorecardId, holeNumber, strokes);
      if (!result.success) {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleAdminSaveHoleScore error:", error);
      notify.error("Failed to save score.");
    }
    setSavingScore(false);
  }

  // Complete and approve in one step
  async function handleCompleteAndApprove(scorecardId: number) {
    try {
      const result = await adminCompleteAndApproveScorecard(slug, scorecardId);
      if (result.success) {
        notify.success("Scorecard completed and approved!");
        setEditingId(null);
        setEditingDetail(null);
        setExpandedId(null);
        setExpandedDetail(null);
        await loadScorecards();
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleCompleteAndApprove error:", error);
      notify.error("Failed to complete scorecard.");
    }
  }

  // Link/unlink a scorecard to a matchup
  async function handleLinkMatchup(scorecardId: number, matchupId: number | null) {
    try {
      const result = await adminLinkScorecardToMatchup(slug, scorecardId, matchupId, null);
      if (result.success) {
        notify.success(matchupId ? "Scorecard linked to matchup." : "Matchup link removed.");
        await loadScorecards();
        // Refresh expanded detail if this is the expanded card
        if (expandedId === scorecardId) {
          const detail = await getScorecardDetail(slug, scorecardId);
          if (detail.success) setExpandedDetail(detail.data);
        }
      } else {
        notify.error(result.error);
      }
    } catch (error) {
      console.error("handleLinkMatchup error:", error);
      notify.error("Failed to link matchup.");
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
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "secondary"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f === "completed" ? "Completed" : "Approved"}
            {f !== "all" && (
              <span className="ml-1 font-mono">
                ({scorecards.filter((sc) => sc.status === f).length})
              </span>
            )}
          </Button>
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
                <SubmitButton
                  type="button"
                  pending={bulkGenerating}
                  onClick={handleGenerateAllLinks}
                  disabled={bulkGenerating}
                >
                  {bulkGenerating ? "Generating..." : "Generate All Links"}
                </SubmitButton>
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
                  <Button
                    size="sm"
                    variant={bulkLinksCopied ? "default" : "outline"}
                    onClick={handleCopyAllLinks}
                  >
                    {bulkLinksCopied ? "Copied!" : "Copy All Links"}
                  </Button>
                </div>
                <div className="space-y-1">
                  {bulkResults.map((r) => (
                    <div key={r.teamId} className="flex items-center gap-2 text-sm font-sans">
                      <span className="font-display font-medium text-text-primary min-w-[120px]">{r.teamName}</span>
                      {r.url ? (
                        <span className="text-primary text-xs truncate">Link ready</span>
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
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-text-muted hover:text-text-secondary"
                  onClick={() => setBulkResults(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* Per-team buttons — always visible for all teams */}
            <div className="flex flex-wrap gap-2">
              {teams.map((team) => {
                const hasScorecard = teamsWithScorecard.has(team.id);
                return (
                  <div key={team.id} className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={linkCopied === team.id ? "default" : "outline"}
                      onClick={() => handleGenerateLink(team.id)}
                      disabled={linkCopied === -1}
                      className={`${linkCopied === -1 ? "animate-pulse" : ""} ${
                        hasScorecard && linkCopied !== team.id ? "text-primary border-primary/30" : ""
                      }`}
                    >
                      {linkCopied === team.id ? "Copied!" : linkCopied === -1 ? "..." : team.name}
                    </Button>
                    {emailEnabled && team.email && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEmailLink(team.id)}
                        disabled={emailSending === team.id}
                        title={`Email scorecard link to ${team.email}`}
                        className={
                          emailSent === team.id
                            ? "text-primary"
                            : emailSending === team.id
                              ? "text-text-muted animate-pulse"
                              : "text-text-muted hover:text-primary"
                        }
                      >
                        {emailSent === team.id ? (
                          <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
                        ) : (
                          <Mail className="size-4" strokeWidth={1.75} aria-hidden />
                        )}
                      </Button>
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
          <Button
            size="sm"
            variant={showManualEntry ? "default" : "outline"}
            onClick={() => setShowManualEntry(!showManualEntry)}
            disabled={!courseLoaded || !course}
          >
            {showManualEntry ? "Close" : "Enter Scores"}
          </Button>
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
                  className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
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
                  className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
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

            <SubmitButton
              type="button"
              pending={creating}
              onClick={handleManualCreate}
              disabled={!manualTeamId || creating}
            >
              {creating ? "Creating..." : "Create & Start Entering"}
            </SubmitButton>
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
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans font-medium text-primary bg-fairway/10 rounded-full border border-fairway/20">
                          <Check className="size-3" strokeWidth={1.75} aria-hidden />
                          Matchup {matchupGross}
                        </span>
                      );
                    }
                    return (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans font-bold text-error-text bg-error-bg rounded-full border border-error-border">
                        <TriangleAlert className="size-3" strokeWidth={1.75} aria-hidden />
                        Matchup has {matchupGross}
                      </span>
                    );
                  })()}
                </div>
              </button>

              {expandedId === sc.id && expandedDetail && (
                <div className="border-t border-scorecard-line/50 p-4 bg-surface">
                  {/* Editable grid while editing, otherwise read-only */}
                  {editingId === sc.id && editingDetail ? (
                    <ScorecardGrid
                      key={`edit-${sc.id}`}
                      holes={editingDetail.course.holes}
                      holeScores={editingDetail.holeScores}
                      courseName={editingDetail.course.name}
                      totalPar={editingDetail.course.totalPar}
                      editable={{
                        onSaveHoleScore: (holeNumber, strokes) =>
                          handleAdminSaveHoleScore(sc.id, holeNumber, strokes),
                        saving: savingScore,
                      }}
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
                      <div className="mt-3 flex items-center gap-1.5 text-sm font-sans text-primary">
                        <Check className="size-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                        <span>Matches matchup score</span>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 flex items-start gap-2.5 text-sm font-sans font-medium text-error-text bg-error-bg border border-error-border rounded-lg">
                        <TriangleAlert className="size-4 flex-shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden />
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
                        className="h-9 w-auto rounded-md border border-input bg-card px-2 text-sm text-foreground"
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
                      <Button variant="accent" onClick={() => handleStartEditing(sc.id)}>
                        Edit Scores
                      </Button>
                    )}

                    {/* Complete & Approve button — when editing */}
                    {editingId === sc.id && (
                      <>
                        <Button onClick={() => handleCompleteAndApprove(sc.id)}>
                          Complete & Approve
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingId(null);
                            setEditingDetail(null);
                            // Refresh the detail to show updated scores in read-only mode
                            handleExpand(sc.id);
                          }}
                        >
                          Done Editing
                        </Button>
                      </>
                    )}

                    {/* Regenerate Link */}
                    {editingId !== sc.id && (
                      <Button
                        variant={linkCopied === sc.teamId ? "default" : "secondary"}
                        onClick={() => handleGenerateLink(sc.teamId)}
                        disabled={linkCopied === -1}
                        className={linkCopied === -1 ? "animate-pulse" : ""}
                      >
                        {linkCopied === sc.teamId ? "Copied!" : linkCopied === -1 ? "Generating..." : "Copy Link"}
                      </Button>
                    )}

                    {/* Email Link */}
                    {editingId !== sc.id && emailEnabled && teamEmailMap.get(sc.teamId) && (
                      <Button
                        variant={emailSent === sc.teamId ? "default" : "secondary"}
                        onClick={() => handleEmailLink(sc.teamId)}
                        disabled={emailSending === sc.teamId}
                        className={emailSending === sc.teamId ? "animate-pulse" : ""}
                      >
                        {emailSent === sc.teamId
                          ? "Sent!"
                          : emailSending === sc.teamId
                            ? "Sending..."
                            : "Email Link"}
                      </Button>
                    )}

                    {sc.status === "completed" && editingId !== sc.id && (
                      <>
                        <Button onClick={() => handleApprove(sc.id)}>
                          Approve
                        </Button>
                        <Button variant="destructive" onClick={() => handleReject(sc.id)}>
                          Reject
                        </Button>
                      </>
                    )}

                    {sc.status === "rejected" && editingId !== sc.id && (
                      <span className="px-4 py-2 text-sm font-sans text-text-muted">
                        Player can edit and resubmit
                      </span>
                    )}

                    {sc.status === "approved" && editingId !== sc.id && (
                      <span className="px-4 py-2 text-sm font-sans text-primary flex items-center gap-1">
                        <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
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
