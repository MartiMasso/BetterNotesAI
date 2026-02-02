"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/supabaseClient";
import { loadChats } from "@/lib/api";
import type { User } from "@supabase/supabase-js";

interface Chat {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

export default function MyProjects() {
    const [user, setUser] = useState<User | null>(null);
    const [chats, setChats] = useState<Chat[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);

    // Check auth state
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Load user's chats when logged in
    useEffect(() => {
        async function fetchChats() {
            if (!user) {
                setChats([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            const userChats = await loadChats();
            setChats(userChats);
            setLoading(false);
        }

        fetchChats();
    }, [user]);

    // Don't show section if not logged in
    if (!user) {
        return null;
    }

    return (
        <div className="mt-4">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider hover:text-white/70"
            >
                <span>My Projects</span>
                <svg
                    className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {expanded && (
                <div className="mt-1 space-y-1">
                    {loading ? (
                        <div className="px-3 py-2 text-xs text-white/40">Loading...</div>
                    ) : chats.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-white/40">No projects yet</div>
                    ) : (
                        chats.slice(0, 5).map((chat) => (
                            <Link
                                key={chat.id}
                                href={`/workspace?chat=${chat.id}`}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/10 hover:text-white truncate"
                            >
                                <svg
                                    className="h-4 w-4 flex-shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                                    />
                                </svg>
                                <span className="truncate">{chat.title || "Untitled"}</span>
                            </Link>
                        ))
                    )}

                    {chats.length > 5 && (
                        <Link
                            href="/workspace?showAllChats=true"
                            className="block px-3 py-2 text-xs text-white/50 hover:text-white/70"
                        >
                            View all ({chats.length})
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
