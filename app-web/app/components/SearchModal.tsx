"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listProjects, searchDocuments, type Project, type PublishedDocument } from "@/lib/api";

type ResultItem =
    | { type: "project"; data: Project }
    | { type: "document"; data: PublishedDocument }
    | { type: "nav"; label: string; href: string; icon: string };

const NAV_ITEMS: ResultItem[] = [
    { type: "nav", label: "Projects", href: "/projects", icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" },
    { type: "nav", label: "Universities", href: "/universities", icon: "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" },
    { type: "nav", label: "Explore", href: "/universities/explore", icon: "m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" },
    { type: "nav", label: "Settings", href: "/settings", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" },
    { type: "nav", label: "Pricing", href: "/pricing", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
    { type: "nav", label: "Support", href: "/support", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
];

export default function SearchModal() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ResultItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cmd+K / Ctrl+K handler
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setSelected(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Search on query change
    const search = useCallback(async (q: string) => {
        if (!q.trim()) {
            // Show nav items when empty
            setResults(NAV_ITEMS);
            return;
        }

        setLoading(true);
        const lower = q.toLowerCase();

        // Filter nav items
        const navMatches = NAV_ITEMS.filter((n) =>
            n.type === "nav" && n.label.toLowerCase().includes(lower)
        );

        // Search projects and documents in parallel
        const [projects, docs] = await Promise.all([
            listProjects({ limit: 5 }),
            searchDocuments(q, 5, 0),
        ]);

        const projectMatches: ResultItem[] = projects
            .filter((p) => (p.title || "").toLowerCase().includes(lower))
            .slice(0, 5)
            .map((p) => ({ type: "project" as const, data: p }));

        const docMatches: ResultItem[] = docs
            .slice(0, 5)
            .map((d) => ({ type: "document" as const, data: d }));

        setResults([...navMatches, ...projectMatches, ...docMatches]);
        setSelected(0);
        setLoading(false);
    }, []);

    function handleInputChange(val: string) {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(val), 200);
    }

    function handleSelect(item: ResultItem) {
        setOpen(false);
        if (item.type === "nav") {
            router.push(item.href);
        } else if (item.type === "project") {
            router.push(`/workspace/${item.data.id}`);
        } else if (item.type === "document") {
            if (item.data.pdf_url) {
                window.open(item.data.pdf_url, "_blank");
            }
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((s) => Math.min(s + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((s) => Math.max(s - 1, 0));
        } else if (e.key === "Enter" && results[selected]) {
            e.preventDefault();
            handleSelect(results[selected]);
        }
    }

    // Show nav items on open
    useEffect(() => {
        if (open && results.length === 0 && !query) {
            setResults(NAV_ITEMS);
        }
    }, [open, results.length, query]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

            {/* Modal */}
            <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/15 bg-neutral-950/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in">
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                    <svg className="h-4 w-4 text-white/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
                    </svg>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search projects, documents, pages…"
                        className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                    />
                    <kbd className="hidden sm:flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/30 font-mono">
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div className="max-h-80 overflow-y-auto py-1">
                    {loading ? (
                        <div className="px-4 py-6 text-center text-sm text-white/30">Searching…</div>
                    ) : results.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-white/30">
                            {query ? "No results found" : "Start typing to search"}
                        </div>
                    ) : (
                        results.map((item, i) => (
                            <button
                                key={`${item.type}-${i}`}
                                onClick={() => handleSelect(item)}
                                onMouseEnter={() => setSelected(i)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selected ? "bg-white/8" : "hover:bg-white/5"}`}
                            >
                                {item.type === "nav" && (
                                    <>
                                        <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                            <svg className="h-3.5 w-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                            </svg>
                                        </div>
                                        <span className="text-sm text-white/80">{item.label}</span>
                                        <span className="text-[10px] text-white/20 ml-auto">Page</span>
                                    </>
                                )}
                                {item.type === "project" && (
                                    <>
                                        <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                                            <svg className="h-3.5 w-3.5 text-purple-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white/80 truncate">{item.data.title || "Untitled"}</div>
                                        </div>
                                        <span className="text-[10px] text-white/20">Project</span>
                                    </>
                                )}
                                {item.type === "document" && (
                                    <>
                                        <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                            <svg className="h-3.5 w-3.5 text-emerald-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white/80 truncate">{item.data.title}</div>
                                            {item.data.university_name && <div className="text-[10px] text-white/25 truncate">{item.data.university_name}</div>}
                                        </div>
                                        <span className="text-[10px] text-white/20">Document</span>
                                    </>
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2 border-t border-white/8 flex items-center gap-4 text-[10px] text-white/20">
                    <span className="flex items-center gap-1">
                        <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">↑↓</kbd> Navigate
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">↵</kbd> Open
                    </span>
                    <span className="flex items-center gap-1">
                        <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">Esc</kbd> Close
                    </span>
                </div>
            </div>
        </div>
    );
}
