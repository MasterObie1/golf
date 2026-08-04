import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PageSkeletonProps {
  /** Number of content rows to hint at (default 8) */
  rows?: number;
  /** Render a table-shaped block (header band + striped rows) */
  variant?: "table" | "cards";
  className?: string;
}

/**
 * Route-level loading skeleton shaped like a league page:
 * back-link + title + season selector, then a content block.
 * Rendered inside the persistent league layout, so the nav stays put.
 */
export function PageSkeleton({
  rows = 8,
  variant = "table",
  className,
}: PageSkeletonProps) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Skeleton className="h-4 w-40 mb-5" />
        <div className="flex items-end justify-between mb-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Skeleton className="h-4 w-52 mb-8" />

        {variant === "table" ? (
          <div className="rounded-lg overflow-hidden border border-border">
            <Skeleton className="h-11 w-full rounded-none" />
            <div className="space-y-0 divide-y divide-border">
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 bg-card">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <div className="ml-auto flex gap-6">
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from({ length: Math.ceil(rows / 2) }).map((_, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-border">
                <Skeleton className="h-11 w-full rounded-none" />
                <div className="p-4 space-y-3 bg-card">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
