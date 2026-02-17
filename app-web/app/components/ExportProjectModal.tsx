"use client";

import { useState, useEffect } from "react";
import { createProject, listProjects, saveOutputFile, type Project } from "@/lib/api";
import { useToast } from "@/app/components/Toast";
import { useDialog } from "@/app/components/ConfirmDialog";

interface ExportProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    files: { path: string; content: string }[];
    sessionName: string;
    onExported?: (projectId: string) => void;
}

export default function ExportProjectModal({ isOpen, onClose, files, sessionName, onExported }: ExportProjectModalProps) {
    const [tab, setTab] = useState<"new" | "existing">("new");
    const [title, setTitle] = useState(sessionName || "Untitled Project");
    const [projects, setProjects] = useState<Project[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const { toast } = useToast();
    const { showConfirm } = useDialog();

    useEffect(() => {
        if (!isOpen) return;
        setTitle(sessionName || "Untitled Project");
        (async () => {
            setLoading(true);
            const p = await listProjects({ is_playground: false });
            setProjects(p);
            setLoading(false);
        })();
    }, [isOpen, sessionName]);

    if (!isOpen) return null;

    const filtered = search.trim()
        ? projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
        : projects;

    async function handleCreateNew() {
        if (!title.trim()) return;
        setExporting(true);
        try {
            const { project, error: createErr } = await createProject({ title: title.trim(), is_playground: false });
            if (!project) { toast(createErr || "Failed to create project.", "error"); return; }
            for (const f of files) {
                await saveOutputFile(project.id, f.path, f.content);
            }
            onExported?.(project.id);
            onClose();
        } catch {
            toast("Export failed.", "error");
        } finally {
            setExporting(false);
        }
    }

    async function handleExportToExisting(project: Project) {
        const ok = await showConfirm({ title: "Overwrite Files?", message: `This will add/overwrite files in "${project.title}". Continue?`, confirmText: "Export", variant: "danger" });
        if (!ok) return;
        setExporting(true);
        try {
            for (const f of files) {
                await saveOutputFile(project.id, f.path, f.content);
            }
            onExported?.(project.id);
            onClose();
        } catch {
            toast("Export failed.", "error");
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md max-h-[70vh] flex flex-col rounded-2xl border border-white/15 bg-neutral-900/95 backdrop-blur-xl shadow-2xl">
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold">Export to Project</h3>
                        <p className="text-[11px] text-white/40">{files.length} file{files.length !== 1 ? "s" : ""} to export</p>
                    </div>
                    <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-5 py-3 border-b border-white/8 flex gap-2">
                    <button onClick={() => setTab("new")} className={`rounded-xl px-3 py-1.5 text-xs border ${tab === "new" ? "bg-white text-neutral-950 border-white" : "bg-white/8 text-white/70 border-white/10 hover:bg-white/12"}`}>New Project</button>
                    <button onClick={() => setTab("existing")} className={`rounded-xl px-3 py-1.5 text-xs border ${tab === "existing" ? "bg-white text-neutral-950 border-white" : "bg-white/8 text-white/70 border-white/10 hover:bg-white/12"}`}>Existing Project</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {tab === "new" ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-white/50 mb-1.5 block">Project Title</label>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30"
                                    placeholder="My LaTeX Project"
                                    autoFocus
                                />
                            </div>
                            <button
                                onClick={handleCreateNew}
                                disabled={!title.trim() || exporting}
                                className={`w-full h-10 rounded-xl text-sm font-semibold ${title.trim() && !exporting ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed"}`}
                            >
                                {exporting ? "Exporting…" : "Create & Export"}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search projects…"
                                className="w-full h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30 mb-3"
                            />
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center text-white/30 text-sm py-8">No projects found</div>
                            ) : (
                                <div className="space-y-1">
                                    {filtered.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleExportToExisting(p)}
                                            disabled={exporting}
                                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors flex items-center justify-between disabled:opacity-50"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm text-white/90 truncate">{p.title}</div>
                                                <div className="text-[11px] text-white/35">{new Date(p.updated_at).toLocaleDateString()}</div>
                                            </div>
                                            <svg className="w-4 h-4 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
