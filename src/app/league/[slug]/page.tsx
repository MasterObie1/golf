import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeaguePublicInfo } from "@/lib/actions";
import { isLeagueAdmin } from "@/lib/auth";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const league = await getLeaguePublicInfo(slug);
    return {
      title: league.name,
      description: league.description || `${league.name} golf league on LeagueLinks`,
    };
  } catch {
    return { title: "League" };
  }
}

export default async function LeagueHomePage({ params }: Props) {
  const { slug } = await params;

  let league;
  try {
    league = await getLeaguePublicInfo(slug);
  } catch {
    notFound();
  }

  // Check if current user is admin for this league
  const isAdmin = await isLeagueAdmin(slug);

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-green-dark mb-2">{league.name}</h1>
          {league.courseName && (
            <p className="text-xl text-gray-600">
              {league.courseName}
              {league.courseLocation && ` - ${league.courseLocation}`}
            </p>
          )}
          {(league as { seasons?: { name: string }[] }).seasons?.[0] && (
            <p className="text-sm text-green-600 mt-2 font-medium">
              Current Season: {(league as { seasons?: { name: string }[] }).seasons![0].name}
            </p>
          )}
        </div>

        {/* Quick Links */}
        <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-8`}>
          <Link
            href={`/league/${slug}/leaderboard`}
            className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-2xl mb-1">🏆</div>
            <div className="font-medium text-green-dark">Leaderboard</div>
          </Link>
          <Link
            href={`/league/${slug}/history`}
            className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-2xl mb-1">📋</div>
            <div className="font-medium text-green-dark">Match History</div>
          </Link>
          <Link
            href={`/league/${slug}/signup`}
            className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-2xl mb-1">✍️</div>
            <div className="font-medium text-green-dark">Team Signup</div>
          </Link>
          {isAdmin && (
            <Link
              href={`/league/${slug}/admin`}
              className="bg-white rounded-lg shadow p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-1">⚙️</div>
              <div className="font-medium text-green-dark">Admin</div>
            </Link>
          )}
        </div>

        {/* League Info Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-green-dark mb-4">League Information</h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Schedule */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Schedule</h3>
              <div className="space-y-1 text-gray-600">
                {league.playDay && <p>Plays: {league.playDay}s</p>}
                {league.playTime && <p>Time: {league.playTime}</p>}
                {league.startDate && <p>Starts: {formatDate(league.startDate)}</p>}
                {league.endDate && <p>Ends: {formatDate(league.endDate)}</p>}
                {league.numberOfWeeks && <p>Duration: {league.numberOfWeeks} weeks</p>}
              </div>
            </div>

            {/* Details */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Details</h3>
              <div className="space-y-1 text-gray-600">
                <p>
                  Teams: {league._count.teams} / {league.maxTeams}
                </p>
                <p>
                  Registration:{" "}
                  <span
                    className={
                      league.registrationOpen ? "text-green-600" : "text-red-600"
                    }
                  >
                    {league.registrationOpen ? "Open" : "Closed"}
                  </span>
                </p>
                {league.entryFee !== null && league.entryFee > 0 && (
                  <p>Entry Fee: ${league.entryFee}</p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {league.description && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-medium text-gray-700 mb-2">About</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{league.description}</p>
            </div>
          )}

          {/* Prize Info */}
          {league.prizeInfo && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-medium text-gray-700 mb-2">Prizes</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{league.prizeInfo}</p>
            </div>
          )}

          {/* Contact */}
          {(league.contactEmail || league.contactPhone) && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-medium text-gray-700 mb-2">Contact</h3>
              <div className="space-y-1 text-gray-600">
                {league.contactEmail && <p>Email: {league.contactEmail}</p>}
                {league.contactPhone && <p>Phone: {league.contactPhone}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link href="/leagues" className="text-green-primary hover:text-green-dark">
            &larr; Browse All Leagues
          </Link>
        </div>
      </div>
    </div>
  );
}
