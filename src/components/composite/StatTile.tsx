import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "./SectionLabel";

interface StatTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small line under the value (e.g. trend, context) */
  hint?: React.ReactNode;
  className?: string;
}

export function StatTile({ label, value, hint, className }: StatTileProps) {
  return (
    <Card className={cn("gap-1 px-5 py-4", className)}>
      <SectionLabel className="tracking-[0.2em]">{label}</SectionLabel>
      <p className="font-mono text-3xl font-bold text-foreground tabular-nums">
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
