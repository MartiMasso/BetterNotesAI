"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchDocuments, rateDocument, createProject, type PublishedDocument } from "@/lib/api";

export default function ExplorePage() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PublishedDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = useCallback(async (q: string, newOffset = 0) => {
        if (!q.trim()) { setResults([]); setSearched(false); return; }
        setLoading(true);
        const docs = await searchDocuments(q.trim(), 21, newOffset);
        const more = docs.length > 20;
        const page = more ? docs.slice(0, 20) : docs;

        if (newOffset === 0) {
            setResults(page);
        } else {
            setResults((prev) => [...prev, ...page]);
        }
        setHasMore(more);
        setOffset(newOffset + page.length);
        setSearched(true);
        setLoading(false);
    }, []);

    function handleInputChange(val: string) {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(val, 0), 400);
    }

    async function handleCopyToWorkspace(doc: PublishedDocument) {
        const project = await createProject({ title: `${doc.title} (Copy)` });
        if (project) {
            router.push(`/workspace/${project.id}`);
        }
    }

    async function handleRate(docId: string, rating: number) {
        const ok = await rateDocument(docId, rating);
        if (ok) {
            setResults((prev) =>
                prev.map((d) =>
                    d.id === docId ? { ...d, avg_rating: rating, rating_count: d.rating_count + 1 } : d
                )
            );
        }
    }

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-1">Explore</h1>
            <p className="text-white/50 text-sm mb-6">Search public documents shared by the community.</p>

            {/* Search bar */}
            <div className="relative mb-8">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="Search by title, subject, tag…"
                    className="w-full h-11 rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm outline-none placeholder:text-white/35 text-white focus:border-white/25 transition-colors"
                />
            </div>

            {/* Results */}
            {!searched && !loading && (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] h-64 flex items-center justify-center">
                    <div className="text-center">
                        <svg className="h-8 w-8 text-white/8 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <div className="text-white/20 text-sm">Start typing to search</div>
                        <div className="text-white/10 text-xs mt-0.5">Find notes, summaries, and documents</div>
                    </div>
                </div>
            )}

            {searched && results.length === 0 && !loading && (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] h-48 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-white/20 text-sm">No results found</div>
                        <div className="text-white/10 text-xs mt-0.5">Try a different search term</div>
                    </div>
                </div>
            )}

            {results.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.map((doc) => (
                        <ExploreCard
                            key={doc.id}
                            doc={doc}
                            onCopy={() => handleCopyToWorkspace(doc)}
                            onRate={(r) => handleRate(doc.id, r)}
                        />
                    ))}
                </div>
            )}

            {hasMore && (
                <div className="flex justify-center mt-6">
                    <button
                        onClick={() => search(query, offset)}
                        disabled={loading}
                        className="rounded-xl px-5 py-2.5 text-sm border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-30"
                    >
                        {loading ? "Loading…" : "Load more"}
                    </button>
                </div>
            )}

            {loading && results.length === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="rounded-xl border border-white/8 bg-white/[0.03] h-44 animate-pulse" />
                    ))}
                </div>
            )}
        </div>
    );
}

function ExploreCard({ doc, onCopy, onRate }: { doc: PublishedDocument; onCopy: () => void; onRate: (r: number) => void }) {
    const [hoverRating, setHoverRating] = useState(0);

    return (
        <div className="rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden hover:border-white/15 transition-colors group">
            {/* Thumbnail */}
            <div className="h-24 bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center relative">
                {doc.thumbnail_url ? (
                    <img src={doc.thumbnail_url} alt={doc.title} className="w-full h-full object-cover" />
                ) : (
                    <svg className="h-8 w-8 text-white/8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                )}
                {doc.category && (
                    <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-white/60">{doc.category}</span>
                )}
            </div>

            <div className="p-3">
                <div className="text-sm font-medium text-white truncate">{doc.title}</div>
                {doc.description && <div className="text-xs text-white/40 mt-0.5 line-clamp-2">{doc.description}</div>}

                {/* Meta */}
                <div className="flex items-center gap-2 mt-2 text-[10px] text-white/30">
                    {doc.user_display_name && <span>{doc.user_display_name}</span>}
                    {doc.university_name && <><span>·</span><span>{doc.university_name}</span></>}
                    {doc.subject_name && <><span>·</span><span>{doc.subject_name}</span></>}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => onRate(star)}
                            className="transition-colors"
                        >
                            <svg className={`h-3.5 w-3.5 ${(hoverRating || doc.avg_rating) >= star ? "text-amber-400" : "text-white/10"}`} fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                        </button>
                    ))}
                    <span className="text-[10px] text-white/20 ml-1">({doc.rating_count})</span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-3">
                    {doc.pdf_url && (
                        <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white/40 hover:text-white/60 underline underline-offset-2">
                            View PDF
                        </a>
                    )}
                    <button onClick={onCopy} className="text-[10px] text-emerald-400/70 hover:text-emerald-400 font-medium">
                        Copy to workspace →
                    </button>
                </div>
            </div>
        </div>
    );
}
