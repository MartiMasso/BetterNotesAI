"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/supabaseClient";
import {
    listOutputFiles, saveOutputFile, promotePlayground,
    type Project
} from "@/lib/api";
import { savePlaygroundDraft, loadPlaygroundDraft, clearPlaygroundDraft } from "@/lib/playgroundDraft";
import ImportProjectModal from "@/app/components/ImportProjectModal";
import ExportProjectModal from "@/app/components/ExportProjectModal";
import { useToast } from "@/app/components/Toast";
import { useDialog } from "@/app/components/ConfirmDialog";
import type { User } from "@supabase/supabase-js";

// ── Types ──
interface PlaygroundFile {
    path: string;
    content: string;
    dirty: boolean;
}

const DEFAULT_LATEX = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}

\\title{Untitled Document}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}

Start writing here\\ldots

\\end{document}
`;

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

// ── Main wrapper with Suspense for useSearchParams ──
export default function PlaygroundPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full min-h-[60vh]"><div className="text-white/40 text-sm">Loading playground…</div></div>}>
            <PlaygroundContent />
        </Suspense>
    );
}

function PlaygroundContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { showConfirm } = useDialog();
    const cloudProjectId = searchParams.get("project");

    // Auth
    const [user, setUser] = useState<User | null>(null);

    // Mode
    const isCloud = !!cloudProjectId;

    // Files
    const [files, setFiles] = useState<PlaygroundFile[]>([
        { path: "main.tex", content: DEFAULT_LATEX, dirty: false },
    ]);
    const [activeFilePath, setActiveFilePath] = useState("main.tex");
    const [openTabs, setOpenTabs] = useState<string[]>(["main.tex"]);
    const [sessionName, setSessionName] = useState("Untitled Session");

    // Split view
    const [splitRatio, setSplitRatio] = useState(50);
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const isDraggingRef = useRef(false);

    // Compilation
    const [pdfUrl, setPdfUrl] = useState("");
    const [isCompiling, setIsCompiling] = useState(false);
    const [compileError, setCompileError] = useState("");
    const [compileLog, setCompileLog] = useState("");
    const [consoleOpen, setConsoleOpen] = useState(false);

    // Modals
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showUploadGatePopup, setShowUploadGatePopup] = useState(false);

    // Renaming
    const [renamingFile, setRenamingFile] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    // Debounce save ref
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-compile flag: set to true when restoring a session with content
    const pendingAutoCompile = useRef(false);

    // ── Auth check ──
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
    }, []);

    // ── Load from cloud or localStorage on mount ──
    useEffect(() => {
        if (isCloud && cloudProjectId) {
            // Cloud mode: load from DB
            (async () => {
                const outputFiles = await listOutputFiles(cloudProjectId);
                if (outputFiles.length > 0) {
                    const loaded = outputFiles
                        .filter((f) => !f.is_binary)
                        .map((f) => ({ path: f.file_path, content: f.content || "", dirty: false }));
                    if (loaded.length > 0) {
                        setFiles(loaded);
                        setActiveFilePath(loaded[0].path);
                        setOpenTabs(loaded.map((f) => f.path));
                        if (loaded.some((f) => f.content.trim())) pendingAutoCompile.current = true;
                    }
                }
            })();
        } else {
            // Local mode: restore from localStorage
            const draft = loadPlaygroundDraft();
            if (draft) {
                setFiles(draft.files.map((f) => ({ ...f, dirty: false })));
                setActiveFilePath(draft.activeFilePath || draft.files[0]?.path || "main.tex");
                setOpenTabs(draft.files.map((f) => f.path));
                setSessionName(draft.sessionName);
                setSplitRatio(draft.splitRatio);
                if (draft.files.some((f) => f.content.trim())) pendingAutoCompile.current = true;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Auto-compile after restore ──
    useEffect(() => {
        if (!pendingAutoCompile.current) return;
        // Small delay so state settles before compile
        const timer = setTimeout(() => {
            if (pendingAutoCompile.current) {
                pendingAutoCompile.current = false;
                compileAll();
            }
        }, 500);
        return () => clearTimeout(timer);
    });

    // ── Autosave ──
    useEffect(() => {
        if (isCloud) return; // cloud saves on explicit compile
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            savePlaygroundDraft({
                sessionName,
                files: files.map((f) => ({ path: f.path, content: f.content })),
                activeFilePath,
                splitRatio,
            });
        }, 2000);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [files, activeFilePath, splitRatio, sessionName, isCloud]);

    // ── Cloud autosave on file change ──
    useEffect(() => {
        if (!isCloud || !cloudProjectId) return;
        const dirty = files.filter((f) => f.dirty);
        if (dirty.length === 0) return;
        const timer = setTimeout(async () => {
            for (const f of dirty) {
                await saveOutputFile(cloudProjectId, f.path, f.content);
            }
            setFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
        }, 3000);
        return () => clearTimeout(timer);
    }, [files, isCloud, cloudProjectId]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                compileAll();
            } else if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
                e.preventDefault();
                addFile();
            } else if ((e.metaKey || e.ctrlKey) && e.key === "n" && e.shiftKey) {
                e.preventDefault();
                newSession();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    // ── File operations ──
    const activeFile = files.find((f) => f.path === activeFilePath);
    const activeContent = activeFile?.content ?? "";

    function updateFileContent(path: string, content: string) {
        setFiles((prev) => prev.map((f) => f.path === path ? { ...f, content, dirty: true } : f));
    }

    function addFile() {
        let i = 1;
        let name = "file1.tex";
        while (files.some((f) => f.path === name)) { i++; name = `file${i}.tex`; }
        setFiles((prev) => [...prev, { path: name, content: "", dirty: false }]);
        setActiveFilePath(name);
        setOpenTabs((prev) => [...prev, name]);
    }

    async function deleteFile(path: string) {
        if (path === "main.tex") return; // protect main
        const ok = await showConfirm({ title: "Delete File", message: `Delete "${path}"?`, variant: "danger", confirmText: "Delete" });
        if (!ok) return;
        setFiles((prev) => prev.filter((f) => f.path !== path));
        setOpenTabs((prev) => prev.filter((t) => t !== path));
        if (activeFilePath === path) setActiveFilePath("main.tex");
    }

    function startRename(path: string) {
        if (path === "main.tex") return;
        setRenamingFile(path);
        setRenameValue(path);
    }

    function commitRename() {
        if (!renamingFile || !renameValue.trim() || renameValue === renamingFile) {
            setRenamingFile(null);
            return;
        }
        const newName = renameValue.trim();
        if (files.some((f) => f.path === newName)) { toast("File already exists.", "warning"); return; }
        setFiles((prev) => prev.map((f) => f.path === renamingFile ? { ...f, path: newName, dirty: true } : f));
        setOpenTabs((prev) => prev.map((t) => t === renamingFile ? newName : t));
        if (activeFilePath === renamingFile) setActiveFilePath(newName);
        setRenamingFile(null);
    }

    function openTab(path: string) {
        if (!openTabs.includes(path)) setOpenTabs((prev) => [...prev, path]);
        setActiveFilePath(path);
    }

    function closeTab(path: string) {
        const newTabs = openTabs.filter((t) => t !== path);
        if (newTabs.length === 0) newTabs.push("main.tex");
        setOpenTabs(newTabs);
        if (activeFilePath === path) setActiveFilePath(newTabs[newTabs.length - 1]);
    }

    // ── New session ──
    async function newSession() {
        const ok = await showConfirm({ title: "New Session", message: "Start a new session? Current local work will be cleared.", variant: "danger", confirmText: "Clear & Start" });
        if (!ok) return;
        clearPlaygroundDraft();
        setFiles([{ path: "main.tex", content: DEFAULT_LATEX, dirty: false }]);
        setActiveFilePath("main.tex");
        setOpenTabs(["main.tex"]);
        setSessionName("Untitled Session");
        setPdfUrl("");
        setCompileError("");
        setCompileLog("");
        if (isCloud) router.push("/playground");
    }

    // ── Import from disk ──
    function importFromDisk() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".tex,.cls,.sty,.bib,.bst,.txt";
        input.multiple = true;
        input.onchange = async () => {
            if (!input.files) return;
            for (const file of Array.from(input.files)) {
                const text = await file.text();
                const existing = files.find((f) => f.path === file.name);
                if (existing) {
                    updateFileContent(file.name, text);
                } else {
                    setFiles((prev) => [...prev, { path: file.name, content: text, dirty: false }]);
                    setOpenTabs((prev) => prev.includes(file.name) ? prev : [...prev, file.name]);
                }
            }
            if (input.files.length === 1) setActiveFilePath(input.files[0].name);
        };
        input.click();
    }

    // ── Promote to cloud ──
    async function handlePromote() {
        if (!user) {
            router.push("/login");
            return;
        }
        const project = await promotePlayground(
            sessionName,
            files.map((f) => ({ path: f.path, content: f.content }))
        );
        if (project) {
            clearPlaygroundDraft();
            router.push(`/playground?project=${project.id}`);
        } else {
            toast("Failed to save to cloud.", "error");
        }
    }

    // ── Compilation ──
    async function compileAll() {
        const texFiles = files.filter((f) => f.content.trim());
        if (texFiles.length === 0) { setCompileError("No files to compile."); return; }

        setIsCompiling(true);
        setCompileError("");
        setCompileLog("");
        setConsoleOpen(true);

        try {
            // Cloud mode: save dirty files first
            if (isCloud && cloudProjectId) {
                for (const f of files.filter((f) => f.dirty)) {
                    await saveOutputFile(cloudProjectId, f.path, f.content);
                }
                setFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
            }

            const isMultiFile = texFiles.length > 1;
            const filesPayload = texFiles.map((f) => ({ path: f.path, content: f.content }));
            const mainTex = texFiles.find((f) => f.path === "main.tex");

            const endpoint = isMultiFile ? `${API_BASE_URL}/latex/compile-project` : `${API_BASE_URL}/compile`;
            const body = isMultiFile
                ? { files: filesPayload, mainFile: "main.tex" }
                : { latex: mainTex?.content || texFiles[0].content };

            const r = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const ct = (r.headers.get("content-type") || "").toLowerCase();
            if (r.ok && ct.includes("application/pdf")) {
                const buf = await r.arrayBuffer();
                if (!buf || buf.byteLength === 0) { setCompileError("Empty PDF."); return; }
                const blob = new Blob([buf], { type: "application/pdf" });
                setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
                return;
            }

            const data = await r.json().catch(() => null);
            if (r.ok) {
                const b64 = (data?.pdfBase64 ?? data?.pdf_base64 ?? data?.pdf ?? "").toString();
                if (b64.trim()) {
                    const bin = atob(b64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    const blob = new Blob([bytes], { type: "application/pdf" });
                    setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
                    return;
                }
            }

            const rawErr = (data?.error ?? "Compilation failed.").toString();
            const markerIdx = rawErr.indexOf("----- compiler output -----");
            const message = markerIdx === -1 ? rawErr : rawErr.slice(0, markerIdx).trim();
            const log = markerIdx === -1 ? "" : rawErr.slice(markerIdx + 27).trim();
            setCompileError(message || "Compilation failed.");
            setCompileLog(log || (data?.log ? String(data.log) : ""));
        } catch (e: unknown) {
            setCompileError((e as Error)?.message || "Compile error");
        } finally {
            setIsCompiling(false);
        }
    }

    // ── Resizer ──
    const onSplitMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        const startX = e.clientX;
        const startRatio = splitRatio;
        const container = splitContainerRef.current;
        if (!container) return;
        const containerWidth = container.getBoundingClientRect().width;

        function onMove(ev: MouseEvent) {
            if (!isDraggingRef.current) return;
            const delta = ev.clientX - startX;
            const newRatio = Math.min(80, Math.max(20, startRatio + (delta / containerWidth) * 100));
            setSplitRatio(newRatio);
        }
        function onUp() {
            isDraggingRef.current = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [splitRatio]);

    // ── Download helpers ──
    function downloadTex() {
        if (!activeContent) return;
        const blob = new Blob([activeContent], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = activeFilePath;
        a.click();
    }
    function downloadPdf() {
        if (!pdfUrl) return;
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = "output.pdf";
        a.click();
    }

    // ── Import handler ──
    function handleImport(importedFiles: { path: string; content: string }[], projectTitle: string) {
        const loaded = importedFiles.map((f) => ({ ...f, dirty: false }));
        setFiles(loaded);
        setActiveFilePath(loaded[0]?.path || "main.tex");
        setOpenTabs(loaded.map((f) => f.path));
        setSessionName(projectTitle);
        setPdfUrl("");
    }

    // ── Render ──
    return (
        <main className="flex flex-col h-screen text-white overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-3 flex-wrap">
                {/* Session name */}
                <input
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="bg-transparent text-sm font-semibold outline-none text-white/90 border-b border-transparent hover:border-white/20 focus:border-white/40 transition-colors min-w-0 w-40"
                    placeholder="Session name…"
                />

                <div className="w-px h-5 bg-white/10" />

                {/* Actions */}
                <button onClick={newSession} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/70" title="New session (Ctrl+Shift+N)">
                    <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    New
                </button>
                <button onClick={() => setShowImportModal(true)} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/70" title="Import from project or disk">
                    <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Import
                </button>
                <button onClick={importFromDisk} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/70" title="Import .tex files from disk">
                    <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>
                    Files
                </button>
                <button onClick={() => setShowExportModal(true)} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/70" title="Export to project">
                    <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Export
                </button>

                <div className="w-px h-5 bg-white/10" />

                {/* Promote to cloud */}
                {!isCloud && (
                    <button onClick={handlePromote} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600/80 to-cyan-600/80 hover:from-blue-500/80 hover:to-cyan-500/80 border border-white/10 text-white" title="Save to cloud for persistence">
                        <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                        Subir a la nube
                    </button>
                )}

                <div className="flex-1" />

                {/* Compile + Downloads */}
                <button onClick={compileAll} disabled={isCompiling || !files.some((f) => f.content.trim())} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!isCompiling && files.some((f) => f.content.trim()) ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed"}`}>
                    {isCompiling ? "Compiling…" : "Compile (Ctrl+S)"}
                </button>
                <button onClick={downloadTex} disabled={!activeContent} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/70">.tex</button>
                <button onClick={downloadPdf} disabled={!pdfUrl} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/70">PDF</button>
            </div>

            {/* ── Banner ── */}
            <div className={`px-4 py-1.5 text-[11px] flex items-center gap-2 border-b ${isCloud ? "bg-blue-500/8 border-blue-400/15 text-blue-300/80" : "bg-amber-500/8 border-amber-400/15 text-amber-300/80"}`}>
                {isCloud ? (
                    <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                        Sincronizado en la nube — tus archivos se guardan automáticamente.
                    </>
                ) : (
                    <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        Guardado en este dispositivo — si borras caché se pierde. Haz clic en &quot;Subir a la nube&quot; para persistir.
                    </>
                )}
            </div>

            {/* ── Main layout ── */}
            <div className="flex-1 flex min-h-0">
                {/* ── File tree sidebar ── */}
                <div className="w-52 border-r border-white/8 flex flex-col bg-white/[0.02]">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Files</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => {
                                    if (!isCloud) { setShowUploadGatePopup(true); return; }
                                    // Cloud mode: open file picker for images
                                    const input = document.createElement("input");
                                    input.type = "file";
                                    input.accept = "image/*";
                                    // In cloud mode, actual upload would use uploadProjectFile
                                    input.click();
                                }}
                                className={`h-5 w-5 rounded flex items-center justify-center ${isCloud ? "text-white/25 hover:text-white/60 hover:bg-white/10" : "text-white/15 cursor-not-allowed"}`}
                                title={isCloud ? "Upload image" : "Upload images requires Cloud mode"}
                            >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v14.25c0 .828.672 1.5 1.5 1.5z" /></svg>
                            </button>
                            <button onClick={addFile} className="h-5 w-5 rounded text-white/25 hover:text-white/60 hover:bg-white/10 flex items-center justify-center" title="New file (Ctrl+N)">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                        {files.map((f) => (
                            <div
                                key={f.path}
                                className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer ${f.path === activeFilePath ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/70"}`}
                            >
                                {renamingFile === f.path ? (
                                    <input
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={commitRename}
                                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingFile(null); }}
                                        className="flex-1 bg-transparent outline-none text-xs text-white border-b border-white/30"
                                        autoFocus
                                    />
                                ) : (
                                    <button onClick={() => openTab(f.path)} onDoubleClick={() => startRename(f.path)} className="flex-1 text-left truncate flex items-center gap-1.5">
                                        <svg className="h-3 w-3 flex-shrink-0 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                        <span className="truncate">{f.path}</span>
                                        {f.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Modified" />}
                                    </button>
                                )}
                                {f.path !== "main.tex" && (
                                    <button onClick={() => deleteFile(f.path)} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-300 transition-opacity" title="Delete">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Editor + Preview (split) ── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Tab bar */}
                    <div className="flex items-center border-b border-white/8 bg-white/[0.02] overflow-x-auto">
                        {openTabs.map((tab) => {
                            const f = files.find((fi) => fi.path === tab);
                            return (
                                <div
                                    key={tab}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-white/8 cursor-pointer min-w-0 ${tab === activeFilePath ? "bg-white/8 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/60"}`}
                                >
                                    <button onClick={() => setActiveFilePath(tab)} className="truncate max-w-[120px]">
                                        {tab}
                                    </button>
                                    {f?.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                                    {openTabs.length > 1 && (
                                        <button onClick={() => closeTab(tab)} className="text-white/20 hover:text-white/60 ml-1">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Split content area */}
                    <div ref={splitContainerRef} className="flex-1 flex min-h-0">
                        {/* Code editor */}
                        <div style={{ width: `${splitRatio}%` }} className="flex flex-col min-w-0 border-r border-white/8">
                            <textarea
                                value={activeContent}
                                onChange={(e) => updateFileContent(activeFilePath, e.target.value)}
                                className="flex-1 w-full bg-transparent p-4 font-mono text-sm outline-none text-white/90 resize-none"
                                placeholder={`${activeFilePath} — start typing LaTeX…`}
                                spellCheck={false}
                            />
                        </div>

                        {/* Draggable divider */}
                        <div onMouseDown={onSplitMouseDown} className="w-1.5 bg-white/5 hover:bg-white/15 cursor-col-resize transition-colors flex-shrink-0 relative group">
                            <div className="absolute inset-y-0 -left-1 -right-1" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-white/15 group-hover:bg-white/35 transition-colors" />
                        </div>

                        {/* Preview panel */}
                        <div style={{ width: `${100 - splitRatio}%` }} className="flex flex-col min-w-0">
                            <div className="px-3 py-1.5 border-b border-white/8 text-[10px] text-white/30 font-semibold uppercase tracking-wider">Preview</div>
                            <div className="flex-1">
                                {pdfUrl ? (
                                    <iframe title="PDF Preview" src={pdfUrl} className="w-full h-full" />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-white/20 text-sm">
                                        <div className="text-center">
                                            <svg className="w-10 h-10 mx-auto mb-3 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                            Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/40 text-xs">Ctrl+S</kbd> to compile
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Console ── */}
                    {(compileError || isCompiling || consoleOpen) && (
                        <div className={`border-t p-3 transition-all ${compileError ? "border-red-400/20 bg-red-500/8" : isCompiling ? "border-amber-400/20 bg-amber-500/8" : "border-emerald-400/20 bg-emerald-500/8"}`}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    {isCompiling ? (
                                        <div className="w-4 h-4 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
                                    ) : compileError ? (
                                        <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                    )}
                                    <span className={`text-xs font-medium ${compileError ? "text-red-200" : isCompiling ? "text-amber-200" : "text-emerald-200"}`}>
                                        {isCompiling ? "Compiling…" : compileError ? "Compilation failed" : "Compiled successfully"}
                                    </span>
                                    {compileError && <span className="text-[11px] text-red-200/60 max-w-sm truncate">{compileError}</span>}
                                </div>
                                <button onClick={() => { setCompileError(""); setCompileLog(""); setConsoleOpen(false); }} className="rounded-lg px-2 py-1 text-xs border border-white/8 bg-white/5 hover:bg-white/10 text-white/40">Clear</button>
                            </div>
                            {compileLog && (
                                <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-white/8 bg-black/30 p-2 text-xs text-white/60 font-mono">{compileLog}</pre>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Image upload gate popup ── */}
            {showUploadGatePopup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowUploadGatePopup(false)} />
                    <div className="relative rounded-2xl border border-white/15 bg-neutral-900/95 backdrop-blur-xl p-6 max-w-sm shadow-2xl text-center">
                        <svg className="w-10 h-10 mx-auto mb-3 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                        <h3 className="text-sm font-semibold mb-1">Imágenes requieren la nube</h3>
                        <p className="text-xs text-white/50 mb-4">Para subir imágenes, guarda primero en la nube haciendo clic en &quot;Subir a la nube&quot;.</p>
                        <div className="flex items-center gap-2 justify-center">
                            <button onClick={() => setShowUploadGatePopup(false)} className="rounded-xl px-4 py-2 text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/70">Cerrar</button>
                            <button onClick={() => { setShowUploadGatePopup(false); handlePromote(); }} className="rounded-xl px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600/80 to-cyan-600/80 border border-white/10 text-white">
                                ☁️ Subir a la nube
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modals ── */}
            <ImportProjectModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onImport={handleImport} />
            <ExportProjectModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} files={files.map((f) => ({ path: f.path, content: f.content }))} sessionName={sessionName} onExported={(id) => router.push(`/workspace/${id}`)} />
        </main>
    );
}
