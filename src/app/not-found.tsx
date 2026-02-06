import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="text-8xl font-bold text-[var(--green-primary)]/20 mb-2" style={{ fontFamily: "var(--font-playfair)" }}>
            404
          </div>
          <h1 className="text-3xl font-bold text-[var(--green-dark)] mb-2" style={{ fontFamily: "var(--font-playfair)" }}>
            Lost Ball
          </h1>
          <p className="text-gray-600">
            We couldn&apos;t find the page you&apos;re looking for. It may have been moved or doesn&apos;t exist.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-[var(--green-primary)] text-white font-semibold rounded-lg hover:bg-[var(--green-dark)] transition-colors"
          >
            Back to Clubhouse
          </Link>
          <Link
            href="/leagues"
            className="px-6 py-3 bg-white text-[var(--green-primary)] font-semibold rounded-lg border border-[var(--green-primary)] hover:bg-[var(--bg-primary)] transition-colors"
          >
            Find a League
          </Link>
        </div>
      </div>
    </div>
  );
}
