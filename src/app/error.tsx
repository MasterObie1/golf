"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--green-dark)] mb-2" style={{ fontFamily: "var(--font-playfair)" }}>
            In the Rough
          </h1>
          <p className="text-gray-600 mb-2">
            Something went wrong. Your shot landed somewhere unexpected.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 mb-4">Error ID: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[var(--green-primary)] text-white font-semibold rounded-lg hover:bg-[var(--green-dark)] transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 bg-white text-[var(--green-primary)] font-semibold rounded-lg border border-[var(--green-primary)] hover:bg-[var(--bg-primary)] transition-colors"
          >
            Back to Clubhouse
          </Link>
        </div>
      </div>
    </div>
  );
}
