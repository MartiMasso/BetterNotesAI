"use client";

import { useState } from "react";
import type { ProjectFileRecord } from "@/lib/api";

interface FileTreeProps {
    files: ProjectFileRecord[];
    selectedId?: string | null;
    onSelect: (file: ProjectFileRecord) => void;
    onDelete?: (file: ProjectFileRecord) => void;
    onNewFolder?: (parentId: string | null) => void;
    onUpload?: (parentId: string | null) => void;
    title?: string;
    emptyText?: string;
}

export default function FileTree({ files, selectedId, onSelect, onDelete, onNewFolder, onUpload, title = "Files", emptyText = "No files" }: FileTreeProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

    const toggleFolder = (id: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleContextMenu = (e: React.MouseEvent, file: ProjectFileRecord) => {
        e.preventDefault();
        setContextMenu({ id: file.id, x: e.clientX, y: e.clientY });
    };

    // Build tree from flat list
    const rootFiles = files.filter((f) => !f.parent_folder_id);
    const childrenOf = (parentId: string) => files.filter((f) => f.parent_folder_id === parentId);

    function renderNode(file: ProjectFileRecord, depth: number) {
        const isFolder = file.is_folder;
        const isExpanded = expandedFolders.has(file.id);
        const isSelected = selectedId === file.id;
        const children = isFolder ? childrenOf(file.id) : [];

        return (
            <div key={file.id}>
                <button
                    onClick={() => {
                        if (isFolder) toggleFolder(file.id);
                        else onSelect(file);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    className={`w-full flex items-center gap-2 rounded-lg text-xs transition-colors group ${isSelected
                            ? "bg-white/12 text-white"
                            : "text-white/60 hover:bg-white/8 hover:text-white/80"
                        }`}
                    style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "8px", paddingTop: "6px", paddingBottom: "6px" }}
                >
                    {isFolder ? (
                        <svg className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    ) : (
                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                    )}
                    <span className="truncate flex-1 text-left">{file.name}</span>
                    {!isFolder && file.size_bytes && (
                        <span className="text-[10px] text-white/25 ml-auto">{formatSize(file.size_bytes)}</span>
                    )}
                </button>
                {isFolder && isExpanded && (
                    <div>
                        {children.length === 0 ? (
                            <div className="text-[10px] text-white/25" style={{ paddingLeft: `${28 + depth * 16}px`, paddingTop: "4px", paddingBottom: "4px" }}>Empty</div>
                        ) : (
                            children.sort(sortFiles).map((c) => renderNode(c, depth + 1))
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{title}</span>
                <div className="flex items-center gap-1">
                    {onNewFolder && (
                        <button onClick={() => onNewFolder(null)} className="h-6 w-6 rounded-md text-white/30 hover:text-white/60 hover:bg-white/10 flex items-center justify-center" title="New folder">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                            </svg>
                        </button>
                    )}
                    {onUpload && (
                        <button onClick={() => onUpload(null)} className="h-6 w-6 rounded-md text-white/30 hover:text-white/60 hover:bg-white/10 flex items-center justify-center" title="Upload file">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
                {rootFiles.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-white/25 text-center">{emptyText}</div>
                ) : (
                    rootFiles.sort(sortFiles).map((f) => renderNode(f, 0))
                )}
            </div>

            {/* Context menu */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
                    <div className="fixed z-50 w-36 rounded-xl border border-white/15 bg-neutral-900/95 backdrop-blur shadow-xl py-1" style={{ left: contextMenu.x, top: contextMenu.y }}>
                        {onDelete && (
                            <button
                                onClick={() => {
                                    const file = files.find((f) => f.id === contextMenu.id);
                                    if (file) onDelete(file);
                                    setContextMenu(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 flex items-center gap-2"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                Delete
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function sortFiles(a: ProjectFileRecord, b: ProjectFileRecord) {
    if (a.is_folder && !b.is_folder) return -1;
    if (!a.is_folder && b.is_folder) return 1;
    return a.name.localeCompare(b.name);
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
}
