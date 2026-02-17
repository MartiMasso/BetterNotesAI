"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";
import {
    getUsageStatus, incrementMessageCount,
    listProjectFiles, createProjectFolder, deleteProjectFile,
    listOutputFiles, saveOutputFile,
    type Project, type ProjectFileRecord, type UsageStatus
} from "@/lib/api";
import { uploadProjectFile, getProjectFileUrl } from "@/lib/storage";
import FileTree from "@/app/components/FileTree";
import InlineEditMenu from "@/app/components/InlineEditMenu";
import PaywallModal from "@/app/components/PaywallModal";
import SlashCommandPicker, { type SlashCommandPickerRef } from "@/app/components/SlashCommandPicker";
import { templates } from "@/lib/templates";
import { useToast } from "@/app/components/Toast";
import { useDialog } from "@/app/components/ConfirmDialog";
import type { User } from "@supabase/supabase-js";

type Msg = { role: "user" | "assistant"; content: string };

/** Local in-memory representation of an output file */
interface OutputEntry {
    filePath: string;
    content: string;
    dirty: boolean;
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

export default function ProjectWorkspace() {
    const { projectId } = useParams<{ projectId: string }>();
    const router = useRouter();
    const { toast } = useToast();
    const { showConfirm, showPrompt } = useDialog();

    // Auth + project
    const [user, setUser] = useState<User | null>(null);
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);

    // Chat
    const [messages, setMessages] = useState<Msg[]>([
        { role: "assistant", content: "Tell me what you want to create. I'll generate LaTeX + PDF for you." },
    ]);
    const [chatInput, setChatInput] = useState("");
    const bottomRef = useRef<HTMLDivElement | null>(null);

