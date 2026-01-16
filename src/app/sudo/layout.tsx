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
    await fetch("/api/sudo/logout", { method: "POST" });
    router.push("/sudo/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Top bar */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link
                href="/sudo"
                className="text-amber-500 font-semibold text-lg"
              >
                Platform Admin
              </Link>
              <nav className="flex gap-4">
                <Link
                  href="/sudo"
                  className={`text-sm ${
                    pathname === "/sudo"
                      ? "text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Dashboard
                </Link>
              </nav>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-400 hover:text-white"
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
