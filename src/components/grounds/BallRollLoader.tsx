/**
 * BallRollLoader — CSS-only loading animation (works during SSR hydration).
 * A golf ball rolls across a green strip. Replaces pulse skeletons.
 */
interface BallRollLoaderProps {
  /** Text to display below the animation */
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { ball: "w-3 h-3", track: "w-24 h-1", text: "text-xs" },
  md: { ball: "w-4 h-4", track: "w-32 h-1.5", text: "text-sm" },
  lg: { ball: "w-6 h-6", track: "w-40 h-2", text: "text-base" },
};

export function BallRollLoader({
  text = "Loading...",
  size = "md",
  className = "",
}: BallRollLoaderProps) {
  const s = sizes[size];

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="status">
      {/* Track */}
      <div className={`relative ${s.track} bg-putting/20 rounded-full overflow-hidden`}>
        {/* Ball */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${s.ball} rounded-full bg-surface-white border border-scorecard-line animate-ball-roll`}
          style={{
            boxShadow: "inset -1px -1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </div>
      {text && (
        <span className={`${s.text} text-text-muted font-sans`}>
          {text}
        </span>
      )}
      <span className="sr-only">{text}</span>
    </div>
  );
}
