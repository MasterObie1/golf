import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "image" | "badge" | "contour";
  className?: string;
}

export function Logo({ size = "md", variant = "image", className = "" }: LogoProps) {
  const sizes = {
    sm: {
      image: { width: 120, height: 40 },
      badge: { dimension: 40, fontSize: "text-sm", borderWidth: "border-2" },
      contour: { dimension: 36, fontSize: "text-xs", ring: 3 },
    },
    md: {
      image: { width: 240, height: 80 },
      badge: { dimension: 60, fontSize: "text-xl", borderWidth: "border-3" },
      contour: { dimension: 48, fontSize: "text-sm", ring: 4 },
    },
    lg: {
      image: { width: 300, height: 100 },
      badge: { dimension: 80, fontSize: "text-3xl", borderWidth: "border-4" },
      contour: { dimension: 64, fontSize: "text-lg", ring: 5 },
    },
  };

  const config = sizes[size];

  if (variant === "contour") {
    const c = config.contour;
    return (
      <div
        className={`relative rounded-full flex items-center justify-center ${className}`}
        style={{ width: c.dimension, height: c.dimension }}
      >
        {/* Contour rings */}
        <svg
          className="absolute inset-0"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" stroke="var(--board-yellow)" strokeWidth="1.5" opacity="0.3" />
          <circle cx="24" cy="24" r="18" stroke="var(--board-yellow)" strokeWidth="1" opacity="0.5" />
          <circle cx="24" cy="24" r="14" stroke="var(--board-yellow)" strokeWidth="0.8" opacity="0.7" />
        </svg>
        {/* Inner circle */}
        <div
          className="relative rounded-full bg-rough flex items-center justify-center z-10"
          style={{ width: c.dimension * 0.65, height: c.dimension * 0.65 }}
        >
          <span
            className={`text-board-yellow ${c.fontSize} font-display font-bold tracking-wider`}
          >
            LL
          </span>
        </div>
      </div>
    );
  }

  if (variant === "badge") {
    const badgeConfig = config.badge;
    return (
      <div
        className={`rounded-full ${badgeConfig.borderWidth} border-board-yellow bg-rough flex items-center justify-center ${className}`}
        style={{
          width: badgeConfig.dimension,
          height: badgeConfig.dimension,
        }}
      >
        <span
          className={`text-board-yellow ${badgeConfig.fontSize} font-display font-bold tracking-wider`}
        >
          LL
        </span>
      </div>
    );
  }

  // Image variant
  const imageConfig = config.image;
  return (
    <Image
      src="/images/logo.png"
      alt="LeagueLinks"
      width={imageConfig.width}
      height={imageConfig.height}
      className={`h-full w-auto ${className}`}
      priority
    />
  );
}
