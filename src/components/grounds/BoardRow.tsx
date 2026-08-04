"use client";

import { MedalBadge } from "./MedalBadge";
import { MovementArrow } from "./MovementArrow";
import { formatPosition } from "@/lib/format-utils";
import Link from "next/link";

interface BoardRowProps {
  index: number;
  team: {
    id: number;
    name: string;
    totalPoints: number;
    wins: number;
    losses: number;
    ties: number;
    handicap: number | null;
    roundsPlayed: number;
    rankChange?: number | null;
    handicapChange?: number | null;
    avgNet?: number;
    bestFinish?: number;
    matchPoints?: number;
    fieldPoints?: number;
  };
  leagueSlug: string;
  scoringType: "match_play" | "stroke_play" | "hybrid";
  hideMovement?: boolean;
}

export function BoardRow({
  index,
  team,
  leagueSlug,
  scoringType,
  hideMovement = false,
}: BoardRowProps) {
  const isMatchPlay = scoringType === "match_play";
  const isStrokePlay = scoringType === "stroke_play";
  const isHybrid = scoringType === "hybrid";

  const rowBg = index % 2 === 0 ? "bg-scorecard-paper" : "bg-bunker/10";

  return (
    // Time-gated CSS entrance (never visibility-gated): rows must always
    // become visible even when no IntersectionObserver fires.
    <tr
      className={`board-row-in border-b border-scorecard-line/30 transition-colors hover:bg-bunker/20 dark:hover:bg-white/5 ${rowBg}`}
      style={{ animationDelay: `${Math.min(index * 40, 600)}ms` }}
    >
      {/* Rank */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          <MedalBadge position={index + 1} size="sm" />
          {!hideMovement && (
            <MovementArrow change={team.rankChange} label="Rank" />
          )}
        </div>
      </td>

      {/* Team Name */}
      <td className="py-3 px-4">
        {team.id > 0 ? (
          <Link
            href={`/league/${leagueSlug}/team/${team.id}`}
            className="font-sans font-medium text-primary hover:text-rough dark:hover:text-board-yellow hover:underline transition-colors"
          >
            {team.name}
          </Link>
        ) : (
          <span className="font-sans font-medium text-primary">
            {team.name}
          </span>
        )}
      </td>

      {/* Handicap */}
      <td className="py-3 px-4 text-center">
        <div className="inline-flex items-center gap-1">
          <span className="font-mono text-scorecard-pencil tabular-nums">
            {team.handicap != null ? team.handicap : "\u2014"}
          </span>
          {!hideMovement && (
            <MovementArrow
              change={team.handicapChange}
              inverted={true}
              label="Handicap"
            />
          )}
        </div>
      </td>

      {/* Rounds */}
      <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-scorecard-pencil tabular-nums">
        {team.roundsPlayed}
      </td>

      {/* Points — highlighted */}
      <td className="py-3 px-4 text-center bg-fairway/10 dark:bg-board-yellow/10">
        <span className="font-mono font-bold text-primary tabular-nums text-lg">
          {team.totalPoints}
        </span>
      </td>

      {/* Scoring-type-specific columns */}
      {isMatchPlay && (
        <>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-primary tabular-nums">
            {team.wins}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-board-red dark:text-error tabular-nums">
            {team.losses}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-text-muted tabular-nums">
            {team.ties}
          </td>
        </>
      )}
      {isStrokePlay && (
        <>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-scorecard-pencil tabular-nums">
            {team.avgNet ?? "\u2014"}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-scorecard-pencil tabular-nums">
            {team.bestFinish != null && team.bestFinish > 0 ? formatPosition(team.bestFinish) : "\u2014"}
          </td>
        </>
      )}
      {isHybrid && (
        <>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-scorecard-pencil tabular-nums">
            {team.matchPoints ?? 0}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-scorecard-pencil tabular-nums">
            {team.fieldPoints ?? 0}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-primary tabular-nums">
            {team.wins}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-board-red dark:text-error tabular-nums">
            {team.losses}
          </td>
          <td className="hidden sm:table-cell py-3 px-4 text-center font-mono text-text-muted tabular-nums">
            {team.ties}
          </td>
        </>
      )}
    </tr>
  );
}
