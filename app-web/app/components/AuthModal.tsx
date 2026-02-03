"use client";

import { useState } from "react";
import { supabase } from "@/supabaseClient";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    message?: string;
}

export default function AuthModal({ isOpen, onClose, onSuccess, message }: AuthModalProps) {
    const [mode, setMode] = useState<"login" | "signup">("signup");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (loading) return;

        setError(null);
        setSuccessMessage(null);
        setLoading(true);

        if (mode === "signup") {
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: fullName },
                },
            });

            if (signUpError) {
                setError(signUpError.message);
                setLoading(false);
                return;
            }

            if (!data.session) {
                setSuccessMessage("Check your email to confirm your account.");
                setLoading(false);
                return;
            }

            onSuccess();
        } else {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                setError(signInError.message);
                setLoading(false);
                return;
            }

            onSuccess();
        }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md mx-4 rounded-2xl border border-white/20 bg-neutral-900/95 p-6 shadow-2xl">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/50 hover:text-white"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center font-semibold">
                        B
                    </div>
                    <div className="font-semibold tracking-tight text-white">BetterNotes</div>
                </div>

                <h2 className="text-xl font-semibold text-white">
                    {mode === "signup" ? "Create account to continue" : "Log in to continue"}
                </h2>

                {message && (
                    <p className="mt-2 text-sm text-white/70">{message}</p>
                )}

                {/* Toggle */}
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setMode("signup")}
                        className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === "signup"
                            ? "bg-white text-neutral-900 font-medium"
                            : "bg-white/10 text-white/70 hover:bg-white/15"
                            }`}
                    >
                        Sign up
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("login")}
                        className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === "login"
                            ? "bg-white text-neutral-900 font-medium"
                            : "bg-white/10 text-white/70 hover:bg-white/15"
                            }`}
                    >
                        Log in
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                    {mode === "signup" && (
                        <div className="space-y-1">
                            <label className="text-xs text-white/70" htmlFor="fullName">
                                Full Name
                            </label>
                            <input
                                id="fullName"
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="h-10 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                                placeholder="John Doe"
                                required={mode === "signup"}
                            />
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs text-white/70" htmlFor="email">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="h-10 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                            placeholder="you@email.com"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-white/70" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="h-10 w-full rounded-xl border border-white/20 bg-black/30 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                            {successMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`h-10 w-full rounded-xl px-4 text-sm font-semibold transition-colors ${loading
                            ? "bg-white/20 text-white/60 cursor-not-allowed"
                            : "bg-white text-neutral-950 hover:bg-white/90"
                            }`}
                    >
                        {loading
                            ? mode === "signup" ? "Creating..." : "Signing in..."
                            : mode === "signup" ? "Sign up" : "Log in"
                        }
                    </button>

                    {/* OAuth Divider */}
                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/20"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-neutral-900 px-2 text-white/50">or continue with</span>
                        </div>
                    </div>

                    {/* OAuth Buttons */}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => handleOAuth("google")}
                            disabled={loading}
                            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
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
                            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            GitHub
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
