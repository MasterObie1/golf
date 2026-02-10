"use client";

import { useEffect } from "react";

type TimeOfDay = "dawn" | "morning" | "midday" | "afternoon" | "golden" | "dusk";

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "golden";
  return "dusk";
}

// Time-of-day color adjustments — subtle warmth shifts, never dark mode
const timeColors: Record<TimeOfDay, Record<string, string>> = {
  dawn: {
    "--time-surface-warmth": "rgba(255, 183, 77, 0.04)",
    "--time-sky": "rgba(255, 183, 77, 0.06)",
    "--time-accent-shift": "0deg",
  },
  morning: {
    "--time-surface-warmth": "rgba(255, 255, 255, 0.0)",
    "--time-sky": "rgba(200, 230, 255, 0.03)",
    "--time-accent-shift": "0deg",
  },
  midday: {
    "--time-surface-warmth": "rgba(255, 255, 255, 0.0)",
    "--time-sky": "rgba(255, 255, 255, 0.0)",
    "--time-accent-shift": "0deg",
  },
  afternoon: {
    "--time-surface-warmth": "rgba(255, 200, 100, 0.02)",
    "--time-sky": "rgba(255, 220, 150, 0.03)",
    "--time-accent-shift": "2deg",
  },
  golden: {
    "--time-surface-warmth": "rgba(255, 170, 50, 0.05)",
    "--time-sky": "rgba(255, 170, 50, 0.06)",
    "--time-accent-shift": "5deg",
  },
  dusk: {
    "--time-surface-warmth": "rgba(100, 120, 180, 0.03)",
    "--time-sky": "rgba(80, 100, 160, 0.04)",
    "--time-accent-shift": "-3deg",
  },
};

function applyTimeColors(tod: TimeOfDay) {
  const root = document.documentElement;
  const colors = timeColors[tod];
  root.setAttribute("data-time", tod);
  for (const [prop, value] of Object.entries(colors)) {
    root.style.setProperty(prop, value);
  }
}

export function TimeProvider() {
  useEffect(() => {
    function update() {
      const hour = new Date().getHours();
      applyTimeColors(getTimeOfDay(hour));
    }

    update();
    const interval = setInterval(update, 5 * 60 * 1000); // re-check every 5 min
    return () => clearInterval(interval);
  }, []);

  return null; // renders nothing — side-effect only
}
