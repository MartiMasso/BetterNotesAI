"use client";

import { useState } from "react";
import Link from "next/link";
import Background from "../components/Background";
import { supabase } from "@/supabaseClient";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setMessage(null);
        setLoading(true);

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: `${window.location.origin}/reset-password`,
            }
        );

        if (resetError) {
            setError(resetError.message);
            setLoading(false);
            return;
        }

        setMessage("Check your email for a password reset link.");
        setLoading(false);
    }

    return (
        <main className="relative min-h-screen text-white">
            <div className="pointer-events-none absolute inset-0 -z-10">
                <Background />
            </div>

            <header className="mx-auto max-w-md px-4 pt-8">
                <Link href="/login" className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    <span className="text-sm">Back to login</span>
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

                    <h1 className="text-2xl font-semibold">Reset password</h1>
                    <p className="mt-2 text-sm text-white/70">
                        Enter your email and we&apos;ll send you a reset link.
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
                            {loading ? "Sending..." : "Send reset link"}
                        </button>
                    </form>

                    <div className="mt-4 text-xs text-white/60">
                        Remember your password?{" "}
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
