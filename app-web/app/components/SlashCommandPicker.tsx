"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { templates } from "@/lib/templates";

export interface SlashCommandPickerRef {
    /** Call this from the parent input's onKeyDown. Returns true if the event was consumed. */
    handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface SlashCommandPickerProps {
    inputValue: string;
    isPro: boolean;
    onSelect: (templateId: string) => void;
    onProBlocked: () => void;
    onDismiss: () => void;
}

const SlashCommandPicker = forwardRef<SlashCommandPickerRef, SlashCommandPickerProps>(
    function SlashCommandPicker({ inputValue, isPro, onSelect, onProBlocked, onDismiss }, ref) {
        const [activeIndex, setActiveIndex] = useState(0);
        const listRef = useRef<HTMLDivElement | null>(null);

        // Parse slash input
        const slashMatch = inputValue.match(/^\/(.*)$/);
        const isOpen = !!slashMatch;
        const query = slashMatch ? slashMatch[1].toLowerCase().trim() : "";

        // Filter templates
        const filtered = isOpen
            ? (query
                ? templates.filter((t) =>
                    t.name.toLowerCase().includes(query) ||
                    t.id.toLowerCase().includes(query) ||
                    t.description.toLowerCase().includes(query)
                )
                : [...templates])
            : [];

        // Clamp active index when filtered list changes
        useEffect(() => {
            setActiveIndex(0);
        }, [query]);

        // Scroll active item into view
        useEffect(() => {
            if (!listRef.current) return;
            const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
            activeEl?.scrollIntoView({ block: "nearest" });
        }, [activeIndex]);

        // Expose keyboard handler to parent
        useImperativeHandle(ref, () => ({
            handleKeyDown(e: React.KeyboardEvent): boolean {
                if (!isOpen || filtered.length === 0) return false;

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                    return true;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                    return true;
                }
                if (e.key === "Enter") {
                    e.preventDefault();
                    const t = filtered[activeIndex];
                    if (t) {
                        if (t.isPro && !isPro) {
                            onProBlocked();
                        } else {
                            onSelect(t.id);
                        }
                    }
                    return true;
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    onDismiss();
                    return true;
                }
                if (e.key === "Tab") {
                    e.preventDefault();
                    onDismiss();
                    return true;
                }
                return false;
            },
        }), [isOpen, filtered, activeIndex, isPro, onSelect, onProBlocked, onDismiss]);

        if (!isOpen || filtered.length === 0) return null;

        function handleItemClick(t: typeof templates[number]) {
            if (t.isPro && !isPro) {
                onProBlocked();
                return;
            }
            onSelect(t.id);
        }

        return (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl border border-white/15 bg-neutral-900/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in">
                {/* Header */}
                <div className="px-3 py-2 border-b border-white/8 flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-[11px] text-white/40 font-medium">Select a template</span>
                    {query && <span className="text-[11px] text-white/20">— filtering &ldquo;{query}&rdquo;</span>}
                </div>

                {/* Template list */}
                <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
                    {filtered.map((t, idx) => {
                        const isActive = idx === activeIndex;
                        const isLocked = t.isPro && !isPro;

                        return (
                            <button
                                key={t.id}
                                data-index={idx}
                                onClick={() => handleItemClick(t)}
                                onMouseEnter={() => setActiveIndex(idx)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isActive ? "bg-white/10" : "hover:bg-white/5"
                                    } ${isLocked ? "opacity-50" : ""}`}
                            >
                                {/* Thumbnail */}
                                {t.thumbnailPath ? (
                                    <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-white/5">
                                        <img src={t.thumbnailPath} alt="" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-lg border border-white/10 flex-shrink-0 bg-white/5 flex items-center justify-center">
                                        <svg className="h-4 w-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                    </div>
                                )}

                                {/* Name + Description */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-white/90 font-medium truncate">{t.name}</span>
                                        {t.isPro && (
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0 ${isPro
                                                    ? "bg-emerald-500/15 text-emerald-300/80"
                                                    : "bg-amber-500/15 text-amber-300/80"
                                                }`}>
                                                PRO
                                            </span>
                                        )}
                                        {isLocked && (
                                            <svg className="h-3 w-3 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-white/35 truncate">{t.description}</div>
                                </div>

                                {/* Active indicator */}
                                {isActive && (
                                    <div className="flex-shrink-0 text-[10px] text-white/25 font-mono">↵</div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Footer hint */}
                <div className="px-3 py-1.5 border-t border-white/8 flex items-center gap-3 text-[10px] text-white/20">
                    <span>↑↓ navigate</span>
                    <span>↵ select</span>
                    <span>esc dismiss</span>
                </div>
            </div>
        );
    }
);

export default SlashCommandPicker;
