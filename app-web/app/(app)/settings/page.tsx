"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";

const sections = [
    { id: "profile", label: "Profile", desc: "Display name, avatar, university", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z", href: "/settings/profile" },
    { id: "plans", label: "Plans & Billing", desc: "Manage your subscription", icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z", href: "/pricing" },
    { id: "support", label: "Support", desc: "Contact us for help", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z", href: "/support" },
];

export default function SettingsPage() {
    const router = useRouter();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function handleSignOut() {
        await supabase.auth.signOut();
        router.push("/");
    }

    async function handleDeleteAccount() {
        setDeleting(true);
        try {
            // Delete user data via RPC, then sign out
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Delete profile row (cascades to projects, files, etc.)
                await supabase.from("profiles").delete().eq("id", user.id);
            }
            await supabase.auth.signOut();
            router.push("/");
        } catch {
            setDeleting(false);
            setShowDeleteConfirm(false);
        }
    }

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-1">Settings</h1>
            <p className="text-white/50 text-sm mb-8">Manage your account and preferences.</p>

            <div className="space-y-2">
                {sections.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => router.push(s.href)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15 transition-colors text-left group"
                    >
                        <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-colors">
                            <svg className="h-5 w-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white">{s.label}</div>
                            <div className="text-xs text-white/40">{s.desc}</div>
                        </div>
                        <svg className="h-4 w-4 text-white/15 group-hover:text-white/30 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>
                ))}
            </div>

            {/* Danger zone */}
            <div className="mt-12 pt-6 border-t border-white/8">
                <div className="text-xs text-white/20 uppercase tracking-wider mb-3 font-semibold">Danger Zone</div>
                <div className="flex gap-3 flex-wrap">
                    <button
                        onClick={handleSignOut}
                        className="rounded-xl px-4 py-2.5 text-sm border border-red-400/20 bg-red-500/10 text-red-200/80 hover:bg-red-500/20 hover:text-red-200 transition-colors"
                    >
                        Sign out
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="rounded-xl px-4 py-2.5 text-sm border border-red-500/30 bg-red-600/15 text-red-300/80 hover:bg-red-600/25 hover:text-red-200 transition-colors"
                    >
                        Delete account
                    </button>
                </div>
            </div>

            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setShowDeleteConfirm(false)} />
                    <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-red-500/20 bg-neutral-950/95 backdrop-blur-xl p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-white">Delete your account?</div>
                                <div className="text-xs text-white/40">This cannot be undone.</div>
                            </div>
                        </div>
                        <p className="text-sm text-white/50 mb-6">
                            All your projects, files, and data will be permanently removed. This action is irreversible.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deleting}
                                className="px-4 py-2 text-sm rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleting}
                                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-60"
                            >
                                {deleting ? "Deleting…" : "Yes, delete my account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
