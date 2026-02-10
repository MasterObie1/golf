"use client";

import { motion } from "framer-motion";
import { scaleIn } from "@/lib/animation";

interface MedalBadgeProps {
  position: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const medalColors: Record<number, { bg: string; text: string; border: string; glow: string }> = {
  1: {
    bg: "bg-board-yellow",
    text: "text-rough",
    border: "border-board-yellow",
    glow: "shadow-[0_0_12px_rgba(255,215,0,0.3)]",
  },
  2: {
    bg: "bg-[#C0C0C0]",
    text: "text-[#333]",
    border: "border-[#C0C0C0]",
    glow: "shadow-[0_0_8px_rgba(192,192,192,0.3)]",
  },
  3: {
    bg: "bg-[#CD7F32]",
    text: "text-white",
    border: "border-[#CD7F32]",
    glow: "shadow-[0_0_8px_rgba(205,127,50,0.3)]",
  },
};

const sizes = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
};

export function MedalBadge({ position, size = "md", className = "" }: MedalBadgeProps) {
  const medal = medalColors[position];

  if (!medal) {
    // Non-medal positions
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full ${sizes[size]} text-text-muted font-display font-bold ${className}`}
      >
        {position}
      </span>
    );
  }

  return (
    <motion.span
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      className={`inline-flex items-center justify-center rounded-full font-display font-bold
        ${sizes[size]} ${medal.bg} ${medal.text} ${medal.glow} ${className}`}
    >
      {position}
    </motion.span>
  );
}
