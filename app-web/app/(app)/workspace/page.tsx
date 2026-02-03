"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import TemplateCardSelect from "@/app/components/TemplateCardSelect";
import PaywallModal from "@/app/components/PaywallModal";
import PdfPreviewModal from "@/app/components/PdfPreviewModal";
import { templates } from "../../../lib/templates";
import { saveWorkspaceDraft, loadWorkspaceDraft, clearWorkspaceDraft, WorkspaceDraft } from "../../../lib/workspaceDraft";
import { getUsageStatus, incrementMessageCount, saveChat, updateChat, loadChat, UsageStatus } from "../../../lib/api";
import { supabase } from "@/supabaseClient";
import type { User } from "@supabase/supabase-js";

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
  const [mode, setMode] = useState<Mode>("start");

  // START mode
  const [startInput, setStartInput] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const pendingAutoSendRef = useRef<string | null>(null);

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
  const [activeRightTab, setActiveRightTab] = useState<"preview" | "latex">("preview");

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
    if (pendingDraft.draftLatex || pendingDraft.savedLatex) setMode("project");
    setShowRestoreBanner(false);
    setPendingDraft(null);
  }, [pendingDraft]);

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
    baseLatex?: string
  ): Promise<{ ok: true; latex: string } | { ok: false; error: string }> {
    console.log('[generate] Starting generation...', { prompt, templateId, hasBase: !!baseLatex });
    try {
      setIsGenerating(true);

      const payload: { prompt: string; templateId?: string; baseLatex?: string } = { prompt };
      if (templateId) payload.templateId = templateId;
      if (baseLatex?.trim()) payload.baseLatex = baseLatex;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const r = await fetch(`${API_BASE_URL}/generate-latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await r.json().catch(() => null);
      if (!r.ok) return { ok: false, error: data?.error ?? "Failed to generate LaTeX." };

      const latex = (data?.latex ?? "").toString();
      if (!latex.trim()) return { ok: false, error: "Model returned empty LaTeX." };
      return { ok: true, latex };
    } catch (e: any) {
      if (e.name === 'AbortError') return { ok: false, error: "Request timed out (60s)." };
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
  async function startSend() {
    const text = startInput.trim();
    if (!text || busy()) return;

    const allowed = await canSendMessage();
    if (!allowed) return;

    setMode("project");
    setStartInput("");
    setProjectInput("");

    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "Working… generating LaTeX..." },
    ]);

    const gen = await generateLatexFromPrompt(text, selectedTemplate?.id);
    if (!gen.ok) {
      setMessages((m) => replaceLastWorking(m, `Error: ${gen.error}`));
      return;
    }

    // UPDATE UI IMMEDIATELY
    setDraftLatex(gen.latex);
    setSavedLatex(gen.latex);
    setCompiledLatex("");
    setDirty(false);
    setActiveRightTab("preview");

    setMessages((m) => replaceLastWorking(m, `Generated. Compiling PDF...`));

    // RUN TASKS IN PARALLEL
    const compilePromise = compileDirect(gen.latex);
    const savePromise = onMessageSent(gen.latex);

    const comp = await compilePromise;
    if (!comp.ok) {
      setMessages((m) => replaceLastWorking(m, `Generated LaTeX, but compilation failed. Use “Fix with AI”.`));
    } else {
      setCompiledLatex(gen.latex);
      setMessages((m) => replaceLastWorking(m, `Done. Preview updated.`));
    }

    await savePromise;
  }

  async function projectSend() {
    const text = projectInput.trim();
    if (!text || busy()) return;

    const allowed = await canSendMessage();
    if (!allowed) return;

    setProjectInput("");

    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "Working… generating LaTeX..." },
    ]);

    const base = (draftLatex || savedLatex || "").trim();

    const gen = await generateLatexFromPrompt(text, selectedTemplate?.id, base);
    if (!gen.ok) {
      setMessages((m) => replaceLastWorking(m, `Error: ${gen.error}`));
      return;
    }

    // UPDATE UI IMMEDIATELY
    setDraftLatex(gen.latex);
    setSavedLatex(gen.latex);
    setDirty(false);
    setActiveRightTab("preview");

    setMessages((m) => replaceLastWorking(m, `Generated. Compiling PDF...`));

    // RUN TASKS IN PARALLEL
    const compilePromise = compileDirect(gen.latex);
    const savePromise = onMessageSent(gen.latex);

    const comp = await compilePromise;
    if (!comp.ok) {
      setMessages((m) => replaceLastWorking(m, `Generated LaTeX, but compilation failed. Use “Fix with AI”.`));
    } else {
      setCompiledLatex(gen.latex);
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
              <button onClick={() => setMode("start")} className="text-xs rounded-xl border border-white/15 bg-white/10 px-2 py-1 hover:bg-white/15">← Back</button>
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
                <button className="h-10 w-10 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15" title="Attach (next step)" disabled>+</button>
                <input
                  value={projectInput}
                  onChange={(e) => setProjectInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) projectSend(); }}
                  className="h-10 flex-1 rounded-xl border border-white/15 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white"
                  placeholder="Ask BetterNotes to create…"
                />
                <button
                  onClick={projectSend}
                  className={["h-10 rounded-xl px-4 text-sm font-semibold", projectInput.trim().length > 0 && !busy() ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"].join(" ")}
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
                <div className="w-px h-7 bg-white/10 mx-1" />
                <button onClick={saveAndCompile} disabled={!canSaveAndCompile} className={["rounded-xl px-3 py-2 text-sm font-semibold", canSaveAndCompile ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"].join(" ")}>Compile</button>
                <div className="w-px h-7 bg-white/10 mx-1" />
                <button onClick={downloadTex} disabled={!draftLatex.trim()} className="rounded-xl px-3 py-2 text-sm border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-40">.tex</button>
                <button onClick={downloadPdf} disabled={!pdfUrl} className="rounded-xl px-3 py-2 text-sm border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-40">PDF</button>
              </div>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-3">
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
                {activeRightTab === "preview" ? (
                  pdfUrl ? <iframe title="PDF Preview" src={pdfUrl} className="w-full h-full" /> : <div className="h-full flex items-center justify-center text-white/60 text-sm">No PDF yet. Send a prompt on the left.</div>
                ) : (
                  <textarea value={draftLatex} onChange={(e) => { setDraftLatex(e.target.value); setDirty(e.target.value !== savedLatex); }} className="w-full h-full bg-transparent p-4 font-mono text-sm outline-none text-white/90" placeholder="LaTeX will appear here…" />
                )}
              </div>
              {compileError ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-red-200">Compilation failed</div>
                      <div className="text-xs text-red-200/80 mt-1">{compileError}</div>
                      {pdfUrl ? <div className="text-xs text-white/60 mt-2">Showing last valid PDF preview. Fix and recompile to update.</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setCompileError(""); setCompileLog(""); }} className="rounded-xl px-3 py-2 text-sm border border-white/15 bg-white/10 hover:bg-white/15">Dismiss</button>
                      <button onClick={fixWithAI} disabled={!compileLog.trim() || busy()} className={["rounded-xl px-3 py-2 text-sm font-semibold", compileLog.trim() && !busy() ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/20 text-white/60 cursor-not-allowed"].join(" ")}>{isFixing ? "Fixing…" : "Fix with AI"}</button>
                    </div>
                  </div>
                  {compileLog ? <pre className="mt-3 max-h-44 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/75">{compileLog}</pre> : null}
                </div>
              ) : null}
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
          <div className="flex items-center gap-2">
            <input ref={inputRef} value={startInput} onChange={(e) => setStartInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) startSend(); }} className="h-10 flex-1 rounded-xl border border-white/15 bg-black/20 px-3 text-sm outline-none placeholder:text-white/45 text-white" placeholder="Ask BetterNotes to create a project that..." />
            <button data-auto-send onClick={startSend} className={["h-10 rounded-xl px-4 text-sm font-semibold", startInput.trim() && !busy() ? "bg-white text-neutral-950" : "bg-white/20 text-white/60"].join(" ")}>{isGenerating ? "Generating…" : "Send"}</button>
          </div>
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
