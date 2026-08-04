import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "items-center justify-center gap-2 border-dashed px-6 py-12 text-center shadow-none",
        className
      )}
    >
      {Icon && (
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon
            className="size-6 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
        </div>
      )}
      <p className="font-display text-lg font-semibold tracking-wide uppercase text-foreground">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}
