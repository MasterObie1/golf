"use client";

import { motion } from "framer-motion";
import { easing } from "@/lib/animation";

interface MovementArrowProps {
  change: number | null | undefined;
  /** Invert direction (positive = down, like handicap) */
  inverted?: boolean;
  label: string;
  className?: string;
}

export function MovementArrow({
  change,
  inverted = false,
  label,
  className = "",
}: MovementArrowProps) {
  if (change === null || change === undefined) {
    return null;
  }

  if (change === 0) {
    return (
      <span
        className={`inline-flex items-center text-xs text-text-muted ml-1 ${className}`}
        aria-label={`${label} unchanged`}
      >
        —
      </span>
    );
  }

  const isPositive = inverted ? change < 0 : change > 0;
  const absChange = Math.abs(change);
  const direction = isPositive ? "up" : "down";

  return (
    <motion.span
      initial={{ opacity: 0, y: isPositive ? 8 : -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easing.flutter}
      className={`inline-flex items-center text-xs ml-1 ${
        isPositive ? "text-fairway" : "text-board-red"
      } ${className}`}
      role="img"
      aria-label={`${label} ${direction} ${absChange}`}
    >
      <svg
        className="w-3 h-3"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        {isPositive ? (
          <path
            fillRule="evenodd"
            d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        )}
      </svg>
      <span className="font-display font-bold">{absChange}</span>
    </motion.span>
  );
}