    // Project files (user uploads)
    const [projectFiles, setProjectFiles] = useState<ProjectFileRecord[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

    // ═══ Multi-file output state ═══
    const [outputFiles, setOutputFiles] = useState<OutputEntry[]>([]);
    const [activeOutputPath, setActiveOutputPath] = useState<string>("main.tex");
    const [pdfUrl, setPdfUrl] = useState("");
    const [activeTab, setActiveTab] = useState<"preview" | "latex" | "split">("preview");

    // Split-view resizer
    const [splitRatio, setSplitRatio] = useState(50);
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const isDraggingRef = useRef(false);

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

    // Status flags
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [compileError, setCompileError] = useState("");
    const [compileLog, setCompileLog] = useState("");

    // Auto-compile flag
    const pendingAutoCompile = useRef(false);

    // Inline edit
    const editorRef = useRef<HTMLTextAreaElement | null>(null);

    // Freemium
    const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
    const [showPaywallModal, setShowPaywallModal] = useState(false);

    // Panels
    const [leftCollapsed, setLeftCollapsed] = useState(false);

    // Slash-command template override (one-shot)
    const slashPickerRef = useRef<SlashCommandPickerRef>(null);
    const [templateOverride, setTemplateOverride] = useState<string | null>(null);
    const selectedTemplate = templateOverride ? templates.find((t) => t.id === templateOverride) ?? null : null;

    // Console panel state
    const [consoleOpen, setConsoleOpen] = useState(false);

    // ── Derived state ──
    const activeEntry = outputFiles.find((f) => f.filePath === activeOutputPath);
    const activeContent = activeEntry?.content ?? "";
    const mainTex = outputFiles.find((f) => f.filePath === "main.tex");
    const anyDirty = outputFiles.some((f) => f.dirty);
    const busy = () => isGenerating || isCompiling || isFixing;

    // ── Auth ──
    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) setUsageStatus(await getUsageStatus());
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) setUsageStatus(await getUsageStatus());
            else setUsageStatus(null);
        });
        return () => subscription.unsubscribe();
    }, []);

    // ── Load project ──
    useEffect(() => {
        if (!user || !projectId) return;
        setLoading(true);
        async function load() {
            const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
            if (error || !data) { router.push("/projects"); return; }
            setProject(data as Project);
            setLoading(false);
        }
        load();
    }, [user, projectId, router]);

    // ── Load project files (user uploads) ──
    const refreshFiles = useCallback(async () => {
        if (!projectId) return;
        const files = await listProjectFiles(projectId);
        setProjectFiles(files);
    }, [projectId]);

    useEffect(() => { refreshFiles(); }, [refreshFiles]);

    // ── Load saved output files (multi-file) ──
    useEffect(() => {
        if (!projectId) return;
        async function loadOutputs() {
            const outputs = await listOutputFiles(projectId);
            if (outputs.length > 0) {
                setOutputFiles(outputs.map((o) => ({
                    filePath: o.file_path,
                    content: o.content ?? "",
                    dirty: false,
                })));
                // Select main.tex if it exists, otherwise first file
                const main = outputs.find((o) => o.file_path === "main.tex");
                setActiveOutputPath(main ? "main.tex" : outputs[0].file_path);
                if (outputs.some((o) => (o.content ?? "").trim())) pendingAutoCompile.current = true;
            }
        }
        loadOutputs();
    }, [projectId]);

    // Auto-compile when files load with content
    useEffect(() => {
        if (!pendingAutoCompile.current) return;
        const timer = setTimeout(() => {
            if (pendingAutoCompile.current) {
                pendingAutoCompile.current = false;
                saveAndCompile();
            }
        }, 500);
        return () => clearTimeout(timer);
    });

    // ── Scroll chat ──
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    // ── Cleanup PDF URL ──
    useEffect(() => {
        return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ctrl+S / Cmd+S to save and compile
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                if (outputFiles.some((f) => f.content.trim()) && !busy()) {
                    saveAndCompile();
                }
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    // ═══ Output file helpers ═══
    function updateOutputFile(filePath: string, content: string) {
        setOutputFiles((prev) => {
            const existing = prev.find((f) => f.filePath === filePath);
            if (existing) {
                return prev.map((f) => f.filePath === filePath ? { ...f, content, dirty: true } : f);
            }
            return [...prev, { filePath, content, dirty: true }];
        });
    }

    function setOutputFilesFromGeneration(mainContent: string) {
        // If the AI generates a single document, set main.tex
        // Future: parse multi-file responses
        setOutputFiles((prev) => {
            const existing = prev.find((f) => f.filePath === "main.tex");
            if (existing) {
                return prev.map((f) => f.filePath === "main.tex" ? { ...f, content: mainContent, dirty: false } : f);
            }
            return [{ filePath: "main.tex", content: mainContent, dirty: false }, ...prev];
        });
        setActiveOutputPath("main.tex");
    }

    async function addNewOutputFile() {
        const name = await showPrompt({ title: "New File", message: "Enter file name (e.g. preamble.tex, chapters/intro.tex):", placeholder: "preamble.tex", confirmText: "Create" });
        if (!name?.trim()) return;
        const normalized = name.trim().replace(/\\/g, "/");
        const exists = outputFiles.some((f) => f.filePath === normalized);
        if (exists) { toast("File already exists.", "warning"); return; }
        setOutputFiles((prev) => [...prev, { filePath: normalized, content: "", dirty: true }]);
        setActiveOutputPath(normalized);
        setActiveTab("latex");
    }

    async function deleteOutputEntry(filePath: string) {
        if (filePath === "main.tex") { toast("Cannot delete main.tex", "warning"); return; }
        const ok = await showConfirm({ title: "Delete File", message: `Delete output file "${filePath}"?`, variant: "danger", confirmText: "Delete" });
        if (!ok) return;
        setOutputFiles((prev) => prev.filter((f) => f.filePath !== filePath));
        if (activeOutputPath === filePath) setActiveOutputPath("main.tex");
    }

    // ═══ Helpers ═══
    function replaceLastWorking(m: Msg[], newText: string): Msg[] {
        const copy = [...m];
        for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "assistant" && (copy[i].content.includes("Working…") || copy[i].content.includes("Compiling"))) {
                copy[i] = { role: "assistant", content: newText };
                break;
            }
        }
        return copy;
    }

    /** Get signed URLs for project image files to inject into AI context */
    async function getProjectImageContext(): Promise<string> {
        const images = projectFiles.filter((f) => {
            if (f.is_folder || !f.mime_type) return false;
            return f.mime_type.startsWith("image/");
        });
        if (images.length === 0) return "";

        const lines: string[] = ["Available project images (use \\includegraphics{figures/<name>}):"];
        for (const img of images) {
            if (img.storage_path) {
                const url = await getProjectFileUrl(img.storage_path);
                if (url) lines.push(`  - ${img.name} → ${url}`);
            }
        }
        return lines.join("\n");
    }

    // ── Freemium gate ──
    const canSendMessage = useCallback(async (): Promise<boolean> => {
        if (!user) { router.push("/login"); return false; }
        try {
            const status = await getUsageStatus();
            setUsageStatus(status);
            if (status && !status.can_send) { setShowPaywallModal(true); return false; }
        } catch { /* fail open */ }
        return true;
    }, [user, router]);

    // ═══ Generate ═══
    async function generateLatex(prompt: string, baseLatex?: string) {
        try {
            setIsGenerating(true);
            const payload: Record<string, unknown> = { prompt };
            if (project?.template_id) payload.templateId = project.template_id;
            // Use one-shot template override if set
            if (templateOverride) payload.templateId = templateOverride;
            if (baseLatex?.trim()) payload.baseLatex = baseLatex;

            // Inject image awareness
            const imageCtx = await getProjectImageContext();
            if (imageCtx) payload.prompt = `${prompt}\n\n[System context]\n${imageCtx}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            const r = await fetch(`${API_BASE_URL}/generate-latex`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await r.json().catch(() => null);
            if (!r.ok) return { ok: false as const, error: data?.error ?? "Failed to generate." };
            if (data.message) return { ok: true as const, message: data.message as string };
            const latex = (data?.latex ?? "").toString();
            if (!latex.trim() && !data.message) return { ok: false as const, error: "Empty response." };
            return { ok: true as const, latex };
        } catch (e: unknown) {
            const err = e as Error;
            return { ok: false as const, error: err?.name === "AbortError" ? "Timeout (180s)." : (err?.message ?? "Generate error") };
        } finally {
            setIsGenerating(false);
        }
    }

    // ═══ Compile (multi-file aware) ═══
    async function compileProject() {
        setCompileError(""); setCompileLog("");
        const texFiles = outputFiles.filter((f) => f.content.trim());
        if (texFiles.length === 0) { setCompileError("No files to compile."); return { ok: false as const }; }

        try {
            setIsCompiling(true);

            // Build files array for the backend
            const filesPayload = texFiles.map((f) => ({
                path: f.filePath,
                content: f.content,
            }));

            // Add project images as binary files (base64)
            const images = projectFiles.filter((f) => !f.is_folder && f.mime_type?.startsWith("image/") && f.storage_path);
            for (const img of images) {
                const url = await getProjectFileUrl(img.storage_path!);
                if (url) {
                    try {
                        const resp = await fetch(url);
                        const buf = await resp.arrayBuffer();
                        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                        filesPayload.push({
                            path: `figures/${img.name}`,
                            content: base64,
                            isBinary: true,
                        } as { path: string; content: string; isBinary?: boolean });
                    } catch { /* skip failed images */ }
                }
            }

            // Use single-file or multi-file endpoint
            const isMultiFile = texFiles.length > 1;
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
                if (!buf || buf.byteLength === 0) { setCompileError("Empty PDF."); return { ok: false as const }; }
                const blob = new Blob([buf], { type: "application/pdf" });
                setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
                return { ok: true as const };
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
                    return { ok: true as const };
                }
            }

            const rawErr = (data?.error ?? "Compilation failed.").toString();
            const markerIdx = rawErr.indexOf("----- compiler output -----");
            const message = markerIdx === -1 ? rawErr : rawErr.slice(0, markerIdx).trim();
            const log = markerIdx === -1 ? "" : rawErr.slice(markerIdx + 27).trim();
            setCompileError(message || "Compilation failed.");
            setCompileLog(log || (data?.log ? String(data.log) : ""));
            return { ok: false as const };
        } catch (e: unknown) {
            setCompileError((e as Error)?.message || "Compile error");
            return { ok: false as const };
        } finally {
            setIsCompiling(false);
        }
    }

    // ═══ Fix with AI ═══
    async function fixWithAI() {
        const current = activeEntry?.content || mainTex?.content;
        if (!current?.trim() || !compileLog.trim()) return;
        setIsFixing(true);
        try {
            const r = await fetch(`${API_BASE_URL}/fix-latex`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex: current, log: compileLog }),
            });
            const data = await r.json().catch(() => null);
            if (!r.ok) throw new Error(data?.error ?? "Fix failed.");
            const fixed = (data?.fixedLatex ?? "").toString();
            if (!fixed.trim()) throw new Error("Empty fix result.");
            updateOutputFile(activeOutputPath, fixed);
            setCompileError(""); setCompileLog("");
            // Recompile after fix
            const comp = await compileProject();
            if (comp.ok) {
                setOutputFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
                setMessages((m) => [...m, { role: "assistant", content: "Applied AI fix and recompiled successfully." }]);
            }
        } catch (e: unknown) {
            setCompileError((e as Error)?.message ?? "Fix error");
        } finally {
            setIsFixing(false);
        }
    }

    // ═══ Send message ═══
    async function handleSend() {
        const text = chatInput.trim();
        if (!text || busy()) return;
        const allowed = await canSendMessage();
        if (!allowed) return;

        setChatInput("");
        // Clear one-shot template override after use
        const usedTemplate = templateOverride;
        setTemplateOverride(null);
        setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "Working… generating document..." }]);

        const base = mainTex?.content || "";
        const gen = await generateLatex(text, base.trim() || undefined);

        if (!gen.ok) {
            setMessages((m) => replaceLastWorking(m, `Error: ${gen.error}`));
            return;
        }

        if ("message" in gen && gen.message) {
            setMessages((m) => replaceLastWorking(m, gen.message!));
            return;
        }

        const newLatex = ("latex" in gen ? gen.latex : "") || "";
        setOutputFilesFromGeneration(newLatex);
        setActiveTab("preview");
        setMessages((m) => replaceLastWorking(m, "Generated. Compiling PDF..."));

        // Save and compile in parallel
        const compilePromise = compileProject();
        const savePromise = (async () => {
            try {
                await incrementMessageCount();
                if (projectId) await saveOutputFile(projectId, "main.tex", newLatex);
            } catch { /* skip */ }
        })();

        const comp = await compilePromise;
        if (comp.ok) {
            setOutputFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
            setMessages((m) => replaceLastWorking(m, "Done. Preview updated."));
        } else {
            setMessages((m) => replaceLastWorking(m, 'Generated LaTeX, but compilation failed. Use "Fix with AI".'));
        }
        await savePromise;
    }

    // ═══ Save & Compile ═══
    async function saveAndCompile() {
        if (outputFiles.length === 0 || busy()) return;
        setCompileError(""); setCompileLog("");

        // Save all dirty output files to DB
        const savePromises = outputFiles.filter((f) => f.dirty).map((f) =>
            saveOutputFile(projectId, f.filePath, f.content)
        );

        const comp = await compileProject();
        if (comp.ok) {
            setOutputFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
        }
        await Promise.all(savePromises);
    }

    // ═══ Downloads ═══
    function downloadCurrentTex() {
        const content = activeEntry?.content;
        if (!content?.trim()) return;
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = activeOutputPath.split("/").pop() || "main.tex"; a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadZip() {
        const texFiles = outputFiles.filter((f) => f.content.trim());
        if (texFiles.length === 0) return;

        // Simple ZIP implementation (no external library needed)
        // Uses the JSZip-like approach with Blob
        if (texFiles.length === 1) {
            // Just download the single file
            downloadCurrentTex();
            return;
        }

        // For multi-file: create a simple tar-like structure
        // Actually, let's create individual downloads or use a simple concatenated approach
        // Better approach: generate ZIP using browser APIs
        try {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            for (const f of texFiles) {
                zip.file(f.filePath, f.content);
            }
            const blob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project?.title || "project"}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // Fallback: download each file separately
            for (const f of texFiles) {
                const blob = new Blob([f.content], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = f.filePath.split("/").pop() || "file.tex";
                a.click();
                URL.revokeObjectURL(url);
            }
        }
    }

    function downloadPdf() {
        if (!pdfUrl) return;
        const a = document.createElement("a");
        a.href = pdfUrl; a.download = "output.pdf"; a.click();
    }

    // ═══ File operations (project files / uploads) ═══
    async function handleNewFolder(parentId: string | null) {
        const name = await showPrompt({ title: "New Folder", placeholder: "Folder name", confirmText: "Create" });
        if (!name?.trim() || !projectId) return;
        await createProjectFolder(projectId, name.trim(), parentId);
        refreshFiles();
    }

    async function handleUpload(parentId: string | null) {
        const input = document.createElement("input");
        input.type = "file"; input.multiple = true;
        input.accept = ".jpg,.jpeg,.png,.webp,.pdf,.txt,.md,.csv,.docx,.tex,.bib,.sty,.cls";
        input.onchange = async () => {
            const selected = Array.from(input.files || []);
            for (const file of selected) {
                await uploadProjectFile(file, projectId, parentId);
            }
            refreshFiles();
        };
        input.click();
    }

    async function handleDeleteFile(file: ProjectFileRecord) {
        await deleteProjectFile(file.id);
        refreshFiles();
    }

    // ── Inline edit actions ──
    function handleInlineAction(action: "change" | "explain" | "delete", text: string) {
        const p = action === "change" ? `Change the following in my LaTeX: "${text}"` :
            action === "explain" ? `Explain this LaTeX code: "${text}"` :
                `Remove the following from my LaTeX: "${text}"`;
        setChatInput(p);
    }

    const canCompile = outputFiles.some((f) => f.content.trim()) && !busy();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-white/40 text-sm">Loading project...</div>
            </div>
        );
    }

    return (
        <div className="flex h-screen text-white overflow-hidden">
            {/* ── LEFT COLUMN: Chat + Files ── */}
            <div className={`flex flex-col border-r border-white/8 bg-white/[0.02] transition-all ${leftCollapsed ? "w-0 overflow-hidden" : "w-[420px] min-w-[320px]"}`}>
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                    <div>
                        <div className="text-sm font-semibold truncate max-w-[200px]">{project?.title || "Project"}</div>
                        <div className="text-[11px] text-white/40">Chat → LaTeX → PDF</div>
                    </div>
                    <button onClick={() => router.push("/projects")} className="text-xs rounded-lg border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10 text-white/60">
                        ← Back
                    </button>
                </div>

                {/* Chat messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                    {messages.map((m, idx) => (
                        <div key={idx} className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed border ${m.role === "user"
                            ? "ml-auto bg-white/10 border-white/15"
                            : "mr-auto bg-black/20 border-white/8"
                            }`}>{m.content}</div>
                    ))}
                    <div ref={bottomRef} />
                </div>

                {/* File browser (bottom of left column) */}
                <div className="h-48 border-t border-white/8 overflow-hidden">
                    <FileTree
                        files={projectFiles}
                        selectedId={selectedFileId}
                        onSelect={(f) => setSelectedFileId(f.id)}
                        onDelete={handleDeleteFile}
                        onNewFolder={handleNewFolder}
                        onUpload={handleUpload}
                        title="Project Files"
                        emptyText="No files uploaded yet"
                    />
                </div>

                {/* Chat input */}
                <div className="p-3 border-t border-white/8">
                    {user && usageStatus && (
                        <div className="mb-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${usageStatus.remaining > 2 ? "bg-emerald-400" : usageStatus.remaining > 0 ? "bg-amber-400" : "bg-red-400"}`} />
                                <span className="text-white/50">{usageStatus.is_paid ? "Pro" : "Free"}: <span className="text-white/70 font-medium">{usageStatus.remaining}</span>/{usageStatus.free_limit}</span>
                            </div>
                            {!usageStatus.is_paid && usageStatus.remaining <= 2 && (
                                <a href="/pricing" className="text-emerald-400 hover:underline text-[11px]">Upgrade</a>
                            )}
                        </div>
                    )}
                    {/* Template override chip */}
                    {selectedTemplate && (
                        <div className="mb-2 flex items-center gap-2">
                            <div className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 pl-1.5 pr-2 py-1">
                                {selectedTemplate.thumbnailPath && (
                                    <div className="w-5 h-5 rounded-full overflow-hidden border border-emerald-400/30">
                                        <img src={selectedTemplate.thumbnailPath} alt="" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <span className="text-[11px] font-medium text-emerald-300">{selectedTemplate.name}</span>
                                <button onClick={() => setTemplateOverride(null)} className="ml-0.5 text-emerald-400/50 hover:text-emerald-300 transition-colors">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2 relative">
                        <SlashCommandPicker
                            ref={slashPickerRef}
                            inputValue={chatInput}
                            isPro={usageStatus?.is_paid ?? false}
                            onSelect={(id) => { setTemplateOverride(id); setChatInput(""); }}
                            onProBlocked={() => setShowPaywallModal(true)}
                            onDismiss={() => setChatInput("")}
                        />
                        <input
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => { if (slashPickerRef.current?.handleKeyDown(e)) return; if (e.key === "Enter" && !e.shiftKey) handleSend(); }}
                            className="h-10 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-white/35 text-white"
                            placeholder="Type / for templates, or ask BetterNotes…"
                        />
                        <button
                            onClick={handleSend}
                            className={`h-10 rounded-xl px-4 text-sm font-semibold ${chatInput.trim() && !busy()
                                ? "bg-white text-neutral-950 hover:bg-white/90"
                                : "bg-white/15 text-white/40 cursor-not-allowed"
                                }`}
                        >
                            {isGenerating ? "…" : "Send"}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Collapse toggle ── */}
            <button
                onClick={() => setLeftCollapsed(!leftCollapsed)}
                className="hidden lg:flex w-4 items-center justify-center border-r border-white/8 bg-white/[0.02] hover:bg-white/[0.05] text-white/20 hover:text-white/50 transition-colors"
            >
                <svg className={`h-3 w-3 transition-transform ${leftCollapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
            </button>

            {/* ── RIGHT COLUMN: Output panel ── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="px-4 py-3 border-b border-white/8 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-semibold">Output</div>
                        <div className="text-[11px] text-white/40">
                            {outputFiles.length === 0 ? "Send a prompt to generate." :
                                !pdfUrl ? "No PDF yet — compile to preview." :
                                    anyDirty ? "Files modified — recompile." :
                                        "Preview up to date."}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={() => setActiveTab("preview")} className={`rounded-lg px-2.5 py-1.5 text-xs border ${activeTab === "preview" ? "bg-white text-neutral-950 border-white" : "bg-white/8 text-white/70 border-white/10 hover:bg-white/12"}`}>Preview</button>
                        <button onClick={() => setActiveTab("latex")} className={`rounded-lg px-2.5 py-1.5 text-xs border ${activeTab === "latex" ? "bg-white text-neutral-950 border-white" : "bg-white/8 text-white/70 border-white/10 hover:bg-white/12"}`}>LaTeX</button>
                        <button onClick={() => setActiveTab("split")} className={`rounded-lg px-2.5 py-1.5 text-xs border ${activeTab === "split" ? "bg-white text-neutral-950 border-white" : "bg-white/8 text-white/70 border-white/10 hover:bg-white/12"}`} title="Side-by-side: Code + Preview">
                            <svg className="w-3.5 h-3.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 4.5h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18V6a1.5 1.5 0 011.5-1.5z" /></svg>
                        </button>
                        <div className="w-px h-5 bg-white/10 mx-0.5" />
                        <button onClick={saveAndCompile} disabled={!canCompile} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${canCompile ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed"}`}>
                            {isCompiling ? "Compiling…" : "Compile"}
                        </button>
                        <div className="w-px h-5 bg-white/10 mx-0.5" />
                        <button onClick={downloadCurrentTex} disabled={!activeContent.trim()} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/8 hover:bg-white/12 disabled:opacity-30">.tex</button>
                        {outputFiles.length > 1 && (
                            <button onClick={downloadZip} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/8 hover:bg-white/12">.zip</button>
                        )}
                        <button onClick={downloadPdf} disabled={!pdfUrl} className="rounded-lg px-2.5 py-1.5 text-xs border border-white/10 bg-white/8 hover:bg-white/12 disabled:opacity-30">PDF</button>
                    </div>
                </div>

                {/* Content area */}
                <div className="flex-1 flex min-h-0">
                    {/* Output file tree (visible in LaTeX and Split tabs with multiple files) */}
                    {(activeTab === "latex" || activeTab === "split") && (
                        <div className="w-48 border-r border-white/8 flex flex-col">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Output Files</span>
                                <button onClick={addNewOutputFile} className="h-5 w-5 rounded text-white/25 hover:text-white/60 hover:bg-white/10 flex items-center justify-center" title="New file">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto py-1">
                                {outputFiles.length === 0 ? (
                                    <div className="px-3 py-3 text-[10px] text-white/20 text-center">No output files yet</div>
                                ) : (
                                    outputFiles.map((f) => (
                                        <div
                                            key={f.filePath}
                                            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer ${f.filePath === activeOutputPath ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/70"}`}
                                        >
                                            <button onClick={() => setActiveOutputPath(f.filePath)} className="flex-1 text-left truncate flex items-center gap-1.5">
                                                <svg className="h-3 w-3 flex-shrink-0 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                </svg>
                                                <span className="truncate">{f.filePath}</span>
                                                {f.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved" />}
                                            </button>
                                            {f.filePath !== "main.tex" && (
                                                <button onClick={() => deleteOutputEntry(f.filePath)} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-300 transition-opacity">
                                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Main content */}
                    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
                        {activeTab === "split" ? (
                            /* ── Split view ── */
                            <div ref={splitContainerRef} className="flex-1 flex rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
                                {/* Code panel */}
                                <div style={{ width: `${splitRatio}%` }} className="flex flex-col min-w-0">
                                    <div className="px-3 py-1.5 border-b border-white/8 text-[10px] text-white/30 font-semibold uppercase tracking-wider">LaTeX — {activeOutputPath}</div>
                                    <div className="relative flex-1">
                                        <textarea
                                            ref={editorRef}
                                            value={activeContent}
                                            onChange={(e) => updateOutputFile(activeOutputPath, e.target.value)}
                                            className="w-full h-full bg-transparent p-4 font-mono text-sm outline-none text-white/90 resize-none"
                                            placeholder={`${activeOutputPath} — start typing LaTeX…`}
                                        />
                                        <InlineEditMenu containerRef={editorRef} onAction={handleInlineAction} />
                                    </div>
                                </div>
                                {/* Draggable divider */}
                                <div onMouseDown={onSplitMouseDown} className="w-1.5 bg-white/8 hover:bg-white/20 cursor-col-resize transition-colors flex-shrink-0 relative group">
                                    <div className="absolute inset-y-0 -left-1 -right-1" />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
                                </div>
                                {/* Preview panel */}
                                <div style={{ width: `${100 - splitRatio}%` }} className="flex flex-col min-w-0">
                                    <div className="px-3 py-1.5 border-b border-white/8 text-[10px] text-white/30 font-semibold uppercase tracking-wider">Preview</div>
                                    <div className="flex-1">
                                        {pdfUrl ? <iframe title="PDF Preview" src={pdfUrl} className="w-full h-full" /> : <div className="h-full flex items-center justify-center text-white/30 text-sm">No PDF yet</div>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* ── Single panel ── */
                            <div className="flex-1 rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden relative">
                                {activeTab === "preview" ? (
                                    pdfUrl ? (
                                        <iframe title="PDF Preview" src={pdfUrl} className="w-full h-full" />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-white/30 text-sm">
                                            No PDF yet. Send a prompt or compile.
                                        </div>
                                    )
                                ) : (
                                    <div className="relative h-full">
                                        <textarea
                                            ref={editorRef}
                                            value={activeContent}
                                            onChange={(e) => updateOutputFile(activeOutputPath, e.target.value)}
                                            className="w-full h-full bg-transparent p-4 font-mono text-sm outline-none text-white/90 resize-none"
                                            placeholder={`${activeOutputPath} — start typing LaTeX…`}
                                        />
                                        <InlineEditMenu containerRef={editorRef} onAction={handleInlineAction} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Compilation Console ── */}
                        {(compileError || isCompiling || consoleOpen) && (
                            <div className={`rounded-xl border p-3 transition-all ${compileError ? "border-red-400/20 bg-red-500/10" : isCompiling ? "border-amber-400/20 bg-amber-500/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        {isCompiling ? (
                                            <div className="w-4 h-4 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
                                        ) : compileError ? (
                                            <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                        )}
                                        <span className={`text-sm font-medium ${compileError ? "text-red-200" : isCompiling ? "text-amber-200" : "text-emerald-200"}`}>
                                            {isCompiling ? "Compiling…" : compileError ? "Compilation failed" : "Compiled successfully"}
                                        </span>
                                        {compileError && <span className="text-xs text-red-200/70 max-w-sm truncate">{compileError}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {compileError && compileLog.trim() && (
                                            <button onClick={fixWithAI} disabled={busy()} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${!busy() ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/15 text-white/40 cursor-not-allowed"}`}>
                                                {isFixing ? "Fixing…" : "Fix with AI"}
                                            </button>
                                        )}
                                        <button onClick={() => { setCompileError(""); setCompileLog(""); setConsoleOpen(false); }} className="rounded-lg px-2 py-1 text-xs border border-white/8 bg-white/5 hover:bg-white/10 text-white/40">Clear</button>
                                    </div>
                                </div>
                                {compileLog && (
                                    <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-white/8 bg-black/30 p-2 text-xs text-white/60 font-mono">{compileLog}</pre>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <PaywallModal isOpen={showPaywallModal} onClose={() => setShowPaywallModal(false)} remaining={usageStatus?.remaining} resetsAt={usageStatus?.resets_at} />
        </div>
    );
}
