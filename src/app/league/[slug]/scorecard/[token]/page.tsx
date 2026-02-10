import { getScorecardByToken } from "@/lib/actions/scorecards";
import ScorecardEntry from "@/components/ScorecardEntry";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string; token: string }>;
}

export const metadata: Metadata = {
  title: "Enter Scorecard - LeagueLinks",
};

export default async function ScorecardPage({ params }: Props) {
  const { token } = await params;

  const result = await getScorecardByToken(token);

  if (!result.success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-scorecard-paper rounded-lg shadow-lg p-6 max-w-md w-full text-center border border-scorecard-line/50">
          <div className="w-16 h-16 mx-auto mb-4 bg-error-bg rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-board-red" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-display font-bold uppercase tracking-wider text-scorecard-pencil mb-2">
            Scorecard Unavailable
          </h2>
          <p className="text-text-secondary font-sans text-sm">
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  const { data } = result;

  return (
    <ScorecardEntry
      token={token}
      courseName={data.course.name}
      teamName={data.teamName}
      weekNumber={data.weekNumber}
      totalPar={data.course.totalPar}
      holes={data.course.holes}
      initialScores={data.holeScores}
      status={data.status}
    />
  );
}
