"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SudoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Don't show layout on login page
  if (pathname === "/sudo/login") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/sudo/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout request failed:", err);
    }
    router.push("/sudo/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-rough">
      {/* Top bar */}
      <header className="bg-board-green border-b border-board-green/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link
                href="/sudo"
                className="text-board-yellow font-display font-semibold text-lg uppercase tracking-wider"
              >
                Platform Admin
              </Link>
              <nav className="flex gap-4">
                <Link
                  href="/sudo"
                  className={`text-sm font-display uppercase tracking-wider ${
                    pathname === "/sudo"
                      ? "text-white"
                      : "text-putting/80 hover:text-white"
                  }`}
                >
                  Dashboard
                </Link>
              </nav>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-putting/80 hover:text-white font-display uppercase tracking-wider"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>{children}</main>
    </div>
  );
}
