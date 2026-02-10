"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Season {
  id: number;
  name: string;
  year: number;
  seasonNumber: number;
  isActive: boolean;
}

interface SeasonSelectorProps {
  seasons: Season[];
  currentSeasonId: number | null;
  leagueSlug: string;
  showAllTime?: boolean;
}

export function SeasonSelector({
  seasons,
  currentSeasonId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  leagueSlug,
  showAllTime = false,
}: SeasonSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all-time") {
      params.set("view", "all-time");
      params.delete("seasonId");
    } else if (value) {
      params.set("seasonId", value);
      params.delete("view");
    } else {
      params.delete("seasonId");
      params.delete("view");
    }

    router.push(`?${params.toString()}`);
  };

  const currentValue = searchParams.get("view") === "all-time"
    ? "all-time"
    : currentSeasonId?.toString() || "";

  if (seasons.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="season-select" className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">
        Season:
      </label>
      <select
        id="season-select"
        value={currentValue}
        onChange={handleSeasonChange}
        className="px-3 py-1.5 border-b-2 border-scorecard-line bg-surface-white text-sm text-scorecard-pencil font-sans focus:outline-none focus:border-fairway transition-colors rounded-none appearance-none cursor-pointer"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id.toString()}>
            {season.name}
            {season.isActive ? " (Current)" : ""}
          </option>
        ))}
        {showAllTime && (
          <option value="all-time">All-Time Stats</option>
        )}
      </select>
    </div>
  );
}
