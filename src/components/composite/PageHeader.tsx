import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Right-aligned slot (e.g. SeasonSelector, action buttons) */
  actions?: React.ReactNode;
  /** Slot opposite the back link on the top row (e.g. a sibling-page link) */
  topRight?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel,
  actions,
  topRight,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-8", className)}>
      {(backHref || topRight) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 font-display text-sm tracking-wide uppercase text-fairway hover:text-rough dark:text-putting dark:hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
              {backLabel ?? "Back"}
            </Link>
          ) : (
            <span />
          )}
          {topRight}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && <SectionLabel className="mb-1">{eyebrow}</SectionLabel>}
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
