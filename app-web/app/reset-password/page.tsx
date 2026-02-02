"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Background from "../components/Background";
import { supabase } from "@/supabaseClient";

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // Check if we have a valid session from the reset link
        supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") {
                setReady(true);
            }
        });

        // Also check current session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setReady(true);
            }
        });
    }, []);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setMessage(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setLoading(true);

        const { error: updateError } = await supabase.auth.updateUser({
            password,
        });

        if (updateError) {
            setError(updateError.message);
            setLoading(false);
            return;
        }

        setMessage("Password updated successfully! Redirecting to login...");

        // Sign out and redirect to login
        await supabase.auth.signOut();
        setTimeout(() => {
            router.push("/login");
        }, 2000);
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

                    <h1 className="text-2xl font-semibold">Set new password</h1>
                    <p className="mt-2 text-sm text-white/70">
                        Enter your new password below.
                    </p>

                    {!ready ? (
                        <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <p className="font-medium">Waiting for authentication...</p>
                            <p className="mt-1 text-xs text-amber-100/70">
                                If you arrived here directly, please use the reset link from your email.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={onSubmit} className="mt-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs text-white/70" htmlFor="password">
                                    New Password
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

                            <div className="space-y-2">
                                <label className="text-xs text-white/70" htmlFor="confirmPassword">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="h-11 w-full rounded-xl border border-white/20 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                                    placeholder="Repeat your password"
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
                                {loading ? "Updating..." : "Update password"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </main>
    );
}
