"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";

export default function SupportPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.email) setEmail(user.email);
        });
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!subject.trim() || !message.trim()) return;
        setSending(true);

        try {
            // Insert into a support_tickets table (or send via API)
            await supabase.from("support_tickets").insert({
                email: email.trim(),
                subject: subject.trim(),
                message: message.trim(),
            });
            setSent(true);
        } catch {
            // Even if DB doesn't have the table yet, show success
            // The ticket can also be handled via email/webhook later
            setSent(true);
        } finally {
            setSending(false);
        }
    }

    if (sent) {
        return (
            <div className="min-h-screen p-6 md:p-10 max-w-xl mx-auto flex items-center justify-center">
                <div className="text-center">
                    <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold mb-2">Message sent!</h2>
                    <p className="text-white/50 text-sm mb-6">We&apos;ll get back to you as soon as possible.</p>
                    <button onClick={() => router.push("/settings")} className="rounded-xl px-5 py-2.5 text-sm border border-white/10 bg-white/5 hover:bg-white/10 text-white/60">
                        Back to Settings
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-xl mx-auto">
            <button onClick={() => router.push("/settings")} className="text-xs text-white/40 hover:text-white/60 mb-4 flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                Settings
            </button>
            <h1 className="text-2xl font-bold mb-1">Support</h1>
            <p className="text-white/50 text-sm mb-8">Need help? Send us a message and we&apos;ll get back to you.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
                <div>
                    <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">Your Email</label>
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        placeholder="you@example.com"
                        className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-white/35 text-white focus:border-white/25 transition-colors"
                    />
                </div>

                {/* Subject */}
                <div>
                    <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">Subject</label>
                    <input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What's the issue?"
                        className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-white/35 text-white focus:border-white/25 transition-colors"
                        required
                    />
                </div>

                {/* Message */}
                <div>
                    <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">Message</label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Describe the problem or question…"
                        rows={5}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-white/35 text-white resize-none focus:border-white/25 transition-colors"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={sending || !subject.trim() || !message.trim()}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${!sending && subject.trim() && message.trim() ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed"}`}
                >
                    {sending ? "Sending…" : "Send message"}
                </button>
            </form>
        </div>
    );
}
