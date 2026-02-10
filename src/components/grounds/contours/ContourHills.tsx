/**
 * Gentle rolling hills contour pattern — used as page backgrounds.
 * Static SVG paths, zero runtime cost. Color controlled via currentColor.
 */
export function ContourHills({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Outermost contour */}
      <path
        d="M0 500 C100 460, 200 480, 300 440 C400 400, 500 420, 600 380 C700 340, 750 360, 800 340 L800 600 L0 600 Z"
        fill="currentColor"
        opacity="0.02"
      />
      {/* Mid contour */}
      <path
        d="M0 520 C150 490, 250 510, 350 470 C450 430, 550 450, 650 420 C720 400, 760 410, 800 390 L800 600 L0 600 Z"
        fill="currentColor"
        opacity="0.015"
      />
      {/* Contour lines */}
      <path
        d="M0 450 C80 420, 180 440, 280 400 S480 380, 580 360 S720 340, 800 320"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.06"
      />
      <path
        d="M0 400 C120 370, 220 390, 320 350 S520 330, 620 310 S760 290, 800 270"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.05"
      />
      <path
        d="M0 350 C100 320, 200 340, 300 300 S500 280, 600 260 S740 250, 800 230"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.04"
      />
      <path
        d="M0 300 C140 270, 240 290, 340 250 S540 230, 640 210 S770 200, 800 190"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity="0.03"
      />
      <path
        d="M0 250 C110 230, 210 240, 310 210 S510 190, 610 170 S750 160, 800 150"
        stroke="currentColor"
        strokeWidth="0.4"
        opacity="0.025"
      />
      <path
        d="M0 200 C130 180, 230 190, 330 170 S530 150, 630 130 S760 120, 800 110"
        stroke="currentColor"
        strokeWidth="0.4"
        opacity="0.02"
      />
    </svg>
  );
}
