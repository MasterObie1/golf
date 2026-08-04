import { describe, it, expect } from "vitest";
import { leagueNavLinks } from "../../src/lib/league-nav";

const base = {
  slug: "test-league",
  scoringType: "match_play" as string | null,
  scorecardMode: "full" as string | null,
};

function keys(links: ReturnType<typeof leagueNavLinks>) {
  return links.map((l) => l.key);
}

describe("leagueNavLinks", () => {
  it("includes schedule and scorecards for a match-play league with scorecards enabled", () => {
    expect(keys(leagueNavLinks(base))).toEqual([
      "home",
      "leaderboard",
      "history",
      "schedule",
      "scorecards",
      "signup",
    ]);
  });

  it("omits schedule for stroke-play leagues (the page redirects away)", () => {
    const links = leagueNavLinks({ ...base, scoringType: "stroke_play" });
    expect(keys(links)).not.toContain("schedule");
  });

  it("labels history by scoring type", () => {
    expect(
      leagueNavLinks(base).find((l) => l.key === "history")?.label
    ).toBe("Match History");
    expect(
      leagueNavLinks({ ...base, scoringType: "stroke_play" }).find(
        (l) => l.key === "history"
      )?.label
    ).toBe("Score History");
  });

  it("omits scorecards when scorecardMode is disabled", () => {
    const links = leagueNavLinks({ ...base, scorecardMode: "disabled" });
    expect(keys(links)).not.toContain("scorecards");
  });

  it("always includes signup (the page explains closed registration)", () => {
    expect(keys(leagueNavLinks(base))).toContain("signup");
  });

  it("appends admin only for admins", () => {
    expect(keys(leagueNavLinks(base))).not.toContain("admin");
    const links = leagueNavLinks({ ...base, isAdmin: true });
    expect(keys(links)).toContain("admin");
    expect(links[links.length - 1].key).toBe("admin");
  });

  it("builds hrefs from the slug", () => {
    const links = leagueNavLinks(base);
    expect(links.find((l) => l.key === "home")?.href).toBe(
      "/league/test-league"
    );
    expect(links.find((l) => l.key === "leaderboard")?.href).toBe(
      "/league/test-league/leaderboard"
    );
  });

  it("treats hybrid like match play for schedule visibility", () => {
    expect(keys(leagueNavLinks({ ...base, scoringType: "hybrid" }))).toContain(
      "schedule"
    );
  });
});
