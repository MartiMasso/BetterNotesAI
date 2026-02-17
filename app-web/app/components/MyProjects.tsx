"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/supabaseClient";
import { loadChats, deleteChat, renameChat } from "@/lib/api";
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

    // Context menu state
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    // Rename state
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    // Delete confirm state
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
        let mounted = true;

        async function fetchChats() {
            if (!user) {
                if (mounted) {
                    setChats([]);
                    setLoading(false);
                }
                return;
            }

            try {
                if (mounted) setLoading(true);
                const userChats = await loadChats();
                if (mounted) {
                    setChats(userChats);
                    setLoading(false);
                }
            } catch (error) {
                console.warn("MyProjects: Failed to load chats", error);
                if (mounted) {
                    setChats([]);
                    setLoading(false);
                }
            }
        }

        fetchChats();

        return () => {
            mounted = false;
        };
    }, [user]);

    // Close menu on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(null);
            }
        }
        if (menuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [menuOpen]);

    async function handleRename(chatId: string) {
        const trimmed = renameValue.trim();
        if (!trimmed) {
            setRenamingId(null);
            return;
        }

        const ok = await renameChat(chatId, trimmed);
        if (ok) {
            setChats((prev) =>
                prev.map((c) => (c.id === chatId ? { ...c, title: trimmed } : c))
            );
        }
        setRenamingId(null);
    }

    async function handleDelete(chatId: string) {
        const ok = await deleteChat(chatId);
        if (ok) {
            setChats((prev) => prev.filter((c) => c.id !== chatId));
        }
        setDeletingId(null);
    }

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
                            <div key={chat.id} className="group relative flex items-center">
                                {renamingId === chat.id ? (
                                    <div className="flex-1 px-3 py-1">
                                        <input
                                            autoFocus
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleRename(chat.id);
                                                if (e.key === "Escape") setRenamingId(null);
                                            }}
                                            onBlur={() => handleRename(chat.id)}
                                            className="w-full rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-sm text-white outline-none"
                                        />
                                    </div>
                                ) : (
                                    <Link
                                        href={`/workspace?chat=${chat.id}`}
                                        className="flex flex-1 items-center gap-2 px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/10 hover:text-white truncate"
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
                                )}

                                {/* Kebab menu button */}
                                {renamingId !== chat.id && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setMenuOpen(menuOpen === chat.id ? null : chat.id);
                                        }}
                                        className="mr-1 p-1.5 rounded-lg text-white/30 opacity-0 group-hover:opacity-100 hover:text-white/70 hover:bg-white/10 transition-all"
                                    >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                        </svg>
                                    </button>
                                )}

                                {/* Dropdown menu */}
                                {menuOpen === chat.id && (
                                    <div
                                        ref={menuRef}
                                        className="absolute right-0 top-full mt-1 z-50 w-36 rounded-xl border border-white/15 bg-neutral-900/95 backdrop-blur shadow-xl py-1"
                                    >
                                        <button
                                            onClick={() => {
                                                setMenuOpen(null);
                                                setRenameValue(chat.title || "");
                                                setRenamingId(chat.id);
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                            </svg>
                                            Rename
                                        </button>
                                        <button
                                            onClick={() => {
                                                setMenuOpen(null);
                                                setDeletingId(chat.id);
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 flex items-center gap-2"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
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

            {/* Delete confirmation dialog */}
            {deletingId && (
                <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="rounded-2xl border border-white/15 bg-neutral-900 p-5 shadow-2xl max-w-sm w-full mx-4">
                        <div className="text-sm font-semibold text-white">Delete project?</div>
                        <div className="mt-2 text-xs text-white/60">
                            This will permanently delete this project and its LaTeX content. This action cannot be undone.
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setDeletingId(null)}
                                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deletingId)}
                                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
