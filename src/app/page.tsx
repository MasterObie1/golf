import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen relative">
      {/* Hero Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=1920&q=80"
          alt="Golf course at sunset"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--masters-green)]/80 via-[var(--masters-green)]/60 to-[var(--masters-green)]/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center py-12 px-4">
        <div className="text-center">
          {/* Logo Badge */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-[var(--masters-yellow)] shadow-xl border-4 border-white">
              <svg className="w-12 h-12 text-[var(--masters-green-dark)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
              </svg>
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 font-[family-name:var(--font-playfair)] drop-shadow-lg">
            Golf League Tracker
          </h1>
          <p className="text-xl text-white/90 mb-12 max-w-lg mx-auto drop-shadow">
            Track your golf league standings, handicaps, and match results.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/leaderboard"
              className="px-8 py-4 bg-[var(--masters-yellow)] text-[var(--masters-green-dark)] text-lg font-semibold rounded-lg hover:bg-[var(--masters-yellow-light)] transition-colors shadow-lg"
            >
              View Leaderboard
            </Link>
            <Link
              href="/history"
              className="px-8 py-4 bg-white/95 text-[var(--masters-green)] text-lg font-semibold rounded-lg hover:bg-white transition-colors shadow-lg"
            >
              Match History
            </Link>
            <Link
              href="/admin"
              className="px-8 py-4 bg-[var(--masters-green-dark)] text-white text-lg font-semibold rounded-lg hover:bg-[var(--masters-green)] transition-colors shadow-lg border border-white/20"
            >
              Admin
            </Link>
          </div>
        </div>

        {/* Decorative footer */}
        <div className="absolute bottom-8 text-center">
          <p className="text-sm text-white/80 font-medium tracking-wider uppercase">A tradition unlike any other</p>
        </div>
      </div>
    </div>
  );
}
