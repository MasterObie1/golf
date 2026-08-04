import { notFound } from "next/navigation";
import { getLeagueCached } from "@/lib/league-cache";
import { leagueNavLinks } from "@/lib/league-nav";
import { isLeagueAdmin } from "@/lib/auth";
import { LeagueNav } from "@/components/LeagueNav";

interface LeagueLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function LeagueLayout({
  children,
  params,
}: LeagueLayoutProps) {
  const { slug } = await params;

  const [league, isAdmin] = await Promise.all([
    getLeagueCached(slug),
    isLeagueAdmin(slug),
  ]);
  if (!league) {
    return children; // TEMP-TEST: let page-level notFound fire instead
  }

  const links = leagueNavLinks({
    slug,
    scoringType: league.scoringType,
    scorecardMode: league.scorecardMode,
    isAdmin,
  });

  return (
    <>
      <LeagueNav links={links} />
      {children}
    </>
  );
}
