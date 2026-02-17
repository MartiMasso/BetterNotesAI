"use client";

import { useState, useEffect } from "react";
import { createProject, listProjects, saveOutputFile, saveChat, type Project } from "@/lib/api";
import { useToast } from "@/app/components/Toast";

interface SaveModalProps {
    open: boolean;
    onClose: () => void;
    latex: string;
    messages: Array<{ role: string; content: string }>;
    templateId?: string | null;
    onSaved?: (projectId?: string) => void;
}

export default function SaveProjectModal({ open, onClose, latex, messages, templateId, onSaved }: SaveModalProps) {
    const { toast } = useToast();
    const [tab, setTab] = useState<"project" | "existing" | "chat">("project");
    const [saving, setSaving] = useState(false);

    // Project form fields
    const [title, setTitle] = useState("Untitled Project");
    const [description, setDescription] = useState("");
    const [visibility, setVisibility] = useState<"private" | "public" | "unlisted">("private");

    // Existing project
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    // Chat save
    const [chatTitle, setChatTitle] = useState("Untitled Chat");

    useEffect(() => {
        if (open && tab === "existing") {
            loadExistingProjects();
        }
    }, [open, tab]);

    async function loadExistingProjects() {
        setLoadingProjects(true);
        const list = await listProjects({ limit: 100 });
        setProjects(list);
        setLoadingProjects(false);
    }

    async function handleSaveAsProject() {
        if (!title.trim()) return;
        setSaving(true);
        const { project, error } = await createProject({
            title: title.trim(),
            description: description.trim() || undefined,
            template_id: templateId || undefined,
            visibility,
        });
        if (!project) {
            toast(error || "Failed to create project.", "error");
            setSaving(false);
            return;
        }
        await saveOutputFile(project.id, "main.tex", latex);
        toast(`Project "${title}" created!`, "success");
        setSaving(false);
        onSaved?.(project.id);
        onClose();
    }

    async function handleSaveToExisting() {
        if (!selectedProjectId) return;
        setSaving(true);
        const target = projects.find(p => p.id === selectedProjectId);
        await saveOutputFile(selectedProjectId, "main.tex", latex);
        toast(`Saved to "${target?.title || 'project'}"!`, "success");
        setSaving(false);
        onSaved?.(selectedProjectId);
        onClose();
    }

    async function handleSaveAsChat() {
        setSaving(true);
        const chatId = await saveChat({
            title: chatTitle.trim() || "Untitled Chat",
            template_id: templateId || undefined,
            latex_content: latex,
            messages,
        });
        if (chatId) {
            toast("Chat saved!", "success");
        } else {
            toast("Failed to save chat.", "error");
        }
        setSaving(false);
        onSaved?.();
        onClose();
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 pt-5 pb-4 border-b border-white/8">
                    <h2 className="text-lg font-semibold text-white">Save</h2>
                    <p className="text-xs text-white/40 mt-0.5">Choose how to save your work</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 pt-4">
                    {([
                        { key: "project" as const, label: "New Project", icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" },
                        { key: "existing" as const, label: "Existing Project", icon: "M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" },
                        { key: "chat" as const, label: "Save as Chat", icon: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" },
                    ]).map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${tab === t.key
                                    ? "bg-white text-neutral-950"
                                    : "text-white/50 hover:text-white/70 hover:bg-white/5"
                                }`}
                        >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                            </svg>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="px-6 py-5 min-h-[200px]">
                    {/* ── New project form ── */}
                    {tab === "project" && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-white/50 mb-1.5 font-medium">Title *</label>
                                <input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25 transition-colors"
                                    placeholder="Project title…"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-white/50 mb-1.5 font-medium">Description</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25 transition-colors resize-none h-20"
                                    placeholder="Optional description…"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-white/50 mb-1.5 font-medium">Visibility</label>
                                <div className="flex gap-2">
                                    {([
                                        { key: "private" as const, label: "Private", desc: "Only you" },
                                        { key: "public" as const, label: "Public", desc: "Everyone" },
                                        { key: "unlisted" as const, label: "Unlisted", desc: "Via link" },
                                    ]).map(v => (
                                        <button
                                            key={v.key}
                                            onClick={() => setVisibility(v.key)}
                                            className={`flex-1 rounded-xl border px-3 py-2 text-left transition-all ${visibility === v.key
                                                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                                                    : "border-white/10 bg-white/5 text-white/50 hover:bg-white/8"
                                                }`}
                                        >
                                            <div className="text-xs font-medium">{v.label}</div>
                                            <div className="text-[10px] opacity-60">{v.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Existing project picker ── */}
                    {tab === "existing" && (
                        <div>
                            {loadingProjects ? (
                                <div className="flex items-center justify-center h-40">
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                </div>
                            ) : projects.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-2">
                                    <div className="text-white/30 text-sm">No projects found</div>
                                    <div className="text-white/15 text-xs">Create a new project first</div>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {projects.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedProjectId(p.id)}
                                            className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${selectedProjectId === p.id
                                                    ? "border-emerald-400/40 bg-emerald-500/10"
                                                    : "border-white/8 bg-white/[0.02] hover:bg-white/5 hover:border-white/12"
                                                }`}
                                        >
                                            <div className="text-sm text-white font-medium truncate">{p.title}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {p.description && <span className="text-[10px] text-white/30 truncate">{p.description}</span>}
                                                <span className="text-[10px] text-white/20">{new Date(p.updated_at).toLocaleDateString()}</span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${p.visibility === "public" ? "bg-emerald-500/15 text-emerald-300/60" :
                                                        p.visibility === "unlisted" ? "bg-amber-500/15 text-amber-300/60" :
                                                            "bg-white/5 text-white/30"
                                                    }`}>{p.visibility}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Save as chat ── */}
                    {tab === "chat" && (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                                <div className="text-white/30 text-xs mb-3">Saves the conversation and LaTeX content as a chat entry. You can access it later from the Chats tab.</div>
                                <label className="block text-xs text-white/50 mb-1.5 font-medium">Chat title</label>
                                <input
                                    value={chatTitle}
                                    onChange={e => setChatTitle(e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25 transition-colors"
                                    placeholder="Chat title…"
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-3">
                    <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/50 hover:text-white/70 transition-colors">Cancel</button>
                    <button
                        onClick={tab === "project" ? handleSaveAsProject : tab === "existing" ? handleSaveToExisting : handleSaveAsChat}
                        disabled={saving || (tab === "project" && !title.trim()) || (tab === "existing" && !selectedProjectId)}
                        className="rounded-xl px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? (
                            <span className="flex items-center gap-2">
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving…
                            </span>
                        ) : (
                            tab === "project" ? "Create Project" :
                                tab === "existing" ? "Save to Project" :
                                    "Save Chat"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
