"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { deleteProject, starProject, duplicateProject, updateProject, type Project } from "@/lib/api";

interface ProjectCardProps {
    project: Project;
    onUpdate: () => void; // refresh parent list
}

export default function ProjectCard({ project, onUpdate }: ProjectCardProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(project.title);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    async function handleStar() {
        await starProject(project.id, !project.is_starred);
        setMenuOpen(false);
        onUpdate();
    }

    async function handleDuplicate() {
        await duplicateProject(project.id);
        setMenuOpen(false);
        onUpdate();
    }

    async function handleRename() {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== project.title) {
            await updateProject(project.id, { title: trimmed });
            onUpdate();
        }
        setRenaming(false);
    }

    async function handleDelete() {
        await deleteProject(project.id);
        setConfirmDelete(false);
        onUpdate();
    }

    const timeAgo = getRelativeTime(project.updated_at);

    return (
        <>
            <div className="group relative rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15 transition-all duration-200 overflow-hidden">
                {/* Cover area */}
                <Link href={`/workspace/${project.id}`} className="block">
                    <div className="h-32 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent flex items-center justify-center">
                        <svg className="h-10 w-10 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="0.75">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                    </div>
                </Link>

                {/* Info */}
                <div className="px-4 py-3">
                    {renaming ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename();
                                if (e.key === "Escape") setRenaming(false);
                            }}
                            onBlur={handleRename}
                            className="w-full rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-sm text-white outline-none"
                        />
                    ) : (
                        <Link href={`/workspace/${project.id}`}>
                            <h3 className="text-sm font-medium text-white/90 truncate hover:text-white transition-colors">
                                {project.title || "Untitled"}
                            </h3>
                        </Link>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/35">
                        <span>{timeAgo}</span>
                        {project.template_id && (
                            <>
                                <span>·</span>
                                <span className="truncate">{project.template_id}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Star indicator */}
                {project.is_starred && (
                    <div className="absolute top-2 left-2">
                        <svg className="h-4 w-4 text-yellow-400/70" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                    </div>
                )}

                {/* Kebab menu */}
                <div ref={menuRef} className="absolute top-2 right-2">
                    <button
                        onClick={(e) => { e.preventDefault(); setMenuOpen(!menuOpen); }}
                        className="h-7 w-7 rounded-lg bg-black/30 border border-white/10 text-white/50 hover:text-white/80 hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 mt-1 w-40 rounded-xl border border-white/15 bg-neutral-900/95 backdrop-blur shadow-xl py-1 z-50">
                            <button onClick={() => { setMenuOpen(false); setRenameValue(project.title); setRenaming(true); }} className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                                Rename
                            </button>
                            <button onClick={handleStar} className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2">
                                <svg className="h-3.5 w-3.5" fill={project.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                                {project.is_starred ? "Unstar" : "Star"}
                            </button>
                            <button onClick={handleDuplicate} className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                                Duplicate
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                            <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 flex items-center gap-2">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete confirmation */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="rounded-2xl border border-white/15 bg-neutral-900 p-5 shadow-2xl max-w-sm w-full mx-4">
                        <div className="text-sm font-semibold text-white">Delete project?</div>
                        <div className="mt-2 text-xs text-white/60">
                            This will permanently delete &ldquo;{project.title}&rdquo; and all its files. This cannot be undone.
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button onClick={() => setConfirmDelete(false)} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">Cancel</button>
                            <button onClick={handleDelete} className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
