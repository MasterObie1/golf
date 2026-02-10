/**
 * Animation presets for "The Grounds" design system.
 * Central config for timing, easing curves, and stagger patterns.
 */

// Custom easing curves
export const easing = {
  // Slow start, fast through, gentle stop — like a golf swing
  swing: [0.22, 0.68, 0.36, 1.0] as const,
  // Ball deceleration — fast start, gradual stop
  roll: [0.0, 0.55, 0.45, 1.0] as const,
  // Spring-like flutter for flags and badges
  flutter: { type: "spring" as const, stiffness: 300, damping: 20 },
  // Gentle spring for layout animations
  gentle: { type: "spring" as const, stiffness: 120, damping: 18 },
  // Snappy spring for interactive elements
  snappy: { type: "spring" as const, stiffness: 400, damping: 25 },
};

// Duration presets (seconds)
export const duration = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.35,
  slow: 0.5,
  dramatic: 0.8,
  stately: 1.2,
};

// Stagger configurations
export const stagger = {
  // Fast stagger for list items (leaderboard rows)
  list: 0.05,
  // Medium stagger for card grids
  cards: 0.08,
  // Slow stagger for dramatic reveals
  dramatic: 0.12,
};

// Reusable animation variants
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.normal, ease: easing.swing },
  },
};

export const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.swing },
  },
};

export const slideInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: easing.swing },
  },
};

export const slideInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: easing.swing },
  },
};

// Leaderboard row entry — slide from right with stagger
export const boardRow = {
  hidden: { opacity: 0, x: 60 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * stagger.list,
      duration: duration.slow,
      ease: easing.swing,
    },
  }),
};

// Container that staggers its children
export const staggerContainer = (staggerAmount = stagger.list) => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: staggerAmount,
    },
  },
});

// Scale in for badges and medals
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.7 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: easing.flutter,
  },
};

// Number counting config
export const numberTransition = {
  duration: duration.dramatic,
  ease: easing.roll,
};

// Flag flutter on hover
export const flagFlutter = {
  hover: {
    rotateZ: [0, -3, 3, -2, 2, 0],
    transition: {
      duration: 0.6,
      ease: "easeInOut" as const,
    },
  },
};

// Parallax scroll multipliers
export const parallax = {
  subtle: 0.05,
  medium: 0.1,
  strong: 0.2,
};
