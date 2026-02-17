"use client";

import { useState, useEffect } from "react";
import { listProjects, listOutputFiles, type Project, type OutputFile } from "@/lib/api";
import { useToast } from "@/app/components/Toast";

interface ImportProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (files: { path: string; content: string }[], projectTitle: string) => void;
}

export default function ImportProjectModal({ isOpen, onClose, onImport }: ImportProjectModalProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [playgroundSessions, setPlaygroundSessions] = useState<Project[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (!isOpen) return;
        (async () => {
            setLoading(true);
            const [p, pg] = await Promise.all([
                listProjects({ is_playground: false }),
                listProjects({ is_playground: true }),
            ]);
            setProjects(p);
            setPlaygroundSessions(pg);
            setLoading(false);
        })();
    }, [isOpen]);

    if (!isOpen) return null;

    const filtered = (list: Project[]) =>
        search.trim()
            ? list.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
            : list;

    async function handleSelect(project: Project) {
        setImporting(project.id);
        try {
            const outputFiles = await listOutputFiles(project.id);
            const files = outputFiles
                .filter((f: OutputFile) => !f.is_binary && f.content)
                .map((f: OutputFile) => ({ path: f.file_path, content: f.content || "" }));
            if (files.length === 0) {
                toast("This project has no text files to import.", "warning");
                return;
            }
            onImport(files, project.title);
            onClose();
        } catch {
            toast("Failed to load project files.", "error");
        } finally {
            setImporting(null);
        }
    }

    const renderList = (title: string, items: Project[]) => {
        const list = filtered(items);
        if (list.length === 0) return null;
        return (
            <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-white/30 mb-2 px-1">{title}</div>
                <div className="space-y-1">
                    {list.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => handleSelect(p)}
                            disabled={importing === p.id}
                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors group flex items-center justify-between disabled:opacity-50"
                        >
                            <div className="min-w-0">
                                <div className="text-sm text-white/90 truncate">{p.title}</div>
                                <div className="text-[11px] text-white/35">{new Date(p.updated_at).toLocaleDateString()}</div>
                            </div>
                            {importing === p.id ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
                            ) : (
                                <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md max-h-[70vh] flex flex-col rounded-2xl border border-white/15 bg-neutral-900/95 backdrop-blur-xl shadow-2xl">
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold">Import from Project</h3>
                        <p className="text-[11px] text-white/40">Select a project to load its files into the playground</p>
                    </div>
                    <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-white/8">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search projects…"
                        className="w-full h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30"
                        autoFocus
                    />
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {renderList("Projects", projects)}
                            {renderList("Playground Sessions", playgroundSessions)}
                            {filtered(projects).length === 0 && filtered(playgroundSessions).length === 0 && (
                                <div className="text-center text-white/30 text-sm py-8">No projects found</div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
