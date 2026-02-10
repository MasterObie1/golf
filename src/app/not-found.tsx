import Link from "next/link";
import { ContourHills } from "@/components/grounds/contours/ContourHills";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 text-fairway opacity-[0.06]">
        <ContourHills className="w-full h-full" />
      </div>

      <div className="relative max-w-md w-full text-center">
        <div className="mb-6">
          <div className="text-8xl font-display font-bold text-fairway/15 mb-2">
            404
          </div>
          <h1 className="text-3xl font-display font-bold text-scorecard-pencil mb-2 uppercase tracking-wider">
            Lost Ball
          </h1>
          <p className="text-text-secondary font-sans">
            We couldn&apos;t find the page you&apos;re looking for. It may have been moved or doesn&apos;t exist.
          </p>
        </div>
        {/* Golf ball animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative w-32 h-1.5 bg-putting/20 rounded-full overflow-hidden">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-surface-white border border-scorecard-line animate-ball-roll"
              style={{ boxShadow: "inset -1px -1px 2px rgba(0,0,0,0.15)" }}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough transition-colors"
          >
            Back to Clubhouse
          </Link>
          <Link
            href="/leagues"
            className="px-6 py-3 bg-surface-white text-fairway font-display font-semibold uppercase tracking-wider rounded-lg border border-fairway hover:bg-surface transition-colors"
          >
            Find a League
          </Link>
        </div>
      </div>
    </div>
  );
}
