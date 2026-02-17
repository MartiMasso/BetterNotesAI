"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import TemplateCardSelect from "@/app/components/TemplateCardSelect";
import PaywallModal from "@/app/components/PaywallModal";
import PdfPreviewModal from "@/app/components/PdfPreviewModal";
import SlashCommandPicker, { type SlashCommandPickerRef } from "@/app/components/SlashCommandPicker";
import { templates } from "../../../lib/templates";
import { saveWorkspaceDraft, loadWorkspaceDraft, clearWorkspaceDraft, WorkspaceDraft } from "../../../lib/workspaceDraft";
import { getUsageStatus, incrementMessageCount, saveChat, updateChat, loadChat, createProject, listProjects, saveOutputFile, UsageStatus } from "../../../lib/api";
import SaveProjectModal from "@/app/components/SaveProjectModal";
import { supabase } from "@/supabaseClient";
import type { User } from "@supabase/supabase-js";
import { useToast } from "@/app/components/Toast";
import { useDialog } from "@/app/components/ConfirmDialog";

type Mode = "start" | "project";
type Msg = { role: "user" | "assistant"; content: string };

const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

function base64ToUint8Array(base64: string) {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extractDocumentBody(latex: string) {
  const s = latex || "";
  const a = s.indexOf("\\begin{document}");
  const b = s.lastIndexOf("\\end{document}");
  if (a !== -1 && b !== -1 && b > a) {
    return s.slice(a + "\\begin{document}".length, b).trim();
  }
  return s.trim();
}

function splitCompilerOutput(err: string): { message: string; log: string } {
  const raw = (err || "").toString();
  const marker = "----- compiler output -----";
  const idx = raw.indexOf(marker);
  if (idx === -1) return { message: raw.trim() || "Compilation failed.", log: "" };
  const message = raw.slice(0, idx).trim() || "Compilation failed.";
  const log = raw.slice(idx + marker.length).trim();
  return { message, log };
}

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { showConfirm, showPrompt } = useDialog();
  const [mode, setMode] = useState<Mode>("start");

  // ── Save modal state ──
  const [showSaveModal, setShowSaveModal] = useState(false);
  function openSaveModal() {
    if (!draftLatex.trim()) { toast("No LaTeX content to save.", "warning"); return; }
    setShowSaveModal(true);
  }

  // START mode
  const [startInput, setStartInput] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const pendingAutoSendRef = useRef<string | null>(null);
  const [fileError, setFileError] = useState("");

  // FILE ATTACHMENT STATE
  type FileAttachment = { id: string; file: File; type: 'image' | 'text' | 'document'; previewUrl?: string };
  const [files, setFiles] = useState<FileAttachment[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    // Limits
    const isPro = usageStatus?.is_paid;
    const isFreeAuth = !!user;
    const limit = isPro ? 5 : isFreeAuth ? 2 : 1;

    if (files.length + selected.length > limit) {
      setFileError(`You can only upload ${limit} files on your ${isPro ? 'Pro' : isFreeAuth ? 'Free' : 'Guest'} plan.`);
      // clear input
      e.target.value = "";
      return;
    }

    const newFiles: FileAttachment[] = [];
    let error = "";

    for (const file of selected) {
      // Size check (10MB)
      if (file.size > 10 * 1024 * 1024) {
        error = `File "${file.name}" exceeds 10MB limit.`;
        break;
      }

      // Video check (strictly banned)
      if (file.type.startsWith('video/')) {
        error = "Video files are not allowed. Only Images and Documents (PDF, DOCX, TXT).";
        break;
      }

      // Type classification
      let type: FileAttachment['type'] = 'document';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.csv')) type = 'text';

      newFiles.push({
        id: Math.random().toString(36).slice(2),
        file,
        type,
        previewUrl: type === 'image' ? URL.createObjectURL(file) : undefined
      });
    }

    if (error) {
      setFileError(error);
      e.target.value = "";
      return;
    }

    setFileError("");
    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = ""; // reset to allow selecting same file again
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  // Read template and prompt from URL on mount
  useEffect(() => {
    const templateParam = searchParams.get("template");
    if (templateParam) {
      const exists = templates.some((t) => t.id === templateParam);
      if (exists) {
        setSelectedTemplateId(templateParam);
      }
    }

    const promptParam = searchParams.get("prompt");
    if (promptParam) {
      setStartInput(promptParam);
      pendingAutoSendRef.current = promptParam;
    }
  }, [searchParams]);

  // Auto-send when coming from homepage with prompt
  useEffect(() => {
    if (pendingAutoSendRef.current && startInput === pendingAutoSendRef.current && mode === "start") {
      pendingAutoSendRef.current = null;
      // Small delay to ensure state is ready
      const timer = setTimeout(() => {
        const sendBtn = document.querySelector('[data-auto-send]') as HTMLButtonElement;
        if (sendBtn) sendBtn.click();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [startInput, mode]);

  // PROJECT mode (chat)
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Tell me what you want. Example: “Generate a formula sheet from my lecture notes (LaTeX + PDF)”",
    },
  ]);
  const [projectInput, setProjectInput] = useState("");

  // RESULT state
  const [activeRightTab, setActiveRightTab] = useState<"preview" | "latex" | "split">("preview");

  // Split-view resizer
  const [splitRatio, setSplitRatio] = useState(50); // percentage for left (code) panel
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

  const [draftLatex, setDraftLatex] = useState("");
  const [savedLatex, setSavedLatex] = useState("");
  const [compiledLatex, setCompiledLatex] = useState(""); // last latex that produced current pdf

  const [dirty, setDirty] = useState(false);
  const previewOutdated = compiledLatex !== "" && compiledLatex !== savedLatex;

  const [pdfUrl, setPdfUrl] = useState<string>(""); // object URL of last valid pdf
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);

  const [compileError, setCompileError] = useState<string>("");
  const [compileLog, setCompileLog] = useState<string>("");

  // AI fix (client-driven via /generate-latex)
  const [isFixing, setIsFixing] = useState(false);
  const [fixCandidate, setFixCandidate] = useState<string>(""); // suggested fixed latex (full document)
  const [showFixModal, setShowFixModal] = useState(false);

  // Draft restoration state
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<WorkspaceDraft | null>(null);

  // ========== FREEMIUM STATE ==========
  const [user, setUser] = useState<User | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [anonymousMessageSent, setAnonymousMessageSent] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<typeof templates[number] | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Slash-command picker refs
  const slashPickerStartRef = useRef<SlashCommandPickerRef>(null);
  const slashPickerProjectRef = useRef<SlashCommandPickerRef>(null);

  // Console panel state
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleStatus, setConsoleStatus] = useState<"idle" | "compiling" | "success" | "error">("idle");
  const [compileTime, setCompileTime] = useState(0);

  // Auto-compile flag: set to true after restoring draft with content
  const pendingAutoCompile = useRef(false);

  // Ctrl+S / Cmd+S to save and compile
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (mode === "project" && draftLatex.trim() && !busy()) {
          saveAndCompile();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    if (mode === "project") bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mode]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft
  useEffect(() => {
    if (draftLatex || savedLatex || messages.length > 1) {
      saveWorkspaceDraft({
        draftLatex,
        savedLatex,
        messages,
        selectedTemplateId,
      });
    }
  }, [draftLatex, savedLatex, messages, selectedTemplateId]);

  // Check for saved draft on mount
  useEffect(() => {
    const draft = loadWorkspaceDraft();
    if (draft && (draft.draftLatex || draft.savedLatex || draft.messages.length > 1)) {
      setPendingDraft(draft);
      setShowRestoreBanner(true);
    }
  }, []);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setDraftLatex(pendingDraft.draftLatex);
    setSavedLatex(pendingDraft.savedLatex);
    setMessages(pendingDraft.messages);
    if (pendingDraft.selectedTemplateId) setSelectedTemplateId(pendingDraft.selectedTemplateId);
    if (pendingDraft.draftLatex || pendingDraft.savedLatex) {
      setMode("project");
      if (pendingDraft.draftLatex.trim() || pendingDraft.savedLatex.trim()) {
        pendingAutoCompile.current = true;
      }
    }
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }, [pendingDraft]);

  const resetWorkspace = useCallback(() => {
    setMessages([{
      role: "assistant",
      content: "Tell me what you want. Example: \u201cGenerate a formula sheet from my lecture notes (LaTeX + PDF)\u201d",
    }]);
    setProjectInput("");
    setDraftLatex("");
    setSavedLatex("");
    setCompiledLatex("");
    setDirty(false);
    setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    setCurrentChatId(null);
    setFiles([]);
    setFileError("");
    setCompileError("");
    setCompileLog("");
    setFixCandidate("");
    setShowFixModal(false);
    setActiveRightTab("preview");
    clearWorkspaceDraft();
  }, []);

  const dismissDraft = useCallback(() => {
    clearWorkspaceDraft();
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }, []);

  // ========== AUTH & USAGE EFFECTS ==========
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const status = await getUsageStatus();
          setUsageStatus(status);
          if (event === 'SIGNED_IN') {
            const draft = loadWorkspaceDraft();
            if (draft && (draft.draftLatex || draft.savedLatex || draft.messages.length > 1)) {
              const chatId = await saveChat({
                template_id: draft.selectedTemplateId || undefined,
                latex_content: draft.savedLatex || draft.draftLatex,
                messages: draft.messages,
              });
              if (chatId) {
                setCurrentChatId(chatId);
                clearWorkspaceDraft();
              }
            }
          }
        } else {
          setUsageStatus(null);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const status = await getUsageStatus();
        setUsageStatus(status);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sent = localStorage.getItem('betternotes_anonymous_sent');
      if (sent === 'true') {
        setAnonymousMessageSent(true);
      }
    }
  }, []);

  useEffect(() => {
    const chatId = searchParams.get("chat");
    if (!chatId || !user) return;

    async function loadChatFromUrl() {
      const chat = await loadChat(chatId!);
      if (chat) {
        setCurrentChatId(chat.id);
        setMessages(chat.messages as Msg[] || []);
        setDraftLatex(chat.latex_content || "");
        setSavedLatex(chat.latex_content || "");
        if (chat.template_id) setSelectedTemplateId(chat.template_id);
        if (chat.latex_content || (chat.messages && chat.messages.length > 1)) {
          setMode("project");
        }
      }
    }
    loadChatFromUrl();
  }, [searchParams, user]);

  // ========== GATE LOGIC ==========
  const canSendMessage = useCallback(async (): Promise<boolean> => {
    console.log('[GATE] canSendMessage called', { user: !!user, anonymousMessageSent });

    if (!user && !anonymousMessageSent) return true;

    if (!user && anonymousMessageSent) {
      router.push('/login?message=' + encodeURIComponent('Sign up to continue generating documents. Your work will be saved!'));
      return false;
    }

    if (user) {
      try {
        const status = await getUsageStatus();
        setUsageStatus(status);
        if (!status) return true; // Fail open
        if (!status.can_send) {
          setShowPaywallModal(true);
          return false;
        }
      } catch (e) {
        console.warn('[GATE] Exception checking usage, failing open', e);
        return true;
      }
      return true;
    }
    return true;
  }, [user, anonymousMessageSent]);

  const onMessageSent = useCallback(async (latexContent?: string, newMessages?: Msg[]) => {
    if (!user) {
      setAnonymousMessageSent(true);
      if (typeof window !== 'undefined') localStorage.setItem('betternotes_anonymous_sent', 'true');
      return;
    }

    try {
      const result = await incrementMessageCount();
      if (result) {
        setUsageStatus(prev => prev ? {
          ...prev,
          message_count: result.new_count,
          remaining: result.remaining,
          can_send: !result.limit_reached
        } : null);
      }

      const messagesToSave = newMessages || messages;
      const userMsgs = messagesToSave.filter(m => m.role === 'user');
      const title = userMsgs[0]?.content.slice(0, 50) || 'Untitled';

      if (currentChatId) {
        await updateChat(currentChatId, {
          title,
          messages: messagesToSave,
          latex_content: latexContent || savedLatex || draftLatex,
        });
      } else {
        const newChatId = await saveChat({
          title,
          messages: messagesToSave,
          latex_content: latexContent || savedLatex || draftLatex,
          template_id: selectedTemplateId || undefined,
        });
        if (newChatId) setCurrentChatId(newChatId);
      }
    } catch (e) {
      console.warn('Failed to auto-save chat:', e);
    }
  }, [user, messages, currentChatId, savedLatex, draftLatex, selectedTemplateId]);

  function focusInputWithPrompt(prompt: string) {
    setStartInput(prompt);
    inputRef.current?.focus();
  }

  function busy() {
    return isGenerating || isCompiling || isFixing;
  }

  // ---------- Core actions ----------
  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) ?? null;
  }, [selectedTemplateId]);

  async function generateLatexFromPrompt(
    prompt: string,
    templateId?: string | null,
    baseLatex?: string,
    files?: any[]
  ): Promise<{ ok: true; latex?: string; message?: string } | { ok: false; error: string }> {
    console.log('[generate] Starting generation...', { prompt, templateId, hasBase: !!baseLatex, filesCount: files?.length });
    try {
      setIsGenerating(true);

      const payload: { prompt: string; templateId?: string; baseLatex?: string; files?: any[] } = { prompt };
      if (templateId) payload.templateId = templateId;
      if (baseLatex?.trim()) payload.baseLatex = baseLatex;
      if (files && files.length > 0) payload.files = files;

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
      if (!r.ok) return { ok: false, error: data?.error ?? "Failed to generate." };

      if (data.message) {
        return { ok: true, message: data.message };
      }

      const latex = (data?.latex ?? "").toString();
      // Relaxed check: if message is present, latex is optional. If neither, error.
      if (!latex.trim() && !data.message) return { ok: false, error: "Model returned empty response." };

      return { ok: true, latex };
    } catch (e: any) {
      if (e.name === 'AbortError') return { ok: false, error: "Request timed out (180s)." };
      return { ok: false, error: e?.message ?? "Generate error" };
    } finally {
      setIsGenerating(false);
    }
  }

  async function compileSavedLatex(): Promise<{ ok: true } | { ok: false; error: string; log?: string }> {
    if (!savedLatex.trim()) return { ok: false, error: "Nothing to compile." };
    const res = await compileDirect(savedLatex);
    if (res.ok) setCompiledLatex(savedLatex);
    return res;
  }

  async function saveAndCompile() {
    const toCompile = draftLatex;
    if (!toCompile.trim()) return { ok: false, error: "Nothing to compile." };
    setSavedLatex(toCompile);
    setDirty(false);
    setCompileError("");
    setCompileLog("");
    const res = await compileDirect(toCompile);
    if (res.ok) setCompiledLatex(toCompile);
    return res;
  }

  // Auto-compile after draft restore
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

  async function fixWithAI() {
    if (!savedLatex.trim() || !compileLog.trim()) return;
    setIsFixing(true);
    try {
      const r = await fetch(`${API_BASE_URL}/fix-latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: savedLatex, log: compileLog }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Fix failed.");
      const fixed = (data?.fixedLatex ?? "").toString();
      if (!fixed.trim()) throw new Error("Fix endpoint returned empty LaTeX.");
      setFixCandidate(fixed);
      setShowFixModal(true);
    } catch (e: any) {
      setCompileError(e?.message ?? "Fix error");
    } finally {
      setIsFixing(false);
    }
  }

  async function applyFixAndCompile() {
    if (!fixCandidate.trim()) return;
    setDraftLatex(fixCandidate);
    setSavedLatex(fixCandidate);
    setDirty(false);
    setShowFixModal(false);
    setCompileError("");
    setCompileLog("");
    await compileSavedLatex();
  }

  function downloadTex() {
    const src = savedLatex || draftLatex;
    if (!src.trim()) return;
    const blob = new Blob([src], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "main.tex";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "output.pdf";
    a.click();
  }

  // ---------- Send flows ----------

  async function processFilesForPayload(currentFiles: FileAttachment[]): Promise<{ type: 'image' | 'text' | 'document'; url?: string; data?: string; name: string }[]> {
    if (currentFiles.length === 0) return [];

    // Determine upload method
    const isAuth = !!user;

    const processed = await Promise.all(currentFiles.map(async (f) => {
      // If auth, try upload to storage
      if (isAuth && user) {
        // Import dynamically or assume imported
        const { uploadFileToStorage, fileToBase64 } = await import("../../../lib/storage");

        // For images/docs, upload to storage
        const publicUrl = await uploadFileToStorage(f.file, user.id);
        if (publicUrl) {
          return { type: f.type, url: publicUrl, name: f.file.name };
        }
        // Fallback to base64 if upload fails? Or just fail? Let's fallback to base64 for resilience if small enough
        console.warn("Upload failed, falling back to base64");
      }

      // Anonymous or fallback: Base64
      const { fileToBase64 } = await import("../../../lib/storage");
      const b64 = await fileToBase64(f.file);
      return { type: f.type, data: b64, name: f.file.name };
    }));

    return processed;
  }

  // ── Animated loading steps ──
  const loadingSteps = [
    "Analyzing your request…",
    "Generating LaTeX content…",
    "Structuring document layout…",
    "Formatting equations and symbols…",
    "Finalizing output…",
  ];

  function startLoadingAnimation() {
    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % loadingSteps.length;
      setMessages((m) => replaceLastWorking(m, loadingSteps[step]));
    }, 3000);
    return interval;
  }

  async function startSend() {
    const text = startInput.trim();
    const hasFiles = files.length > 0;

    if ((!text && !hasFiles) || busy()) return;

    const allowed = await canSendMessage();
    if (!allowed) return;

    setMode("project");
    setStartInput("");
    setProjectInput("");

    setMessages((m) => [
      ...m,
      { role: "user", content: text || (hasFiles ? `[Sent ${files.length} file(s)]` : "") },
      { role: "assistant", content: loadingSteps[0] },
    ]);

    const loadingInterval = startLoadingAnimation();

    // Process files
    const filePayload = await processFilesForPayload(files);
    setFiles([]);
    setFileError("");

    const gen = await generateLatexFromPrompt(text, selectedTemplate?.id, undefined, filePayload);
    clearInterval(loadingInterval);

    if (!gen.ok) {
      setMessages((m) => replaceLastWorking(m, `Error: ${gen.error}`));
      return;
    }

    handleGenerationResult(gen);
  }

  async function projectSend() {
    const text = projectInput.trim();
    const hasFiles = files.length > 0;

    if ((!text && !hasFiles) || busy()) return;

    const allowed = await canSendMessage();
    if (!allowed) return;

    setProjectInput("");

    setMessages((m) => [
      ...m,
      { role: "user", content: text || (hasFiles ? `[Sent ${files.length} file(s)]` : "") },
      { role: "assistant", content: loadingSteps[0] },
    ]);

    const loadingInterval = startLoadingAnimation();

    // Process files
    const filePayload = await processFilesForPayload(files);
    setFiles([]);
    setFileError("");

    const base = (draftLatex || savedLatex || "").trim();

    const gen = await generateLatexFromPrompt(text, selectedTemplate?.id, base, filePayload);
    clearInterval(loadingInterval);

    if (!gen.ok) {
      setMessages((m) => replaceLastWorking(m, `Error: ${gen.error}`));
      return;
    }

    handleGenerationResult(gen);
  }

  // Refactored result handler to avoid duplication
  async function handleGenerationResult(gen: { ok: true; latex?: string; message?: string } | { ok: false; error: string }) {
    if (!gen.ok) return; // Should be handled by caller

    // Check if it's a plain message (General Chat)
    if (gen.message) {
      setMessages((m) => replaceLastWorking(m, gen.message!));
      return;
    }

    // It's LaTeX
    const newLatex = gen.latex || "";

    // UPDATE UI IMMEDIATELY
    setDraftLatex(newLatex);
    setSavedLatex(newLatex);
    setDirty(false);
    setActiveRightTab("preview");

    setMessages((m) => replaceLastWorking(m, `Generated. Compiling PDF...`));

    // RUN TASKS IN PARALLEL
    const compilePromise = compileDirect(newLatex);
    const savePromise = onMessageSent(newLatex);

    const comp = await compilePromise;
    if (!comp.ok) {
      setMessages((m) => replaceLastWorking(m, `Generated LaTeX, but compilation failed. Use “Fix with AI”.`));
    } else {
      setCompiledLatex(newLatex);
      setMessages((m) => replaceLastWorking(m, `Done. Preview updated.`));
    }

    await savePromise;
  }

  // helper: compile a direct latex string
  async function compileDirect(latex: string): Promise<{ ok: true } | { ok: false; error: string; log?: string }> {
    setCompileError("");
    setCompileLog("");
    try {
      setIsCompiling(true);
      const r = await fetch(`${API_BASE_URL}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });
      const ct = (r.headers.get("content-type") || "").toLowerCase();

      if (r.ok) {
        if (ct.includes("application/pdf")) {
          const buf = await r.arrayBuffer();
          if (!buf || buf.byteLength === 0) {
            setCompileError("PDF response empty.");
            return { ok: false, error: "PDF response empty." };
          }
          const blob = new Blob([buf], { type: "application/pdf" });
          setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
          return { ok: true };
        }
        const data = await r.json().catch(() => null);
        const pdfBase64 = (data?.pdfBase64 ?? data?.pdf_base64 ?? data?.pdf ?? "").toString();
        if (!pdfBase64.trim()) {
          const msg = "PDF payload empty.";
          setCompileError(msg);
          if (data?.log) setCompileLog(String(data.log));
          return { ok: false, error: msg, log: data?.log ?? "" };
        }
        const bytes = base64ToUint8Array(pdfBase64);
        const blob = new Blob([bytes], { type: "application/pdf" });
        setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        return { ok: true };
      }

      const data = await r.json().catch(() => null);
      const rawErr = (data?.error ?? "Compilation failed.").toString();
      const { message, log } = splitCompilerOutput(rawErr);
      setCompileError(message);
      setCompileLog(log || (data?.log ? String(data.log) : ""));
      return { ok: false, error: message, log: log || (data?.log ? String(data.log) : "") };
    } catch (e: any) {
      setCompileError(e?.message || "Compile error");
      return { ok: false, error: e?.message || "Compile error" };
    } finally {
      setIsCompiling(false);
    }
  }

  function replaceLastWorking(m: Msg[], newText: string) {
    const copy = [...m];
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].role === "assistant" && (copy[i].content.includes("Working…") || copy[i].content.includes("Generating") || copy[i].content.includes("Compiling"))) {
        copy[i] = { role: "assistant", content: newText };
        break;
      }
    }
    return copy;
  }

  if (mode === "project") {
    const canSaveAndCompile = draftLatex.trim().length > 0 && !busy();
    return (
      <main className="min-h-screen text-white">
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] min-h-screen">
          <aside className="border-r border-white/10 bg-white/5 backdrop-blur flex flex-col">
            <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Project</div>
                <div className="text-xs text-white/60">Chat → LaTeX → PDF</div>
              </div>
              <button onClick={() => { resetWorkspace(); setMode("start"); }} className="text-xs rounded-xl border border-white/15 bg-white/10 px-2 py-1 hover:bg-white/15">← Back</button>
            </div>
            <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
              {messages.map((m, idx) => (
                <div key={idx} className={["max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed border", m.role === "user" ? "ml-auto bg-white/10 border-white/15" : "mr-auto bg-black/20 border-white/10"].join(" ")}>{m.content}</div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="p-4 border-t border-white/10">
              {/* Usage Indicator */}
              {user && usageStatus && (
                <div className="mb-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${usageStatus.remaining > 2 ? 'bg-emerald-400' : usageStatus.remaining > 0 ? 'bg-amber-400' : 'bg-red-400'}`} />
                    <span className="text-white/70">
                      {usageStatus.is_paid ? 'Pro' : 'Free'}: <span className="text-white font-medium">{usageStatus.remaining}</span>/{usageStatus.free_limit} left
                    </span>
                  </div>
                  {!usageStatus.is_paid && usageStatus.remaining <= 2 && (
                    <a href="/pricing" className="text-emerald-400 hover:underline">Upgrade</a>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => document.getElementById("hidden-file-input-project")?.click()}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
                  title="Attach file"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                </button>
                <input
                  type="file"
                  id="hidden-file-input-project"
                  multiple
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.md,.csv,.docx"
                  onChange={handleFileSelect}
                />

                <div className="flex-1 flex flex-col gap-2">
                  {/* File Error (Project) */}
                  {fileError && (
                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg flex items-center justify-between">
                      <span>{fileError}</span>
                      <button onClick={() => setFileError("")}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  )}
                  {/* File Chips (Project) */}
                  {files.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {files.map(f => (
                        <div key={f.id} className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 pl-2 pr-1 py-1.5">
                          {f.type === 'image' && f.previewUrl ? (
                            <img src={f.previewUrl} alt="preview" className="w-6 h-6 rounded object-cover border border-white/10" />
                          ) : (
                            <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white/50">
                              <span className="uppercase text-[9px] font-bold">{f.file.name.split('.').pop()?.slice(0, 3)}</span>
                            </div>
                          )}
                          <span className="text-xs text-white/90 truncate max-w-[100px]" title={f.file.name}>{f.file.name}</span>
                          <button onClick={() => removeFile(f.id)} className="ml-1 text-white/40 hover:text-red-300"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="relative w-full">
                    <SlashCommandPicker
                      ref={slashPickerProjectRef}
                      inputValue={projectInput}
                      isPro={usageStatus?.is_paid ?? false}
                      onSelect={(id) => { setSelectedTemplateId(id); setProjectInput(""); }}
                      onProBlocked={() => setShowPaywallModal(true)}
                      onDismiss={() => setProjectInput("")}
                    />
                    <input
                      value={projectInput}
                      onChange={(e) => setProjectInput(e.target.value)}
                      onKeyDown={(e) => { if (slashPickerProjectRef.current?.handleKeyDown(e)) return; if (e.key === "Enter" && !e.shiftKey) projectSend(); }}
                      className="h-10 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                      placeholder="Type / for templates, or ask BetterNotes…"
                    />
                  </div>
                </div>

                <button
                  onClick={projectSend}
                  className={["h-10 rounded-xl px-4 text-sm font-semibold self-end", (projectInput.trim().length > 0 || files.length > 0) && !busy() ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"].join(" ")}
                >
                  {isGenerating ? "Generating…" : isCompiling ? "Compiling…" : isFixing ? "Fixing…" : "Send"}
                </button>
              </div>
            </div>
          </aside>
          <section className="flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Result</div>
                <div className="text-xs text-white/60">
                  {!draftLatex ? "Send a prompt to generate LaTeX + PDF." : !pdfUrl ? "No PDF yet — compile to generate the preview." : previewOutdated ? "Preview is outdated — run Save & Compile to update." : "PDF preview is up to date."}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setActiveRightTab("preview")} className={["rounded-xl px-3 py-2 text-sm border", activeRightTab === "preview" ? "bg-white text-neutral-950 border-white" : "bg-white/10 text-white/85 border-white/15 hover:bg-white/15"].join(" ")}>Preview</button>
                <button onClick={() => setActiveRightTab("latex")} className={["rounded-xl px-3 py-2 text-sm border", activeRightTab === "latex" ? "bg-white text-neutral-950 border-white" : "bg-white/10 text-white/85 border-white/15 hover:bg-white/15"].join(" ")}>LaTeX</button>
                <button onClick={() => setActiveRightTab("split")} className={["rounded-xl px-3 py-2 text-sm border", activeRightTab === "split" ? "bg-white text-neutral-950 border-white" : "bg-white/10 text-white/85 border-white/15 hover:bg-white/15"].join(" ")} title="Side-by-side: Code + Preview">
                  <svg className="w-4 h-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 4.5h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18V6a1.5 1.5 0 011.5-1.5z" /></svg>
                </button>
                <div className="w-px h-7 bg-white/10 mx-1" />
                <button onClick={saveAndCompile} disabled={!canSaveAndCompile} className={["rounded-xl px-3 py-2 text-sm font-semibold", canSaveAndCompile ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"].join(" ")}>Compile</button>
                <div className="w-px h-7 bg-white/10 mx-1" />
                <button onClick={openSaveModal} disabled={!draftLatex.trim()} className="rounded-xl px-3 py-2 text-sm border border-emerald-400/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed font-medium" title="Save to a project or chat">
                  <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
                  Save
                </button>
                <button onClick={downloadTex} disabled={!draftLatex.trim()} className="rounded-xl px-3 py-2 text-sm border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-40">.tex</button>
                <button onClick={downloadPdf} disabled={!pdfUrl} className="rounded-xl px-3 py-2 text-sm border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-40">PDF</button>
              </div>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-3">
              {activeRightTab === "split" ? (
                /* ── Split view ── */
                <div ref={splitContainerRef} className="flex-1 flex rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
                  {/* Code panel */}
                  <div style={{ width: `${splitRatio}%` }} className="flex flex-col min-w-0">
                    <div className="px-3 py-1.5 border-b border-white/8 text-[10px] text-white/30 font-semibold uppercase tracking-wider">LaTeX</div>
                    <textarea value={draftLatex} onChange={(e) => { setDraftLatex(e.target.value); setDirty(e.target.value !== savedLatex); }} className="flex-1 w-full bg-transparent p-4 font-mono text-sm outline-none text-white/90 resize-none" placeholder="LaTeX will appear here…" />
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
                      {pdfUrl ? <iframe title="PDF Preview" src={pdfUrl} className="w-full h-full" /> : (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                          <svg className={`h-10 w-10 text-white/10 ${isGenerating || isCompiling ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <div className="text-white/30 text-sm">{isGenerating ? 'Generating your document…' : isCompiling ? 'Compiling PDF…' : 'Your PDF preview will appear here'}</div>
                          <div className="text-white/15 text-xs">{isGenerating ? 'This usually takes 10–30 seconds' : isCompiling ? 'Almost there…' : 'Send a prompt to get started'}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Single panel (Preview or LaTeX) ── */
                <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
                  {activeRightTab === "preview" ? (
                    pdfUrl ? <iframe title="PDF Preview" src={pdfUrl} className="w-full h-full" /> : (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                        <svg className={`h-10 w-10 text-white/10 ${isGenerating || isCompiling ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <div className="text-white/30 text-sm">{isGenerating ? 'Generating your document…' : isCompiling ? 'Compiling PDF…' : 'Your PDF preview will appear here'}</div>
                        <div className="text-white/15 text-xs">{isGenerating ? 'This usually takes 10–30 seconds' : isCompiling ? 'Almost there…' : 'Send a prompt on the left to get started'}</div>
                      </div>
                    )
                  ) : (
                    <textarea value={draftLatex} onChange={(e) => { setDraftLatex(e.target.value); setDirty(e.target.value !== savedLatex); }} className="w-full h-full bg-transparent p-4 font-mono text-sm outline-none text-white/90" placeholder="LaTeX will appear here…" />
                  )}
                </div>
              )}
              {/* ── Compilation Console ── */}
              {(compileError || isCompiling || consoleOpen) && (
                <div className={`rounded-2xl border p-3 transition-all ${compileError ? "border-red-400/20 bg-red-500/10" : isCompiling ? "border-amber-400/20 bg-amber-500/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
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
                      {compileError && <span className="text-xs text-red-200/70 max-w-md truncate">{compileError}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {compileError && compileLog.trim() && (
                        <button onClick={fixWithAI} disabled={busy()} className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${!busy() ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"}`}>{isFixing ? "Fixing…" : "Fix with AI"}</button>
                      )}
                      <button onClick={() => { setCompileError(""); setCompileLog(""); setConsoleOpen(false); }} className="rounded-lg px-2 py-1 text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/40">Clear</button>
                    </div>
                  </div>
                  {compileLog && (
                    <pre className="mt-2 max-h-36 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/60 font-mono">{compileLog}</pre>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
        <PaywallModal isOpen={showPaywallModal} onClose={() => setShowPaywallModal(false)} remaining={usageStatus?.remaining} resetsAt={usageStatus?.resets_at} />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen text-white">
      {showRestoreBanner && pendingDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-b border-emerald-400/30 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center"><svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <div><p className="text-sm font-medium text-white">You have unsaved work</p></div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={dismissDraft} className="px-3 py-1.5 text-xs rounded-lg border border-white/15 bg-white/10 hover:bg-white/15">Start fresh</button>
              <button onClick={restoreDraft} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium">Restore work</button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-44">
        <div className="text-center">
          <h1 className="mt-6 text-3xl sm:text-5xl font-semibold tracking-tight">What should we build?</h1>
          <p className="mt-3 text-white/70">Example: “Generate a formula sheet from my lecture notes (LaTeX + PDF)”.</p>
        </div>
        <div className="mt-10 mx-auto max-w-3xl rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
          <div className="flex items-center gap-2 relative">
            <SlashCommandPicker
              ref={slashPickerStartRef}
              inputValue={startInput}
              isPro={usageStatus?.is_paid ?? false}
              onSelect={(id) => { setSelectedTemplateId(id); setStartInput(""); }}
              onProBlocked={() => setShowPaywallModal(true)}
              onDismiss={() => setStartInput("")}
            />
            <input ref={inputRef} value={startInput} onChange={(e) => setStartInput(e.target.value)} onKeyDown={(e) => { if (slashPickerStartRef.current?.handleKeyDown(e)) return; if (e.key === "Enter" && !e.shiftKey) startSend(); }} className="h-10 flex-1 rounded-xl border border-white/15 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white" placeholder="Type / for templates, or describe what to create…" />
            <div className="flex items-center gap-1">
              <button
                onClick={() => document.getElementById("hidden-file-input-start")?.click()}
                className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                title="Attach file"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              </button>
              <button data-auto-send onClick={startSend} className={["h-10 rounded-xl px-4 text-sm font-semibold", startInput.trim() || files.length > 0 ? "bg-white text-neutral-950" : "bg-white/20 text-white/60"].join(" ")}>{isGenerating ? "Generating…" : "Send"}</button>
            </div>
          </div>
          <input
            type="file"
            id="hidden-file-input-start"
            multiple
            className="hidden"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.md,.csv,.docx"
            onChange={handleFileSelect}
          />

          {/* File Error Feedback */}
          {fileError && (
            <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-1">
              <span>{fileError}</span>
              <button onClick={() => setFileError("")}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          )}

          {/* File Chips */}
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map(f => (
                <div key={f.id} className="group relative flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 pl-2 pr-1 py-1.5 overflow-hidden">
                  {f.type === 'image' && f.previewUrl ? (
                    <img src={f.previewUrl} alt="preview" className="w-8 h-8 rounded object-cover border border-white/10" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-white/50">
                      <span className="uppercase text-[10px] font-bold">{f.file.name.split('.').pop()?.slice(0, 3)}</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-[60px] max-w-[120px]">
                    <span className="text-xs text-white/90 truncate" title={f.file.name}>{f.file.name}</span>
                    <span className="text-[10px] text-white/50">{(f.file.size / 1024).toFixed(0)}KB</span>
                  </div>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="ml-1 p-1 rounded-md text-white/40 hover:text-red-300 hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {/* Selected template chip */}
            {selectedTemplateId && (() => {
              const tmpl = templates.find(t => t.id === selectedTemplateId);
              return tmpl ? (
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 pl-1 pr-2 py-1">
                  {tmpl.thumbnailPath && (
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-emerald-400/30">
                      <img src={tmpl.thumbnailPath} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <span className="text-xs font-medium text-emerald-300">{tmpl.name}</span>
                  <button
                    onClick={() => setSelectedTemplateId(null)}
                    className="ml-1 text-emerald-400/60 hover:text-emerald-300 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : null;
            })()}
            <Chip onClick={() => setStartInput("Formula sheet for Physics")}>Formula sheet</Chip>
            <Chip onClick={() => setStartInput("Summary of History notes")}>Summary</Chip>
          </div>
        </div>
        <div className="mt-8 mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recommended Templates</h2>
            <Link href="/templates" className="text-sm text-white/70 hover:text-white transition-colors">View all →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.slice(0, 6).map(t => (
              <TemplateCardSelect
                key={t.id}
                t={t as any}
                selected={selectedTemplateId === t.id}
                onSelect={() => setSelectedTemplateId(curr => curr === t.id ? null : t.id)}
                onPreview={() => setPreviewTemplate(t)}
                userIsPro={usageStatus?.is_paid ?? false}
                onProBlocked={() => setShowPaywallModal(true)}
              />
            ))}
          </div>
        </div>
      </div>
      <PaywallModal isOpen={showPaywallModal} onClose={() => setShowPaywallModal(false)} remaining={usageStatus?.remaining} resetsAt={usageStatus?.resets_at} />
      <PdfPreviewModal
        isOpen={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        pdfUrl={(previewTemplate as any)?.previewPath ?? previewTemplate?.publicPath ?? ""}
        title={previewTemplate?.name ?? ""}
        templateId={previewTemplate?.id}
        isPro={previewTemplate?.isPro ?? false}
        userIsPro={usageStatus?.is_paid ?? false}
      />
      <SaveProjectModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        latex={draftLatex}
        messages={messages}
        templateId={selectedTemplateId}
        onSaved={(projectId) => {
          if (projectId) router.push(`/workspace/${projectId}`);
        }}
      />
    </main>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15">{children}</button>;
}

function Workspace() {
  return <Suspense fallback={<div className="min-h-screen text-white/60 p-10">Loading workspace...</div>}><WorkspaceContent /></Suspense>;
}

export default Workspace;
