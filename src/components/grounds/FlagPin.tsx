"use client";

import { motion } from "framer-motion";
import { flagFlutter } from "@/lib/animation";

interface FlagPinProps {
  size?: "sm" | "md" | "lg";
  /** Color of the flag triangle */
  flagColor?: string;
  className?: string;
}

const sizes = {
  sm: { width: 16, height: 32, flagH: 12, poleW: 1.5 },
  md: { width: 24, height: 48, flagH: 18, poleW: 2 },
  lg: { width: 32, height: 64, flagH: 24, poleW: 2.5 },
};

export function FlagPin({
  size = "md",
  flagColor = "var(--board-yellow)",
  className = "",
}: FlagPinProps) {
  const s = sizes[size];

  return (
    <motion.svg
      className={`inline-block ${className}`}
      width={s.width}
      height={s.height}
      viewBox={`0 0 ${s.width} ${s.height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      whileHover={flagFlutter.hover}
      aria-hidden="true"
    >
      {/* Pole */}
      <line
        x1={s.width / 2}
        y1={0}
        x2={s.width / 2}
        y2={s.height}
        stroke="currentColor"
        strokeWidth={s.poleW}
      />
      {/* Flag triangle */}
      <path
        d={`M${s.width / 2} 2 L${s.width - 1} ${s.flagH / 2 + 2} L${s.width / 2} ${s.flagH + 2} Z`}
        fill={flagColor}
      />
      {/* Ground dot */}
      <circle
        cx={s.width / 2}
        cy={s.height - 2}
        r={2}
        fill="currentColor"
        opacity={0.3}
      />
    </motion.svg>
  );
}
