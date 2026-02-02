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
                </form>
            </div>
        </div>
    );
}
