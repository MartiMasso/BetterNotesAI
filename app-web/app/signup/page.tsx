"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Background from "../components/Background";
import { supabase } from "@/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setMessage(null);
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setMessage("Check your email to confirm your account.");
      setLoading(false);
      return;
    }

    router.push("/workspace");
  }

  async function handleOAuth(provider: "google" | "github") {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Background />
      </div>

      {/* Minimal header with back link */}
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

          <h1 className="text-2xl font-semibold">Create account</h1>
          <p className="mt-2 text-sm text-white/70">
            Start generating clean notes in minutes.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-white/70" htmlFor="fullName">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/20 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                placeholder="John Doe"
                required
              />
            </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/20 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                placeholder="At least 8 characters"
                required
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {message}
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
              {loading ? "Creating..." : "Sign up"}
            </button>

            {/* OAuth Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/10 px-2 text-white/50 rounded">or continue with</span>
              </div>
            </div>

            {/* OAuth Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleOAuth("google")}
                disabled={loading}
                className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => handleOAuth("github")}
                disabled={loading}
                className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>
          </form>

          <div className="mt-4 text-xs text-white/60">
            Already have an account?{" "}
            <Link href="/login" className="text-white hover:underline">
              Log in
            </Link>
            .
          </div>
        </div>
      </div>
    </main>
  );
}
