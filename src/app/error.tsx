"use client";

import Link from "next/link";
import { ContourHills } from "@/components/grounds/contours/ContourHills";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 text-fairway opacity-[0.06]">
        <ContourHills className="w-full h-full" />
      </div>

      <div className="relative max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-board-red/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-board-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-3xl font-display font-bold text-scorecard-pencil mb-2 uppercase tracking-wider">
            In the Rough
          </h1>
          <p className="text-text-secondary mb-2 font-sans">
            Something went wrong. Your shot landed somewhere unexpected.
          </p>
          {error.digest && (
            <p className="text-xs text-text-light mb-4 font-mono">Error ID: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-fairway text-white font-display font-semibold uppercase tracking-wider rounded-lg hover:bg-rough transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 bg-surface-white text-fairway font-display font-semibold uppercase tracking-wider rounded-lg border border-fairway hover:bg-surface transition-colors"
          >
            Back to Clubhouse
          </Link>
        </div>
      </div>
    </div>
  );
}
