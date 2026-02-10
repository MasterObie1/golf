"use client";

interface ScorecardSummaryProps {
  teamName: string;
  grossTotal: number | null;
  totalPar: number | null;
  status: string;
  holesCompleted: number;
  totalHoles: number;
  playerName?: string | null;
  compact?: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  in_progress: { bg: "bg-info-bg", text: "text-info-text", label: "In Progress" },
  completed: { bg: "bg-board-yellow/20", text: "text-wood", label: "Completed" },
  approved: { bg: "bg-fairway/10", text: "text-fairway", label: "Approved" },
  rejected: { bg: "bg-error-bg", text: "text-board-red", label: "Rejected" },
};

export default function ScorecardSummary({
  teamName,
  grossTotal,
  totalPar,
  status,
  holesCompleted,
  totalHoles,
  playerName,
  compact = false,
}: ScorecardSummaryProps) {
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.in_progress;
  const vsPar = grossTotal !== null && totalPar !== null ? grossTotal - totalPar : null;

  if (compact) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="font-sans font-medium text-scorecard-pencil">{teamName}</span>
          {playerName && <span className="text-xs text-text-muted font-sans ml-2">({playerName})</span>}
        </div>
        <div className="flex items-center gap-3">
          {grossTotal !== null && (
            <span className="font-mono tabular-nums font-semibold text-scorecard-pencil">{grossTotal}</span>
          )}
          {vsPar !== null && (
            <span className={`font-mono tabular-nums text-sm ${
              vsPar === 0 ? "text-fairway" : vsPar > 0 ? "text-board-red" : "text-info-text"
            }`}>
              {vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-display uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-scorecard-paper rounded-lg border border-scorecard-line/50 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-display font-semibold uppercase tracking-wider text-scorecard-pencil">
            {teamName}
          </div>
          {playerName && (
            <div className="text-xs text-text-muted font-sans">{playerName}</div>
          )}
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-xs font-display font-semibold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div>
          <div className="text-xs font-display uppercase tracking-wider text-text-muted">Gross</div>
          <div className="text-2xl font-mono tabular-nums font-bold text-scorecard-pencil">
            {grossTotal ?? "-"}
          </div>
        </div>
        {vsPar !== null && (
          <div>
            <div className="text-xs font-display uppercase tracking-wider text-text-muted">vs Par</div>
            <div className={`text-2xl font-mono tabular-nums font-bold ${
              vsPar === 0 ? "text-fairway" : vsPar > 0 ? "text-board-red" : "text-info-text"
            }`}>
              {vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs font-display uppercase tracking-wider text-text-muted">Holes</div>
          <div className="text-lg font-mono tabular-nums text-text-secondary">
            {holesCompleted}/{totalHoles}
          </div>
        </div>
      </div>
    </div>
  );
}
