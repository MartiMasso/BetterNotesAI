"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listProjects, createProject, type Project } from "@/lib/api";
import { supabase } from "@/supabaseClient";
import ProjectCard from "@/app/components/ProjectCard";
import { templates } from "@/lib/templates";
import type { User } from "@supabase/supabase-js";

type Filter = "all" | "starred" | "shared";

export default function ProjectsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("all");
    const [search, setSearch] = useState("");
    const [showNewModal, setShowNewModal] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newTemplateId, setNewTemplateId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    // Auth
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => setUser(session?.user ?? null)
        );
        return () => subscription.unsubscribe();
    }, []);

    // Auto-open new modal from URL
    useEffect(() => {
        if (searchParams.get("new") === "true") {
            setShowNewModal(true);
        }
    }, [searchParams]);

    const fetchProjects = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const data = await listProjects({
            starred: filter === "starred" ? true : undefined,
            search: search.trim() || undefined,
        });
        setProjects(data);
        setLoading(false);
    }, [user, filter, search]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    async function handleCreateProject() {
        if (creating) return;
        setCreating(true);
        const project = await createProject({
            title: newTitle.trim() || "Untitled Project",
            template_id: newTemplateId || undefined,
        });
        setCreating(false);
        if (project) {
            setShowNewModal(false);
            setNewTitle("");
            setNewTemplateId(null);
            router.push(`/workspace/${project.id}`);
        }
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="text-white/40 text-sm">Sign in to view your projects</div>
            </div>
        );
    }

    const filterButtons: { key: Filter; label: string }[] = [
        { key: "all", label: "All" },
        { key: "starred", label: "Starred" },
    ];

    return (
        <div className="max-w-6xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Projects</h1>
                    <p className="text-sm text-white/40 mt-1">
                        {projects.length} project{projects.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600/80 to-blue-600/80 hover:from-purple-500 hover:to-blue-500 border border-white/10 px-4 py-2.5 text-sm font-medium text-white transition-all"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    New Project
                </button>
            </div>

            {/* Search + Filters */}
            <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search projects..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/20 focus:bg-white/8 transition-colors"
                    />
                </div>

                <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5">
                    {filterButtons.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === key
                                    ? "bg-white/15 text-white"
                                    : "text-white/50 hover:text-white/70"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.03] h-52 animate-pulse" />
                    ))}
                </div>
            ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <svg className="h-16 w-16 text-white/10 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="0.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <p className="text-white/40 text-sm mb-4">
                        {search ? "No projects match your search" : "No projects yet"}
                    </p>
                    {!search && (
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/15 transition-colors"
                        >
                            Create your first project
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {projects.map((p) => (
                        <ProjectCard key={p.id} project={p} onUpdate={fetchProjects} />
                    ))}
                </div>
            )}

            {/* New Project Modal */}
            {showNewModal && (
                <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="rounded-2xl border border-white/15 bg-neutral-900 p-6 shadow-2xl max-w-md w-full mx-4">
                        <h2 className="text-lg font-semibold text-white mb-4">New Project</h2>

                        <label className="block text-xs text-white/50 mb-1">Project name</label>
                        <input
                            autoFocus
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreateProject(); }}
                            placeholder="e.g. Thermodynamics Notes"
                            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/25 mb-4"
                        />

                        <label className="block text-xs text-white/50 mb-2">Template (optional)</label>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto mb-4">
                            {templates.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setNewTemplateId(newTemplateId === t.id ? null : t.id)}
                                    className={`rounded-xl border px-3 py-2 text-xs text-left transition-colors ${newTemplateId === t.id
                                            ? "border-purple-500/50 bg-purple-500/10 text-white"
                                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/8"
                                        }`}
                                >
                                    {t.name}
                                    {t.isPro && <span className="ml-1 text-[10px] text-purple-300">PRO</span>}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => { setShowNewModal(false); setNewTitle(""); setNewTemplateId(null); }}
                                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateProject}
                                disabled={creating}
                                className="rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50"
                            >
                                {creating ? "Creating..." : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
