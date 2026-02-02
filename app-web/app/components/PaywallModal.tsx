"use client";

import Link from "next/link";

interface PaywallModalProps {
    isOpen: boolean;
    onClose: () => void;
    remaining?: number;
    resetsAt?: string;
}

export default function PaywallModal({ isOpen, onClose, remaining = 0, resetsAt }: PaywallModalProps) {
    if (!isOpen) return null;

    const resetDate = resetsAt ? new Date(resetsAt) : null;
    const daysUntilReset = resetDate
        ? Math.ceil((resetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md mx-4 rounded-2xl border border-white/20 bg-neutral-900/95 p-6 shadow-2xl text-center">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/50 hover:text-white"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Icon */}
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                </div>

                <h2 className="text-xl font-semibold text-white">
                    You&apos;ve used all your free messages
                </h2>

                <p className="mt-2 text-sm text-white/70">
                    Upgrade to Pro for unlimited LaTeX generation and compilation.
                </p>

                {daysUntilReset !== null && daysUntilReset > 0 && (
                    <p className="mt-2 text-xs text-white/50">
                        Or wait {daysUntilReset} day{daysUntilReset > 1 ? 's' : ''} for your free messages to reset.
                    </p>
                )}

                <div className="mt-6 space-y-3">
                    <Link
                        href="/pricing"
                        className="block h-11 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-sm font-semibold text-white hover:from-amber-400 hover:to-orange-400 transition-all flex items-center justify-center"
                    >
                        View Plans
                    </Link>

                    <button
                        onClick={onClose}
                        className="h-10 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-sm text-white/70 hover:bg-white/15 transition-colors"
                    >
                        Maybe later
                    </button>
                </div>

                {/* Features teaser */}
                <div className="mt-6 pt-4 border-t border-white/10">
                    <p className="text-xs text-white/50 mb-3">What you get with Pro:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {["Unlimited messages", "Priority compilation", "Save projects", "Export to PDF"].map((feature) => (
                            <span
                                key={feature}
                                className="px-2 py-1 text-xs rounded-full bg-white/5 text-white/60"
                            >
                                {feature}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
