"use client";

import { useRef, useState } from "react";
import { scoreColor, scoreBg } from "@/lib/format-utils";

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
}

interface AdminScorecardGridProps {
  holes: HoleData[];
  holeScores: HoleScoreData[];
  courseName?: string;
  totalPar: number | null;
  onSaveHoleScore: (holeNumber: number, strokes: number) => Promise<void>;
  saving?: boolean;
  disabled?: boolean;
}

export default function AdminScorecardGrid({
  holes,
  holeScores,
  courseName,
  totalPar,
  onSaveHoleScore,
  saving = false,
  disabled = false,
}: AdminScorecardGridProps) {
  const [localScores, setLocalScores] = useState<Map<number, number>>(() => {
    const map = new Map<number, number>();
    holeScores.forEach((hs) => map.set(hs.holeNumber, hs.strokes));
    return map;
  });
  const [savingHole, setSavingHole] = useState<number | null>(null);
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const frontHoles = holes.filter((h) => h.holeNumber <= 9);
  const backHoles = holes.filter((h) => h.holeNumber > 9);
  const hasFront = frontHoles.length > 0;
  const hasBack = backHoles.length > 0;

  const frontPar = frontHoles.reduce((s, h) => s + h.par, 0);
  const backPar = backHoles.reduce((s, h) => s + h.par, 0);

  const frontTotal = frontHoles.reduce((s, h) => {
    const score = localScores.get(h.holeNumber);
    return score !== undefined ? s + score : s;
  }, 0);
  const backTotal = backHoles.reduce((s, h) => {
    const score = localScores.get(h.holeNumber);
    return score !== undefined ? s + score : s;
  }, 0);
  const grossTotal = frontTotal + backTotal;
  const frontFilled = frontHoles.filter((h) => localScores.has(h.holeNumber)).length;
  const backFilled = backHoles.filter((h) => localScores.has(h.holeNumber)).length;

  async function handleSave(holeNumber: number, value: string) {
    const strokes = parseInt(value);
    if (isNaN(strokes) || strokes < 1 || strokes > 20) return;

    // Update local state optimistically
    setLocalScores((prev) => {
      const next = new Map(prev);
      next.set(holeNumber, strokes);
      return next;
    });

    setSavingHole(holeNumber);
    try {
      await onSaveHoleScore(holeNumber, strokes);
    } finally {
      setSavingHole(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, holeNumber: number) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      // Save current value
      const target = e.target as HTMLInputElement;
      if (target.value) {
        handleSave(holeNumber, target.value);
      }
      // Advance to next/previous hole
      const allHoleNumbers = holes.map((h) => h.holeNumber).sort((a, b) => a - b);
      const idx = allHoleNumbers.indexOf(holeNumber);
      const direction = e.shiftKey ? -1 : 1;
      const nextIdx = idx + direction;
      if (nextIdx >= 0 && nextIdx < allHoleNumbers.length) {
        const nextHole = allHoleNumbers[nextIdx];
        inputRefs.current.get(nextHole)?.focus();
        inputRefs.current.get(nextHole)?.select();
      }
    }
  }

  function renderNineSection(nineHoles: HoleData[], label: string, ninePar: number, nineTotal: number, nineFilled: number) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-center">
          <thead>
            <tr className="bg-rough text-white">
              <th className="py-1.5 px-2 font-display uppercase tracking-wider text-xs text-left">{label}</th>
              {nineHoles.map((h) => (
                <th key={h.holeNumber} className="py-1.5 px-1 font-display uppercase tracking-wider text-xs w-10">
                  {h.holeNumber}
                </th>
              ))}
              <th className="py-1.5 px-2 font-display uppercase tracking-wider text-xs w-12 bg-rough/90">Tot</th>
            </tr>
          </thead>
          <tbody>
            {/* Par Row */}
            <tr className="bg-fairway/10 border-b border-scorecard-line/30">
              <td className="py-1.5 px-2 font-display uppercase tracking-wider text-xs text-left text-text-secondary">Par</td>
              {nineHoles.map((h) => (
                <td key={h.holeNumber} className="py-1.5 px-1 font-mono tabular-nums text-xs text-text-secondary">
                  {h.par}
                </td>
              ))}
              <td className="py-1.5 px-2 font-mono tabular-nums text-xs font-semibold text-text-secondary">
                {ninePar}
              </td>
            </tr>
            {/* Score Row — Editable Inputs */}
            <tr className="border-b border-scorecard-line/30">
              <td className="py-1.5 px-2 font-display uppercase tracking-wider text-xs text-left text-scorecard-pencil font-semibold">Score</td>
              {nineHoles.map((h) => {
                const score = localScores.get(h.holeNumber);
                const isSaving = savingHole === h.holeNumber;
                return (
                  <td key={h.holeNumber} className="py-1 px-0.5">
                    <input
                      ref={(el) => {
                        if (el) inputRefs.current.set(h.holeNumber, el);
                      }}
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={score ?? ""}
                      disabled={disabled || saving}
                      onBlur={(e) => e.target.value && handleSave(h.holeNumber, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, h.holeNumber)}
                      className={`w-10 h-8 text-center font-mono tabular-nums text-sm font-semibold rounded border transition-colors
                        ${isSaving ? "border-fairway bg-fairway/10" : "border-scorecard-line/50 bg-scorecard-paper hover:border-fairway/50"}
                        ${score !== undefined ? `${scoreColor(score, h.par)} ${scoreBg(score, h.par)}` : "text-text-muted"}
                        focus:outline-none focus:ring-2 focus:ring-fairway/40 focus:border-fairway
                        disabled:opacity-50 disabled:cursor-not-allowed
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                    />
                  </td>
                );
              })}
              <td className="py-1.5 px-2 font-mono tabular-nums text-sm font-bold text-scorecard-pencil bg-surface/50">
                {nineFilled > 0 ? nineTotal : "-"}
              </td>
            </tr>
            {/* +/- Row */}
            <tr>
              <td className="py-1.5 px-2 font-display uppercase tracking-wider text-xs text-left text-text-muted">+/-</td>
              {nineHoles.map((h) => {
                const strokes = localScores.get(h.holeNumber);
                if (strokes === undefined) {
                  return <td key={h.holeNumber} className="py-1.5 px-1 text-xs text-text-light">-</td>;
                }
                const diff = strokes - h.par;
                return (
                  <td key={h.holeNumber} className={`py-1.5 px-1 font-mono tabular-nums text-xs ${scoreColor(strokes, h.par)}`}>
                    {diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff}
                  </td>
                );
              })}
              <td className={`py-1.5 px-2 font-mono tabular-nums text-xs font-semibold ${
                nineFilled > 0
                  ? nineTotal - ninePar === 0
                    ? "text-fairway"
                    : nineTotal - ninePar > 0
                      ? "text-board-red"
                      : "text-info-text"
                  : "text-text-light"
              }`}>
                {nineFilled > 0
                  ? nineTotal - ninePar === 0
                    ? "E"
                    : nineTotal - ninePar > 0
                      ? `+${nineTotal - ninePar}`
                      : nineTotal - ninePar
                  : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="bg-scorecard-paper rounded-lg border border-scorecard-line/50 overflow-hidden">
      {courseName && (
        <div className="px-4 py-2 bg-surface border-b border-scorecard-line/30 flex items-center justify-between">
          <span className="font-display uppercase tracking-wider text-sm text-text-secondary">{courseName}</span>
          {saving && (
            <span className="text-xs font-sans text-text-muted animate-pulse">Saving...</span>
          )}
        </div>
      )}

      {hasFront && renderNineSection(frontHoles, "Front", frontPar, frontTotal, frontFilled)}
      {hasBack && renderNineSection(backHoles, "Back", backPar, backTotal, backFilled)}

      {/* Total Row */}
      <div className="flex justify-between items-center px-4 py-3 bg-surface border-t border-scorecard-line/50">
        <span className="font-display uppercase tracking-wider text-sm text-scorecard-pencil font-semibold">Total</span>
        <div className="flex items-center gap-4">
          {totalPar !== null && totalPar !== undefined && (
            <span className="text-sm font-sans text-text-muted">Par {totalPar}</span>
          )}
          <span className="font-mono tabular-nums text-lg font-bold text-scorecard-pencil">
            {frontFilled + backFilled > 0 ? grossTotal : "-"}
          </span>
          {frontFilled + backFilled > 0 && totalPar !== null && totalPar !== undefined && (
            <span className={`font-mono tabular-nums text-sm font-semibold ${
              grossTotal - totalPar === 0
                ? "text-fairway"
                : grossTotal - totalPar > 0
                  ? "text-board-red"
                  : "text-info-text"
            }`}>
              ({grossTotal - totalPar === 0 ? "E" : grossTotal - totalPar > 0 ? `+${grossTotal - totalPar}` : grossTotal - totalPar})
            </span>
          )}
          <span className="text-xs font-sans text-text-muted">
            {frontFilled + backFilled}/{holes.length} holes
          </span>
        </div>
      </div>
    </div>
  );
}
