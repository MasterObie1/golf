/**
 * ScorecardGrid — Grid primitive with pencil-weight rules and paper background.
 * Used for data display that should feel like a handwritten scorecard.
 */
import { ReactNode } from "react";

interface ScorecardGridProps {
  children: ReactNode;
  className?: string;
}

export function ScorecardGrid({ children, className = "" }: ScorecardGridProps) {
  return (
    <div
      className={`bg-scorecard-paper rounded-lg overflow-hidden shadow-md border border-scorecard-line/50 ${className}`}
    >
      {children}
    </div>
  );
}

interface ScorecardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function ScorecardHeader({ children, className = "" }: ScorecardHeaderProps) {
  return (
    <div
      className={`px-4 py-2 border-b border-scorecard-line bg-scorecard-paper ${className}`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-muted font-display">
        {children}
      </div>
    </div>
  );
}

interface ScorecardRowProps {
  children: ReactNode;
  highlight?: boolean;
  className?: string;
}

export function ScorecardRow({ children, highlight = false, className = "" }: ScorecardRowProps) {
  return (
    <div
      className={`px-4 py-3 border-b border-scorecard-line/40 last:border-b-0 transition-colors ${
        highlight ? "bg-board-yellow/8" : "hover:bg-bunker/20"
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface ScorecardCellProps {
  children: ReactNode;
  /** Use monospace font for numbers */
  mono?: boolean;
  className?: string;
}

export function ScorecardCell({ children, mono = false, className = "" }: ScorecardCellProps) {
  return (
    <span
      className={`${
        mono ? "font-[var(--font-ibm-plex-mono)] tabular-nums" : ""
      } text-scorecard-pencil ${className}`}
    >
      {children}
    </span>
  );
}
