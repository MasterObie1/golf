import { BallRollLoader } from "@/components/grounds/BallRollLoader";

export default function LeagueLoading() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <BallRollLoader size="lg" text="Loading league..." />
      </div>
    </div>
  );
}
