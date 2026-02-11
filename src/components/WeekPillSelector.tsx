"use client";

interface WeekPillSelectorProps {
  totalWeeks: number;
  selectedWeek: number;
  onWeekChange: (week: number) => void;
  completedWeeks?: Set<number>;
  showAddButton?: boolean;
}

export default function WeekPillSelector({
  totalWeeks,
  selectedWeek,
  onWeekChange,
  completedWeeks,
  showAddButton = true,
}: WeekPillSelectorProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto py-1">
      <span className="font-display font-medium text-text-secondary uppercase tracking-wider text-sm flex-shrink-0">
        Week
      </span>
      <div className="flex gap-1.5 flex-nowrap">
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => {
          const isSelected = week === selectedWeek;
          const isCompleted = completedWeeks?.has(week) ?? false;

          return (
            <button
              key={week}
              onClick={() => onWeekChange(week)}
              className={`h-8 min-w-[2rem] px-2 rounded-full text-sm font-mono tabular-nums font-semibold transition-colors flex-shrink-0 ${
                isSelected
                  ? "bg-fairway text-white ring-2 ring-fairway/30"
                  : isCompleted
                    ? "bg-fairway/10 text-fairway border border-fairway/30 hover:bg-fairway/20"
                    : "bg-surface text-text-secondary border border-scorecard-line/50 hover:bg-surface-warm"
              }`}
            >
              {week}
            </button>
          );
        })}
        {showAddButton && (
          <button
            onClick={() => onWeekChange(totalWeeks + 1)}
            className="h-8 min-w-[2rem] px-2 rounded-full text-sm font-mono font-semibold transition-colors flex-shrink-0 bg-surface text-text-muted border border-dashed border-scorecard-line/50 hover:border-fairway hover:text-fairway"
            title="Go to next week"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
