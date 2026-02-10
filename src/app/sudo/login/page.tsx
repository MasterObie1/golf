"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SudoLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/sudo/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Invalid credentials");
        } else if (response.status === 429) {
          setError("Too many attempts. Try again later.");
        } else {
          setError("Login failed");
        }
        return;
      }

      router.push("/sudo");
      router.refresh();
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rough flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-board-green rounded-lg shadow-2xl p-8 border border-board-green/80">
        <div className="text-center mb-6">
          <div className="text-putting/50 text-xs font-display uppercase tracking-[0.25em] mb-2">
            Restricted Access
          </div>
          <h1 className="text-xl font-display font-bold text-board-yellow uppercase tracking-wider">
            Platform Administration
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-display font-medium text-putting/70 uppercase tracking-wider mb-2"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-rough border-b-2 border-putting/40 text-white placeholder-putting/30 focus:outline-none focus:border-board-yellow font-sans transition-colors"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-display font-medium text-putting/70 uppercase tracking-wider mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-rough border-b-2 border-putting/40 text-white placeholder-putting/30 focus:outline-none focus:border-board-yellow font-sans transition-colors"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="bg-board-red/20 border border-board-red/50 text-board-red px-4 py-3 rounded-lg text-sm font-sans">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-board-yellow text-rough py-3 rounded-lg hover:bg-board-yellow/90 transition-colors font-display font-semibold uppercase tracking-wider disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Access"}
          </button>
        </form>
      </div>
    </div>
  );
}
