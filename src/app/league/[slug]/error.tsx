"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContourHills } from "@/components/grounds/contours/ContourHills";

export default function LeagueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 text-fairway opacity-[0.06]">
        <ContourHills className="w-full h-full" />
      </div>

      <div className="relative max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <TriangleAlert
              className="w-10 h-10 text-destructive"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            In the Rough
          </h1>
          <p className="text-muted-foreground mb-2 font-sans">
            Something went wrong loading this league page.
          </p>
          {error.digest && (
            <p className="text-xs text-text-light mb-4 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={reset}>
            Try Again
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/leagues">Back to Leagues</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
