"use client";

import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";

/**
 * Global motion configuration provider.
 * Wraps all animated content and respects prefers-reduced-motion.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
