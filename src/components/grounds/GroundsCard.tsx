"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/animation";

interface GroundsCardProps {
  children: ReactNode;
  /** Hover shadow lift effect */
  hoverable?: boolean;
  className?: string;
}

export function GroundsCard({
  children,
  hoverable = true,
  className = "",
}: GroundsCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      className={`
        bg-surface-white rounded-lg border border-border-light
        shadow-sm
        ${hoverable ? "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200" : ""}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
