"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Background from "../components/Background";
import { supabase } from "@/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/workspace");
  }

  return (
    <main className="relative min-h-screen text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Background />
      </div>

      {/* Minimal header with logo */}
      <header className="mx-auto max-w-md px-4 pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span className="text-sm">Back to home</span>
        </Link>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center px-4 py-8">
        <div className="w-full rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center font-semibold">
              B
            </div>
            <div className="font-semibold tracking-tight">BetterNotes</div>
          </div>

          <h1 className="text-2xl font-semibold">Log in</h1>
          <p className="mt-2 text-sm text-white/70">
            Access your BetterNotes workspace.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-white/70" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/20 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                placeholder="you@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/70" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/20 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                placeholder="••••••••"
                required
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={[
                "h-11 w-full rounded-xl px-4 text-sm font-semibold",
                loading
                  ? "bg-white/20 text-white/60 cursor-not-allowed"
                  : "bg-white text-neutral-950 hover:bg-white/90",
              ].join(" ")}
            >
              {loading ? "Signing in..." : "Log in"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-white/60">
            <div>
              No account yet?{" "}
              <Link href="/signup" className="text-white hover:underline">
                Create one
              </Link>
              .
            </div>
            <Link href="/forgot-password" className="text-white hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
