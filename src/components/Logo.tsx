import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "image" | "badge";
  className?: string;
}

export function Logo({ size = "md", variant = "image", className = "" }: LogoProps) {
  // Size configurations
  const sizes = {
    sm: {
      image: { width: 120, height: 40 },
      badge: { dimension: 40, fontSize: "text-sm", borderWidth: "border-2" },
    },
    md: {
      image: { width: 240, height: 80 },
      badge: { dimension: 60, fontSize: "text-xl", borderWidth: "border-3" },
    },
    lg: {
      image: { width: 300, height: 100 },
      badge: { dimension: 80, fontSize: "text-3xl", borderWidth: "border-4" },
    },
  };

  const config = sizes[size];

  if (variant === "badge") {
    const badgeConfig = config.badge;
    return (
      <div
        className={`rounded-full ${badgeConfig.borderWidth} border-[var(--gold-primary)] bg-[var(--green-dark)] flex items-center justify-center ${className}`}
        style={{
          width: badgeConfig.dimension,
          height: badgeConfig.dimension,
        }}
      >
        <span
          className={`text-[var(--gold-primary)] ${badgeConfig.fontSize} font-bold`}
          style={{ fontFamily: "var(--font-playfair)" }}
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
