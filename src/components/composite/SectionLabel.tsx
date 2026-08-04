import { cn } from "@/lib/utils";

/**
 * The yellow "eyebrow" label used above section headings.
 * Wood-gold in light mode (for contrast on paper), pure board-yellow in dark.
 */
export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-display text-xs font-semibold tracking-[0.35em] uppercase text-wood dark:text-board-yellow",
        className
      )}
      {...props}
    />
  );
}
