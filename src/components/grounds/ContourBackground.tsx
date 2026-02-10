"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ContourHills } from "./contours/ContourHills";
import { ContourTerrain } from "./contours/ContourTerrain";

interface ContourBackgroundProps {
  variant?: "hills" | "terrain";
  /** Tailwind opacity class, e.g. "opacity-[0.04]" */
  opacity?: string;
  /** Tailwind color class for currentColor, e.g. "text-fairway" */
  color?: string;
  /** Enable parallax scroll */
  parallaxEnabled?: boolean;
  className?: string;
}

export function ContourBackground({
  variant = "hills",
  opacity = "opacity-[0.06]",
  color = "text-fairway",
  parallaxEnabled = true,
  className = "",
}: ContourBackgroundProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(
    scrollYProgress,
    [0, 1],
    parallaxEnabled ? ["-5%", "5%"] : ["0%", "0%"]
  );

  const Contour = variant === "hills" ? ContourHills : ContourTerrain;

  return (
    <div
      ref={ref}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <motion.div
        style={{ y }}
        className={`absolute inset-0 ${color} ${opacity}`}
      >
        <Contour className="w-full h-full" />
      </motion.div>
    </div>
  );
}
