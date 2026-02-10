"use client";

import { useState, useCallback } from "react";
import { saveHoleScore, submitScorecard } from "@/lib/actions/scorecards";
import ScorecardGrid from "./ScorecardGrid";

interface HoleData {
  id: number;
  holeNumber: number;
  par: number;
  handicapIndex: number;
  yardage: number | null;
}

interface HoleScoreData {
  holeNumber: number;
  strokes: number;
  putts: number | null;
  fairwayHit: boolean | null;
  greenInReg: boolean | null;
}

interface ScorecardEntryProps {
  token: string;
  courseName: string;
  teamName: string;
  weekNumber: number;
  totalPar: number | null;
  holes: HoleData[];
  initialScores: HoleScoreData[];
  status: string;
}

export default function ScorecardEntry({
  token,
  courseName,
  teamName,
  weekNumber,
  totalPar,
  holes,
  initialScores,
  status: initialStatus,
}: ScorecardEntryProps) {
  const [currentHoleIndex, setCurrentHoleIndex] = useState(() => {
    // Start at first hole without a score, or first hole
    const scored = new Set(initialScores.map((s) => s.holeNumber));
    const idx = holes.findIndex((h) => !scored.has(h.holeNumber));
    return idx >= 0 ? idx : 0;
  });
  const [scores, setScores] = useState<Map<number, HoleScoreData>>(() => {
    const map = new Map<number, HoleScoreData>();
    for (const s of initialScores) {
      map.set(s.holeNumber, s);
    }
    return map;
  });
  const [showStats, setShowStats] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(initialStatus === "completed" || initialStatus === "approved");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const currentHole = holes[currentHoleIndex];
  const currentScore = scores.get(currentHole?.holeNumber);

  const holesCompleted = scores.size;
  const grossTotal = Array.from(scores.values()).reduce((sum, s) => sum + s.strokes, 0);
  const parSoFar = Array.from(scores.entries()).reduce((sum, [hn]) => {
    const h = holes.find((x) => x.holeNumber === hn);
    return sum + (h?.par ?? 0);
  }, 0);
  const vsPar = grossTotal - parSoFar;

  const frontNine = Array.from(scores.values())
    .filter((s) => s.holeNumber <= 9)
    .reduce((sum, s) => sum + s.strokes, 0);
  const backNine = Array.from(scores.values())
    .filter((s) => s.holeNumber > 9)
    .reduce((sum, s) => sum + s.strokes, 0) || null;

  const autoSave = useCallback(async (holeNumber: number, data: HoleScoreData) => {
    setSaving(true);
    try {
      await saveHoleScore(token, holeNumber, data.strokes, data.putts, data.fairwayHit, data.greenInReg);
    } catch {
      // Silently fail — will retry on next save
    }
    setSaving(false);
  }, [token]);

  function setStrokesForHole(strokes: number) {
    if (strokes < 1 || strokes > 20) return;
    const hn = currentHole.holeNumber;
    const prev = scores.get(hn);
    const data: HoleScoreData = {
      holeNumber: hn,
      strokes,
      putts: prev?.putts ?? null,
      fairwayHit: prev?.fairwayHit ?? null,
      greenInReg: prev?.greenInReg ?? null,
    };
    setScores(new Map(scores).set(hn, data));
    autoSave(hn, data);
  }

  function updateStat(field: "putts" | "fairwayHit" | "greenInReg", value: number | boolean | null) {
    const hn = currentHole.holeNumber;
    const prev = scores.get(hn);
    if (!prev) return;
    const data = { ...prev, [field]: value };
    setScores(new Map(scores).set(hn, data));
    autoSave(hn, data);
  }

  function goToHole(index: number) {
    if (index >= 0 && index < holes.length) {
      setCurrentHoleIndex(index);
      setShowStats(false);
    }
  }

  async function handleSubmit() {
    if (holesCompleted < holes.length) {
      setMessage({ type: "error", text: `Please enter scores for all ${holes.length} holes.` });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitScorecard(token);
      if (result.success) {
        setSubmitted(true);
        setMessage({ type: "success", text: `Scorecard submitted! Gross: ${result.data.grossTotal}` });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to submit. Please try again." });
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 max-w-md w-full text-center border border-scorecard-line/50">
          <div className="w-16 h-16 mx-auto mb-4 bg-fairway/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-fairway" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold uppercase tracking-wider text-scorecard-pencil mb-2">
            Scorecard Submitted
          </h2>
          <p className="text-text-secondary font-sans mb-4">
            Your scorecard for <strong>{teamName}</strong>, Week {weekNumber} has been submitted.
          </p>
          <div className="bg-surface rounded-lg p-4 mb-4">
            <div className="text-3xl font-mono tabular-nums font-bold text-scorecard-pencil">{grossTotal}</div>
            <div className={`text-sm font-mono tabular-nums ${
              vsPar === 0 ? "text-fairway" : vsPar > 0 ? "text-board-red" : "text-info-text"
            }`}>
              {vsPar === 0 ? "Even par" : vsPar > 0 ? `+${vsPar}` : vsPar} vs par
            </div>
          </div>
          <ScorecardGrid
            holes={holes}
            holeScores={Array.from(scores.values())}
            courseName={courseName}
            totalPar={totalPar}
            grossTotal={grossTotal}
            frontNine={frontNine || null}
            backNine={backNine}
            compact
          />
          <p className="mt-4 text-sm text-text-muted font-sans">
            Your league admin will review and approve your scorecard.
          </p>
        </div>
      </div>
    );
  }

  if (showReview) {
    return (
      <div className="min-h-screen bg-surface p-4">
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-display font-bold uppercase tracking-wider text-scorecard-pencil mb-4 text-center">
            Review Scorecard
          </h2>
          <p className="text-center text-text-secondary font-sans mb-4">
            {teamName} &mdash; Week {weekNumber}
          </p>

          {message && (
            <div className={`mb-4 p-3 rounded-lg font-sans text-sm ${
              message.type === "success"
                ? "bg-fairway/10 border border-fairway/30 text-fairway"
                : "bg-error-bg border border-error-border text-error-text"
            }`}>
              {message.text}
            </div>
          )}

          <ScorecardGrid
            holes={holes}
            holeScores={Array.from(scores.values())}
            courseName={courseName}
            totalPar={totalPar}
            grossTotal={grossTotal}
            frontNine={frontNine || null}
            backNine={backNine}
          />

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setShowReview(false)}
              className="flex-1 py-3 bg-surface-white text-text-secondary border border-border font-display font-semibold uppercase tracking-wider rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || holesCompleted < holes.length}
              className="flex-1 py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <div className="bg-rough text-white px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="font-display font-bold uppercase tracking-wider text-sm">{teamName}</div>
            <div className="text-putting/70 text-xs font-sans">{courseName} &mdash; Week {weekNumber}</div>
          </div>
          <div className="text-right">
            {saving && <div className="text-xs text-putting/50 font-sans">Saving...</div>}
          </div>
        </div>
      </div>

      {/* Running Total Bar */}
      <div className="bg-surface-white border-b border-border px-4 py-2">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-xs font-display uppercase tracking-wider text-text-muted">Gross</span>
              <div className="text-lg font-mono tabular-nums font-bold text-scorecard-pencil">{grossTotal || "-"}</div>
            </div>
            <div>
              <span className="text-xs font-display uppercase tracking-wider text-text-muted">vs Par</span>
              <div className={`text-lg font-mono tabular-nums font-bold ${
                vsPar === 0 ? "text-fairway" : vsPar > 0 ? "text-board-red" : "text-info-text"
              }`}>
                {holesCompleted === 0 ? "-" : vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
              </div>
            </div>
          </div>
          <div className="text-sm font-sans text-text-muted">
            <span className="font-mono tabular-nums font-semibold text-scorecard-pencil">{holesCompleted}</span>/{holes.length} holes
          </div>
        </div>
      </div>

      {/* Hole Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-lg mx-auto w-full">
        {currentHole && (
          <div className="w-full">
            {/* Hole Info */}
            <div className="text-center mb-6">
              <div className="text-6xl font-display font-bold text-scorecard-pencil">
                {currentHole.holeNumber}
              </div>
              <div className="flex items-center justify-center gap-4 mt-2">
                <span className="px-3 py-1 bg-fairway/10 rounded-full text-fairway font-display font-semibold text-sm uppercase tracking-wider">
                  Par {currentHole.par}
                </span>
                <span className="text-text-muted font-sans text-sm">
                  Hcp {currentHole.handicapIndex}
                </span>
                {currentHole.yardage && (
                  <span className="text-text-muted font-sans text-sm">
                    {currentHole.yardage} yds
                  </span>
                )}
              </div>
            </div>

            {/* Score Input */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => setStrokesForHole((currentScore?.strokes ?? currentHole.par) - 1)}
                disabled={(currentScore?.strokes ?? currentHole.par) <= 1}
                className="w-16 h-16 rounded-full bg-surface-white border-2 border-border text-2xl font-bold text-text-secondary hover:border-fairway hover:text-fairway disabled:opacity-30 transition-colors flex items-center justify-center"
                aria-label="Decrease strokes"
              >
                &minus;
              </button>
              <div className="w-24 h-24 rounded-full bg-scorecard-paper border-2 border-scorecard-line flex items-center justify-center shadow-sm">
                <span className={`text-4xl font-mono tabular-nums font-bold ${
                  currentScore
                    ? currentScore.strokes - currentHole.par <= -2
                      ? "text-board-yellow"
                      : currentScore.strokes - currentHole.par === -1
                        ? "text-info-text"
                        : currentScore.strokes - currentHole.par === 0
                          ? "text-fairway"
                          : currentScore.strokes - currentHole.par === 1
                            ? "text-board-red"
                            : "text-board-red"
                    : "text-text-light"
                }`}>
                  {currentScore?.strokes ?? "-"}
                </span>
              </div>
              <button
                onClick={() => setStrokesForHole((currentScore?.strokes ?? currentHole.par) + 1)}
                disabled={(currentScore?.strokes ?? currentHole.par) >= 20}
                className="w-16 h-16 rounded-full bg-surface-white border-2 border-border text-2xl font-bold text-text-secondary hover:border-fairway hover:text-fairway disabled:opacity-30 transition-colors flex items-center justify-center"
                aria-label="Increase strokes"
              >
                +
              </button>
            </div>

            {/* Quick Score Buttons */}
            <div className="flex justify-center gap-2 mb-6">
              {Array.from({ length: 5 }, (_, i) => currentHole.par - 1 + i).filter(v => v >= 1 && v <= 12).map((val) => (
                <button
                  key={val}
                  onClick={() => setStrokesForHole(val)}
                  className={`w-11 h-11 rounded-lg font-mono tabular-nums font-semibold text-sm transition-colors ${
                    currentScore?.strokes === val
                      ? "bg-fairway text-white"
                      : "bg-surface-white border border-border text-text-secondary hover:border-fairway"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>

            {/* Optional Stats */}
            {currentScore && (
              <div className="mb-6">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="text-sm font-display uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showStats ? "Hide Stats" : "More Stats"} {showStats ? "\u2212" : "+"}
                </button>
                {showStats && (
                  <div className="mt-3 p-4 bg-surface-white rounded-lg border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-sans text-text-secondary">Putts</label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3].map((p) => (
                          <button
                            key={p}
                            onClick={() => updateStat("putts", currentScore.putts === p ? null : p)}
                            className={`w-9 h-9 rounded-lg font-mono text-sm transition-colors ${
                              currentScore.putts === p
                                ? "bg-fairway text-white"
                                : "bg-surface border border-border text-text-secondary"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    {currentHole.par >= 4 && (
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-sans text-text-secondary">Fairway Hit</label>
                        <div className="flex items-center gap-2">
                          {[
                            { label: "Y", value: true },
                            { label: "N", value: false },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => updateStat("fairwayHit", currentScore.fairwayHit === opt.value ? null : opt.value)}
                              className={`w-9 h-9 rounded-lg font-display text-sm uppercase transition-colors ${
                                currentScore.fairwayHit === opt.value
                                  ? "bg-fairway text-white"
                                  : "bg-surface border border-border text-text-secondary"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-sans text-text-secondary">GIR</label>
                      <div className="flex items-center gap-2">
                        {[
                          { label: "Y", value: true },
                          { label: "N", value: false },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => updateStat("greenInReg", currentScore.greenInReg === opt.value ? null : opt.value)}
                            className={`w-9 h-9 rounded-lg font-display text-sm uppercase transition-colors ${
                              currentScore.greenInReg === opt.value
                                ? "bg-fairway text-white"
                                : "bg-surface border border-border text-text-secondary"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="border-t border-border bg-surface-white px-4 py-4">
        <div className="max-w-lg mx-auto">
          {/* Hole Dots */}
          <div className="flex justify-center gap-1.5 mb-4">
            {holes.map((h, i) => (
              <button
                key={h.holeNumber}
                onClick={() => goToHole(i)}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i === currentHoleIndex
                    ? "bg-fairway scale-125"
                    : scores.has(h.holeNumber)
                      ? "bg-fairway/40"
                      : "bg-border"
                }`}
                aria-label={`Go to hole ${h.holeNumber}`}
              />
            ))}
          </div>

          {/* Prev/Next Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => goToHole(currentHoleIndex - 1)}
              disabled={currentHoleIndex === 0}
              className="flex-1 py-3 bg-surface border border-border text-text-secondary font-display font-semibold uppercase tracking-wider rounded-lg disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            {currentHoleIndex === holes.length - 1 ? (
              <button
                onClick={() => setShowReview(true)}
                className="flex-1 py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough transition-colors"
              >
                Review
              </button>
            ) : (
              <button
                onClick={() => goToHole(currentHoleIndex + 1)}
                className="flex-1 py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough transition-colors"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
