"use client";

import { useRef, useState, useEffect, useCallback } from "react";

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    function handleChange(event: MediaQueryListEvent) {
      setPrefersReducedMotion(event.matches);
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export function BallIntoCup() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [ballX, setBallX] = useState(0); // 0 to 1, normalized
  const [sinking, setSinking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const sinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CUP_ZONE = 0.9;
  const TRACK_WIDTH = 320;
  const BALL_SIZE = 16;
  const CUP_WIDTH = 24;

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (sinking || hidden || prefersReducedMotion) return;

      // Map the full viewport width to 0–1
      const relX = e.clientX / window.innerWidth;
      const clamped = Math.max(0, Math.min(1, relX));
      setBallX(clamped);

      if (clamped >= CUP_ZONE) {
        setSinking(true);
        sinkTimeoutRef.current = setTimeout(() => {
          setHidden(true);
          setTimeout(() => {
            setBallX(0);
            setSinking(false);
            setHidden(false);
          }, 1000);
        }, 450);
      }
    },
    [sinking, hidden, prefersReducedMotion]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (sinkTimeoutRef.current) clearTimeout(sinkTimeoutRef.current);
    };
  }, [handleMouseMove]);

  // Ball pixel position — don't let it pass the cup
  const maxBallLeft = TRACK_WIDTH - CUP_WIDTH - BALL_SIZE / 2 - 4;
  const ballLeft = Math.min(ballX * (TRACK_WIDTH - BALL_SIZE), maxBallLeft);

  // Spin proportional to travel
  const rotation = ballX * 1080;

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <div
      ref={trackRef}
      className="relative"
      style={{ width: TRACK_WIDTH, height: 48 }}
      aria-hidden="true"
    >
      {/* Green strip */}
      <div
        className="absolute left-0 right-0 rounded-full"
        style={{
          bottom: 6,
          height: 5,
          background: "rgba(255,255,255,0.18)",
        }}
      />

      {/* Cup hole */}
      <div
        className="absolute"
        style={{
          bottom: 4,
          right: 6,
          width: CUP_WIDTH,
          height: 10,
          background: "rgba(0,0,0,0.5)",
          borderRadius: "0 0 12px 12px",
        }}
      />

      {/* Flag stick */}
      <div
        className="absolute"
        style={{
          bottom: 11,
          right: 16,
          width: 2,
          height: 28,
          background: "rgba(255,255,255,0.45)",
          borderRadius: 1,
        }}
      />

      {/* Flag triangle */}
      <div
        className="absolute"
        style={{
          bottom: 30,
          right: 18,
          width: 0,
          height: 0,
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderRight: "12px solid #dc2626",
        }}
      />

      {/* Ball */}
      <div
        className="absolute"
        style={{
          bottom: sinking ? 0 : 9,
          left: ballLeft,
          width: BALL_SIZE,
          height: BALL_SIZE,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 38% 32%, #ffffff 0%, #f0f0f0 40%, #d4d4d4 70%, #b8b8b8 100%)",
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.35), inset 0 -1px 2px rgba(0,0,0,0.1)",
          transform: `rotate(${rotation}deg) scale(${sinking ? 0.35 : 1})`,
          opacity: hidden ? 0 : 0.9,
          transition: sinking
            ? "bottom 0.45s ease-in, transform 0.45s ease-in, opacity 0.35s ease-in 0.15s"
            : "left 0.06s linear",
          willChange: "left, transform",
        }}
      >
        {/* Dimple pattern hint */}
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 5,
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.06)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 7,
            left: 9,
            width: 2,
            height: 2,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.05)",
          }}
        />
      </div>

      {/* Cup lip — front edge renders over ball when it drops */}
      <div
        className="absolute"
        style={{
          bottom: 8,
          right: 5,
          width: CUP_WIDTH + 2,
          height: 4,
          background: "rgba(255,255,255,0.2)",
          borderRadius: 2,
        }}
      />

      {/* Message */}
      <div
        className="absolute left-0 right-0 text-center"
        style={{
          bottom: -14,
          fontSize: 10,
          color: "rgba(255,255,255,0.35)",
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          transition: "opacity 0.3s",
          opacity: hidden ? 1 : 0,
        }}
      >
        Nice putt!
      </div>
    </div>
  );
}
