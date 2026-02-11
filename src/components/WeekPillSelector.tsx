"use client";

interface WeekPillSelectorProps {
  totalWeeks: number;
  selectedWeek: number;
  onWeekChange: (week: number) => void;
  completedWeeks?: Set<number>;
}

export default function WeekPillSelector({
  totalWeeks,
  selectedWeek,
  onWeekChange,
  completedWeeks,
}: WeekPillSelectorProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1">
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
      </div>
    </div>
  );
}
