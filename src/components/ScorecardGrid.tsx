"use client";

import { useRef, useState } from "react";
import { scoreColor, scoreBg } from "@/lib/format-utils";

interface HoleData {
  id?: number;
  holeNumber: number;
  par: number;
  handicapIndex: number;
  yardage: number | null;
}

interface HoleScoreData {
  holeNumber: number;
  strokes: number;
}

interface ScorecardGridProps {
  holes: HoleData[];
  holeScores: HoleScoreData[];
  courseName?: string;
  totalPar?: number | null;
  /** Read-only mode: precomputed totals. Ignored when `editable` (derived live). */
  grossTotal?: number | null;
  frontNine?: number | null;
  backNine?: number | null;
  compact?: boolean;
  /** Presence switches score cells to inputs with optimistic save. */
  editable?: {
    onSaveHoleScore: (holeNumber: number, strokes: number) => Promise<void>;
    saving?: boolean;
    disabled?: boolean;
  };
}

export default function ScorecardGrid({
  holes,
  holeScores,
  courseName,
  totalPar,
  grossTotal,
  frontNine,
  backNine,
  compact = false,
  editable,
}: ScorecardGridProps) {
  const [localScores, setLocalScores] = useState<Map<number, number>>(() => {
    const map = new Map<number, number>();
    holeScores.forEach((hs) => map.set(hs.holeNumber, hs.strokes));
    return map;
  });
  const [savingHole, setSavingHole] = useState<number | null>(null);
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const skipBlurRef = useRef(false);

  const isEditable = editable !== undefined;
  // Read-only mode renders from props so server-provided data stays canonical;
  // editable mode renders from local state for optimistic updates.
  const scoreMap = isEditable
    ? localScores
    : new Map(holeScores.map((hs) => [hs.holeNumber, hs.strokes]));

  const frontHoles = holes.filter((h) => h.holeNumber <= 9);
  const backHoles = holes.filter((h) => h.holeNumber > 9);
  const hasFront = frontHoles.length > 0;
  const hasBack = backHoles.length > 0;

  const frontPar = frontHoles.reduce((s, h) => s + h.par, 0);
  const backPar = backHoles.reduce((s, h) => s + h.par, 0);

  const sumNine = (nineHoles: HoleData[]) =>
    nineHoles.reduce((s, h) => {
      const score = scoreMap.get(h.holeNumber);
      return score !== undefined ? s + score : s;
    }, 0);

  const frontFilled = frontHoles.filter((h) => scoreMap.has(h.holeNumber)).length;
  const backFilled = backHoles.filter((h) => scoreMap.has(h.holeNumber)).length;

  const effFrontNine = isEditable ? sumNine(frontHoles) : frontNine ?? null;
  const effBackNine = isEditable ? sumNine(backHoles) : backNine ?? null;
  const effGrossTotal = isEditable
    ? frontFilled + backFilled > 0
      ? sumNine(frontHoles) + sumNine(backHoles)
      : null
    : grossTotal ?? null;

  const py = compact ? "py-1.5" : "py-2";
  const px = compact ? "px-2" : "px-3";
  const textSize = compact ? "text-xs" : "text-sm";

  async function handleSave(holeNumber: number, value: string) {
    if (!editable) return;
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
      await editable.onSaveHoleScore(holeNumber, strokes);
    } finally {
      setSavingHole(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, holeNumber: number) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      skipBlurRef.current = true;
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
      skipBlurRef.current = false;
    }
  }

  function renderScoreCell(h: HoleData) {
    const strokes = scoreMap.get(h.holeNumber);

    if (isEditable) {
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
            defaultValue={strokes ?? ""}
            disabled={editable?.disabled}
            onBlur={(e) => { if (!skipBlurRef.current && e.target.value) handleSave(h.holeNumber, e.target.value); }}
            onKeyDown={(e) => handleKeyDown(e, h.holeNumber)}
            className={`w-10 h-8 text-center font-mono tabular-nums text-sm font-semibold rounded border transition-colors
              ${isSaving ? "border-primary bg-fairway/10" : "border-scorecard-line/50 bg-scorecard-paper hover:border-primary/50"}
              ${strokes !== undefined ? `${scoreColor(strokes, h.par)} ${scoreBg(strokes, h.par)}` : "text-text-muted"}
              focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary
              disabled:opacity-50 disabled:cursor-not-allowed
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        </td>
      );
    }

    return (
      <td
        key={h.holeNumber}
        className={`${py} ${px} font-mono tabular-nums ${textSize} font-semibold ${
          strokes !== undefined
            ? `${scoreColor(strokes, h.par)} ${scoreBg(strokes, h.par)}`
            : "text-text-light"
        }`}
      >
        {strokes !== undefined ? strokes : "-"}
      </td>
    );
  }

  function renderNineSection(nineHoles: HoleData[], label: string, ninePar: number, nineTotal: number | null | undefined) {
    const nineFilled = nineHoles.filter((h) => scoreMap.has(h.holeNumber)).length;
    const showTotal = nineFilled > 0 && nineTotal !== null && nineTotal !== undefined;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-center">
          <thead>
            <tr className="dark bg-rough text-white">
              <th className={`${py} ${px} font-display uppercase tracking-wider ${textSize} text-left`}>{label}</th>
              {nineHoles.map((h) => (
                <th key={h.holeNumber} className={`${py} ${px} font-display uppercase tracking-wider ${textSize} w-10`}>
                  {h.holeNumber}
                </th>
              ))}
              <th className={`${py} ${px} font-display uppercase tracking-wider ${textSize} w-12 bg-rough/90`}>Tot</th>
            </tr>
          </thead>
          <tbody>
            {/* Par Row */}
            <tr className="bg-fairway/10 border-b border-scorecard-line/30">
              <td className={`${py} ${px} font-display uppercase tracking-wider ${textSize} text-left text-text-secondary`}>Par</td>
              {nineHoles.map((h) => (
                <td key={h.holeNumber} className={`${py} ${px} font-mono tabular-nums ${textSize} text-text-secondary`}>
                  {h.par}
                </td>
              ))}
              <td className={`${py} ${px} font-mono tabular-nums ${textSize} font-semibold text-text-secondary`}>
                {ninePar}
              </td>
            </tr>
            {/* Handicap Row */}
            {!compact && !isEditable && (
              <tr className="bg-surface border-b border-scorecard-line/30">
                <td className={`${py} ${px} font-display uppercase tracking-wider ${textSize} text-left text-text-muted`}>Hcp</td>
                {nineHoles.map((h) => (
                  <td key={h.holeNumber} className={`${py} ${px} font-mono tabular-nums ${textSize} text-text-muted`}>
                    {h.handicapIndex}
                  </td>
                ))}
                <td className={`${py} ${px}`}></td>
              </tr>
            )}
            {/* Score Row */}
            <tr className="border-b border-scorecard-line/30">
              <td className={`${py} ${px} font-display uppercase tracking-wider ${textSize} text-left text-scorecard-pencil font-semibold`}>Score</td>
              {nineHoles.map((h) => renderScoreCell(h))}
              <td className={`${py} ${px} font-mono tabular-nums ${textSize} font-bold text-scorecard-pencil bg-surface/50`}>
                {showTotal ? nineTotal : "-"}
              </td>
            </tr>
            {/* +/- Row */}
            <tr>
              <td className={`${py} ${px} font-display uppercase tracking-wider ${textSize} text-left text-text-muted`}>+/-</td>
              {nineHoles.map((h) => {
                const strokes = scoreMap.get(h.holeNumber);
                if (strokes === undefined) {
                  return <td key={h.holeNumber} className={`${py} ${px} ${textSize} text-text-light`}>-</td>;
                }
                const diff = strokes - h.par;
                return (
                  <td
                    key={h.holeNumber}
                    className={`${py} ${px} font-mono tabular-nums ${textSize} ${scoreColor(strokes, h.par)}`}
                  >
                    {diff === 0 ? "E" : diff > 0 ? `+${diff}` : diff}
                  </td>
                );
              })}
              <td className={`${py} ${px} font-mono tabular-nums ${textSize} font-semibold ${
                showTotal
                  ? nineTotal - ninePar === 0
                    ? "text-fairway"
                    : nineTotal - ninePar > 0
                      ? "text-board-red dark:text-error"
                      : "text-info-text"
                  : "text-text-light"
              }`}>
                {showTotal
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
          {editable?.saving && (
            <span className="text-xs font-sans text-text-muted animate-pulse">Saving...</span>
          )}
        </div>
      )}

      {hasFront && renderNineSection(frontHoles, "Front", frontPar, effFrontNine)}
      {hasBack && renderNineSection(backHoles, "Back", backPar, effBackNine)}

      {/* Total Row */}
      <div className="flex justify-between items-center px-4 py-3 bg-surface border-t border-scorecard-line/50">
        <span className="font-display uppercase tracking-wider text-sm text-scorecard-pencil font-semibold">Total</span>
        <div className="flex items-center gap-4">
          {totalPar !== null && totalPar !== undefined && (
            <span className="text-sm font-sans text-text-muted">Par {totalPar}</span>
          )}
          <span className="font-mono tabular-nums text-lg font-bold text-scorecard-pencil">
            {effGrossTotal !== null && effGrossTotal !== undefined ? effGrossTotal : "-"}
          </span>
          {effGrossTotal !== null && effGrossTotal !== undefined && totalPar !== null && totalPar !== undefined && (
            <span className={`font-mono tabular-nums text-sm font-semibold ${
              effGrossTotal - totalPar === 0
                ? "text-fairway"
                : effGrossTotal - totalPar > 0
                  ? "text-board-red dark:text-error"
                  : "text-info-text"
            }`}>
              ({effGrossTotal - totalPar === 0 ? "E" : effGrossTotal - totalPar > 0 ? `+${effGrossTotal - totalPar}` : effGrossTotal - totalPar})
            </span>
          )}
          {isEditable && (
            <span className="text-xs font-sans text-text-muted">
              {frontFilled + backFilled}/{holes.length} holes
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
