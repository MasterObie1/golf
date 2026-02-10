/**
 * Denser topographic contour pattern — used for section backgrounds.
 * Static SVG paths, zero runtime cost. Color controlled via currentColor.
 */
export function ContourTerrain({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Closed contour rings — like a hilltop topo map */}
      <ellipse cx="200" cy="200" rx="180" ry="140" stroke="currentColor" strokeWidth="0.6" opacity="0.04" />
      <ellipse cx="200" cy="200" rx="150" ry="110" stroke="currentColor" strokeWidth="0.6" opacity="0.05" />
      <ellipse cx="200" cy="200" rx="120" ry="85" stroke="currentColor" strokeWidth="0.6" opacity="0.05" />
      <ellipse cx="200" cy="200" rx="90" ry="60" stroke="currentColor" strokeWidth="0.6" opacity="0.06" />
      <ellipse cx="200" cy="200" rx="55" ry="35" stroke="currentColor" strokeWidth="0.6" opacity="0.06" />

      {/* Second hill — offset */}
      <ellipse cx="450" cy="150" rx="130" ry="100" stroke="currentColor" strokeWidth="0.6" opacity="0.035" />
      <ellipse cx="450" cy="150" rx="100" ry="70" stroke="currentColor" strokeWidth="0.6" opacity="0.04" />
      <ellipse cx="450" cy="150" rx="65" ry="45" stroke="currentColor" strokeWidth="0.6" opacity="0.05" />
      <ellipse cx="450" cy="150" rx="30" ry="20" stroke="currentColor" strokeWidth="0.6" opacity="0.05" />

      {/* Connecting ridge lines */}
      <path
        d="M320 180 C350 170, 370 165, 390 160"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.04"
      />
      <path
        d="M310 200 C350 190, 380 180, 400 175"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.035"
      />

      {/* Valley contours at bottom */}
      <path
        d="M0 350 C100 330, 200 340, 300 320 S500 310, 600 300"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.04"
      />
      <path
        d="M0 370 C100 355, 200 360, 300 345 S500 335, 600 325"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.03"
      />
    </svg>
  );
}
