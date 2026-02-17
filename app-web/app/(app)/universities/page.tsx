"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import {
    listUniversities, listPrograms, listSubjects,
    getProfile, updateProfile, searchDocuments,
    type University, type DegreeProgram, type Subject,
    type PublishedDocument, type UserProfile,
} from "@/lib/api";

type SetupStep = "university" | "program" | "done";

export default function UniversitiesPage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Setup flow
    const [setupStep, setSetupStep] = useState<SetupStep>("done");
    const [universities, setUniversities] = useState<University[]>([]);
    const [programs, setPrograms] = useState<DegreeProgram[]>([]);
    const [selectedUni, setSelectedUni] = useState<string | null>(null);
    const [uniSearch, setUniSearch] = useState("");
    const [savingSetup, setSavingSetup] = useState(false);

    // Course tree
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    const [subjectDocs, setSubjectDocs] = useState<PublishedDocument[]>([]);
    const [docsLoading, setDocsLoading] = useState(false);

    // Load profile + decide setup or tree
    useEffect(() => {
        async function init() {
            const p = await getProfile();
            setProfile(p);
            if (!p?.university_id || !p?.degree_program_id) {
                setSetupStep("university");
                const unis = await listUniversities();
                setUniversities(unis);
            } else {
                // Load subjects for their program
                const subs = await listSubjects(p.degree_program_id);
                setSubjects(subs);
            }
            setLoading(false);
        }
        init();
    }, []);

    // Load programs when university selected
    useEffect(() => {
        if (!selectedUni) { setPrograms([]); return; }
        listPrograms(selectedUni).then(setPrograms);
    }, [selectedUni]);

    async function handleSelectProgram(programId: string) {
        if (!selectedUni) return;
        setSavingSetup(true);
        await updateProfile({ university_id: selectedUni, degree_program_id: programId });
        const subs = await listSubjects(programId);
        setSubjects(subs);
        const p = await getProfile();
        setProfile(p);
        setSetupStep("done");
        setSavingSetup(false);
    }

    async function handleSubjectClick(subject: Subject) {
        setSelectedSubject(subject);
        setDocsLoading(true);
        // Search documents for this subject
        const docs = await searchDocuments(subject.name, 20, 0);
        setSubjectDocs(docs);
        setDocsLoading(false);
    }

    function handleChangeSetup() {
        setSetupStep("university");
        setSelectedUni(null);
        setPrograms([]);
        listUniversities().then(setUniversities);
    }

    const filteredUnis = uniSearch.trim()
        ? universities.filter((u) => u.name.toLowerCase().includes(uniSearch.toLowerCase()) || u.city?.toLowerCase().includes(uniSearch.toLowerCase()))
        : universities;

    // Group subjects by year
    const subjectsByYear: Record<number, Subject[]> = {};
    for (const s of subjects) {
        const y = s.year ?? 0;
        if (!subjectsByYear[y]) subjectsByYear[y] = [];
        subjectsByYear[y].push(s);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-white/40 text-sm">Loading…</div>
            </div>
        );
    }

    // ── Setup Flow ──
    if (setupStep !== "done") {
        return (
            <div className="min-h-screen p-6 md:p-10 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold mb-1">My Studies</h1>
                <p className="text-white/50 text-sm mb-8">Set up your university and degree to see your course tree.</p>

                {/* Step 1: University */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${setupStep === "university" ? "bg-white text-neutral-950" : "bg-white/10 text-white/50"}`}>1</div>
                        <span className={`text-sm font-semibold ${setupStep === "university" ? "text-white" : "text-white/40"}`}>Select your university</span>
                    </div>

                    {setupStep === "university" && (
                        <>
                            <input
                                value={uniSearch}
                                onChange={(e) => setUniSearch(e.target.value)}
                                placeholder="Search universities…"
                                className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-white/35 text-white mb-3"
                            />
                            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.03]">
                                {filteredUnis.length === 0 ? (
                                    <div className="p-4 text-sm text-white/30 text-center">No universities found</div>
                                ) : filteredUnis.map((u) => (
                                    <button
                                        key={u.id}
                                        onClick={() => { setSelectedUni(u.id); setSetupStep("program"); }}
                                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors"
                                    >
                                        <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-white/40 flex-shrink-0">
                                            {u.short_name?.slice(0, 3) || u.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm text-white">{u.name}</div>
                                            {u.city && <div className="text-[11px] text-white/40">{u.city}, {u.country}</div>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Step 2: Program */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${setupStep === "program" ? "bg-white text-neutral-950" : "bg-white/10 text-white/50"}`}>2</div>
                        <span className={`text-sm font-semibold ${setupStep === "program" ? "text-white" : "text-white/40"}`}>Select your degree program</span>
                    </div>

                    {setupStep === "program" && (
                        <div className="rounded-xl border border-white/8 bg-white/[0.03]">
                            {programs.length === 0 ? (
                                <div className="p-4 text-sm text-white/30 text-center">Loading programs…</div>
                            ) : programs.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => handleSelectProgram(p.id)}
                                    disabled={savingSetup}
                                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors disabled:opacity-50"
                                >
                                    <div>
                                        <div className="text-sm text-white">{p.name}</div>
                                        <div className="text-[11px] text-white/40">{p.degree_type ? p.degree_type.charAt(0).toUpperCase() + p.degree_type.slice(1) : "Degree"} · {p.years} years</div>
                                    </div>
                                    <svg className="h-4 w-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                </button>
                            ))}
                            <button onClick={() => setSetupStep("university")} className="w-full text-left px-4 py-2 text-xs text-white/40 hover:text-white/60 transition-colors">
                                ← Back to universities
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Course Tree (after setup) ──
    return (
        <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold">My Studies</h1>
                    <p className="text-white/50 text-sm mt-1">Browse your course subjects and find documents.</p>
                </div>
                <button onClick={handleChangeSetup} className="text-xs rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10 text-white/60">
                    Change university
                </button>
            </div>

            <div className="flex gap-6">
                {/* Subject tree */}
                <div className="w-72 flex-shrink-0">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/8">
                            <div className="text-xs font-semibold text-white/30 uppercase tracking-wider">Subjects</div>
                        </div>
                        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                            {Object.keys(subjectsByYear).length === 0 ? (
                                <div className="p-4 text-sm text-white/30 text-center">No subjects found</div>
                            ) : (
                                Object.entries(subjectsByYear).sort(([a], [b]) => Number(a) - Number(b)).map(([year, subs]) => (
                                    <div key={year}>
                                        <div className="px-4 py-2 text-[10px] font-bold text-white/20 uppercase tracking-widest bg-white/[0.02]">
                                            {Number(year) === 0 ? "General" : `Year ${year}`}
                                        </div>
                                        {subs.map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() => handleSubjectClick(s)}
                                                className={`w-full text-left px-4 py-2.5 text-sm border-b border-white/5 transition-colors ${selectedSubject?.id === s.id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/80"}`}
                                            >
                                                {s.name}
                                                {s.semester && <span className="text-[10px] text-white/20 ml-1.5">S{s.semester}</span>}
                                            </button>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Subject documents */}
                <div className="flex-1 min-w-0">
                    {!selectedSubject ? (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] h-64 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-white/20 text-sm mb-1">Select a subject</div>
                                <div className="text-white/10 text-xs">Browse documents from your classmates</div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-lg font-semibold mb-4">{selectedSubject.name}</h2>
                            {docsLoading ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="rounded-xl border border-white/8 bg-white/[0.03] h-32 animate-pulse" />
                                    ))}
                                </div>
                            ) : subjectDocs.length === 0 ? (
                                <div className="rounded-2xl border border-white/8 bg-white/[0.03] h-48 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-white/20 text-sm mb-1">No documents yet</div>
                                        <div className="text-white/10 text-xs">Be the first to publish!</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {subjectDocs.map((doc) => (
                                        <DocumentCard key={doc.id} doc={doc} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function DocumentCard({ doc }: { doc: PublishedDocument }) {
    return (
        <div className="rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden hover:border-white/15 transition-colors group">
            {/* Thumbnail */}
            <div className="h-20 bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                {doc.thumbnail_url ? (
                    <img src={doc.thumbnail_url} alt={doc.title} className="w-full h-full object-cover" />
                ) : (
                    <svg className="h-6 w-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                )}
            </div>
            <div className="p-3">
                <div className="text-sm font-medium text-white truncate">{doc.title}</div>
                {doc.description && <div className="text-xs text-white/40 mt-0.5 line-clamp-2">{doc.description}</div>}
                <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1 text-[10px] text-white/30">
                        {doc.user_display_name && <span>{doc.user_display_name}</span>}
                        {doc.avg_rating > 0 && (
                            <span className="flex items-center gap-0.5 ml-1.5">
                                <svg className="h-2.5 w-2.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                                {doc.avg_rating.toFixed(1)}
                            </span>
                        )}
                    </div>
                    {doc.pdf_url && (
                        <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-400/70 hover:text-emerald-400">
                            View PDF
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
