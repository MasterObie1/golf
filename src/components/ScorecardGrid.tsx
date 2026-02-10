"use client";

import { scoreColor, scoreBg } from "@/lib/format-utils";

interface HoleData {
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
  grossTotal?: number | null;
  frontNine?: number | null;
  backNine?: number | null;
  compact?: boolean;
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
}: ScorecardGridProps) {
  const scoreMap = new Map(holeScores.map((hs) => [hs.holeNumber, hs.strokes]));
  const frontHoles = holes.filter((h) => h.holeNumber <= 9);
  const backHoles = holes.filter((h) => h.holeNumber > 9);
  const hasFront = frontHoles.length > 0;
  const hasBack = backHoles.length > 0;

  const frontPar = frontHoles.reduce((s, h) => s + h.par, 0);
  const backPar = backHoles.reduce((s, h) => s + h.par, 0);

  const py = compact ? "py-1.5" : "py-2";
  const px = compact ? "px-2" : "px-3";
  const textSize = compact ? "text-xs" : "text-sm";

  function renderNineSection(nineHoles: HoleData[], label: string, ninePar: number, nineTotal: number | null | undefined) {
    const nineFilled = nineHoles.filter((h) => scoreMap.has(h.holeNumber)).length;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-center">
          <thead>
            <tr className="bg-rough text-white">
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
            {!compact && (
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
              {nineHoles.map((h) => {
                const strokes = scoreMap.get(h.holeNumber);
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
              })}
              <td className={`${py} ${px} font-mono tabular-nums ${textSize} font-bold text-scorecard-pencil bg-surface/50`}>
                {nineFilled > 0 && nineTotal !== null && nineTotal !== undefined ? nineTotal : "-"}
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
                nineFilled > 0 && nineTotal !== null && nineTotal !== undefined
                  ? nineTotal - ninePar === 0
                    ? "text-fairway"
                    : nineTotal - ninePar > 0
                      ? "text-board-red"
                      : "text-info-text"
                  : "text-text-light"
              }`}>
                {nineFilled > 0 && nineTotal !== null && nineTotal !== undefined
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
        <div className="px-4 py-2 bg-surface border-b border-scorecard-line/30">
          <span className="font-display uppercase tracking-wider text-sm text-text-secondary">{courseName}</span>
        </div>
      )}

      {hasFront && renderNineSection(frontHoles, "Front", frontPar, frontNine ?? null)}
      {hasBack && renderNineSection(backHoles, "Back", backPar, backNine ?? null)}

      {/* Total Row */}
      <div className="flex justify-between items-center px-4 py-3 bg-surface border-t border-scorecard-line/50">
        <span className="font-display uppercase tracking-wider text-sm text-scorecard-pencil font-semibold">Total</span>
        <div className="flex items-center gap-4">
          {totalPar !== null && totalPar !== undefined && (
            <span className="text-sm font-sans text-text-muted">Par {totalPar}</span>
          )}
          <span className="font-mono tabular-nums text-lg font-bold text-scorecard-pencil">
            {grossTotal !== null && grossTotal !== undefined ? grossTotal : "-"}
          </span>
          {grossTotal !== null && grossTotal !== undefined && totalPar !== null && totalPar !== undefined && (
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
        </div>
      </div>
    </div>
  );
}
