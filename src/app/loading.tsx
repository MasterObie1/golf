import { BallRollLoader } from "@/components/grounds/BallRollLoader";

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <BallRollLoader size="lg" text="Loading..." />
    </div>
  );
}
