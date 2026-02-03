// app-api/src/routes/latex.ts
import express from "express";
import OpenAI from "openai";
import { loadTemplateOrThrow, findPlaceholder } from "../lib/templates";
import { applyLatexFallbacks, stripMarkdownFences, compileLatexToPdf } from "../lib/latex";
import { trimHugeLog } from "../lib/errors";

type LatexDeps = {
  openai: OpenAI;
  openaiModel: string;
  templateDirAbs: string;
  latexTimeoutMs: number;
};

export function createLatexRouter(deps: LatexDeps) {
  const router = express.Router();

  async function extractFileContent(file: { type: string; url?: string; data?: string; name: string }): Promise<string | { type: "image_url"; image_url: { url: string } }> {
    // Images: Pass URL or Base64 directly to OpenAI
    if (file.type === 'image') {
      return {
        type: "image_url",
        image_url: {
          url: file.url || file.data || ""
        }
      };
    }

    // Text/Docs: Extract content
    let content = "";
    if (file.url) {
      try {
        const r = await fetch(file.url);
        if (r.ok) content = await r.text();
        else content = `[Error fetching file ${file.name}]`;
      } catch (e) {
        content = `[Error fetching file ${file.name}]`;
      }
    } else if (file.data) {
      // decode base64 if it's data url "data:text/plain;base64,..."
      try {
        const base64 = file.data.split(',')[1] || file.data;
        content = Buffer.from(base64, 'base64').toString('utf-8');
      } catch (e) {
        content = `[Error decoding file ${file.name}]`;
      }
    }

    return `\n=== FILE: ${file.name} ===\n${content}\n==================\n`;
  }

  async function generateLatexFromPrompt(args: {
    prompt: string;
    templateId: string;
    templateSource: string;
    wantOnlyBody: boolean;
    baseLatex?: string;
    files?: any[];
  }): Promise<{ latex?: string; message?: string }> {
    const { prompt, templateId, templateSource, wantOnlyBody, baseLatex, files } = args;

    // Build content with files
    const userContent: any[] = [{ type: "text", text: "" }];
    let fileTextContext = "";

    if (files && files.length > 0) {
      for (const f of files) {
        const extracted = await extractFileContent(f);
        if (typeof extracted === 'string') {
          fileTextContext += extracted;
        } else {
          userContent.push(extracted);
        }
      }
    }

    // System Prompt - UPDATED FOR HYBRID MODE
    const system = [
      "You are BetterNotes AI, an expert academic assistant FOCUSED on generating LaTeX documents.",
      "Your goal is ALWAYS to help the user create or refine a LaTeX document.",
      "- If the user sends a greeting or generic message (e.g., 'Hi'), reply politely but IMMEDIATELY ask about the document they want to create.",
      "- Do NOT engage in prolonged general chit-chat.",
      "- If output is a document, it MUST be valid LaTeX.",
      "- Use standard packages. Avoid exotic ones.",
      "- Never output triple backticks (```).",
      "CRITICAL: Do NOT use environments like 'example', 'theorem', 'proof' unless defined in the template. Use \\textbf{Example:} or \\section*{Example} instead.",
    ].join(" ");

    const messages: { role: "system" | "assistant" | "user"; content: any }[] = [{ role: "system", content: system }];

    // Construct User Message
    let textPrompt = "";
    if (typeof baseLatex === "string" && baseLatex.trim()) {
      messages.push({ role: "assistant", content: baseLatex });
      textPrompt = `Revise the previous LaTeX above according to: ${prompt}. Return the full updated document.`;
    } else if (wantOnlyBody) {
      textPrompt = [
        `We will insert your output into a LaTeX template (templateId="${templateId}").`,
        "Return ONLY the body/content to be inserted at the placeholder.",
        "IMPORTANT: If the user request is generic, generate REALISTIC DUMMY CONTENT.",
        "",
        "=== TEMPLATE (style ref) ===",
        templateSource,
        "",
        "=== USER REQUEST ===",
        prompt,
      ].join("\n");
    } else {
      textPrompt = [
        `Create a complete LaTeX document based on templateId="${templateId}".`,
        "Ensure the final output is a complete compilable .tex file.",
        "",
        "=== TEMPLATE ===",
        templateSource,
        "",
        "=== USER REQUEST ===",
        prompt,
        "",
        "If the user is NOT asking for a document and just chatting, reply with a PLAIN TEXT message asking for document details.",
      ].join("\n");
    }

    if (fileTextContext) {
      textPrompt += `\n\n[Attached File Content]:\n${fileTextContext}`;
    }

    userContent[0].text = textPrompt;
    messages.push({ role: "user", content: userContent });

    const resp = await deps.openai.chat.completions.create({
      model: deps.openaiModel, // Must support vision (gpt-4o)
      temperature: 0.2,
      messages: messages as any,
    });

    const out = resp.choices?.[0]?.message?.content ?? "";
    const cleanOut = stripMarkdownFences(out);

    // Heuristic: Is it LaTeX or Message?
    // If it contains \documentclass or \begin{document} or looks like body content for the template (harder to detect)
    // But if we asked for "body only", it might not have documentclass. 
    // Let's assume if it contains latex commands like \section or \item or \begin, it is latex. (Simple heuristic)
    // OR if we explicitly asked for chat (which we didn't, we left it to AI).

    // Better heuristic: If it starts with typical chat words "Hello", "Sure", "I can help", it might be chat, UNLESS it's followed by latex.
    // Let's check if it compiles? No too expensive.

    // If user asked for body only, it's almost certainly LaTeX unless ignored.
    // If full doc, look for \documentclass.

    if (cleanOut.includes("\\documentclass") || cleanOut.includes("\\begin{document}") || (wantOnlyBody && (cleanOut.includes("\\section") || cleanOut.includes("\\item")))) {
      return { latex: applyLatexFallbacks(cleanOut) };
    }

    // If it's short and no latex syntax, assume message?
    if (!cleanOut.includes("\\") && cleanOut.length < 500) {
      return { message: cleanOut };
    }

    // Default to LaTeX if unsure, or treat as message if it really doesn't look like LaTeX
    if (cleanOut.includes("\\")) return { latex: applyLatexFallbacks(cleanOut) };

    return { message: cleanOut };
  }

  async function fixLatexWithLog(args: { latex: string; log: string }): Promise<string> {
    const { latex, log } = args;

    const system = [
      "You are BetterNotes AI.",
      "You must output ONLY LaTeX source (no Markdown, no explanations).",
      "Fix the LaTeX so it compiles with pdflatex.",
      "Make the smallest changes necessary.",
      "Never output triple backticks.",
      "CRITICAL: If the error is 'Environment ... undefined', REPLACE that environment with a standard one (like 'itemize' or just \\textbf{Title}) or remove it. Do not try to define new environments in the body.",
    ].join(" ");

    const user = [
      "The LaTeX compilation failed. Fix the LaTeX based on the compiler log.",
      "Return the FULL corrected LaTeX document.",
      "",
      "=== LATEX ===",
      latex,
      "",
      "=== COMPILER LOG ===",
      log,
    ].join("\n");

    const resp = await deps.openai.chat.completions.create({
      model: deps.openaiModel,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const out = resp.choices?.[0]?.message?.content ?? "";
    return stripMarkdownFences(out);
  }

  // POST /latex/generate-latex
  router.post("/generate-latex", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt ?? "").trim();
      const templateId = String(req.body?.templateId ?? "2cols_portrait").trim();
      const baseLatexTrimmed = String(req.body?.baseLatex ?? "");
      const hasBaseLatex = baseLatexTrimmed.trim().length > 0;
      const files = Array.isArray(req.body?.files) ? req.body.files : []; // [{type, url/data, name}]

      if (!prompt && files.length === 0) return res.status(400).json({ ok: false, error: "Missing 'prompt' or 'files'." });

      const { source: templateSource } = loadTemplateOrThrow(deps.templateDirAbs, templateId);
      const placeholder = findPlaceholder(templateSource);
      const wantOnlyBody = !hasBaseLatex && Boolean(placeholder);

      const result = await generateLatexFromPrompt({
        prompt,
        templateId,
        templateSource,
        wantOnlyBody,
        baseLatex: hasBaseLatex ? baseLatexTrimmed.trim() : undefined,
        files
      });

      if (result.message) {
        return res.json({ ok: true, message: result.message });
      }

      const generated = result.latex || "";
      const latexRaw = wantOnlyBody && placeholder ? templateSource.replace(placeholder, generated) : generated;
      const latex = applyLatexFallbacks(latexRaw);

      return res.json({ ok: true, latex, usedTemplateId: templateId });
    } catch (e: any) {
      const status = Number(e?.statusCode ?? 500);
      return res.status(status).json({ ok: false, error: e?.message ?? "Server error" });
    }
  });

  // POST /latex/compile
  router.post("/compile", async (req, res) => {
    try {
      const latexRaw = String(req.body?.latex ?? "");
      if (!latexRaw.trim()) return res.status(400).json({ ok: false, error: "Missing 'latex'." });

      const { pdf } = await compileLatexToPdf(latexRaw, { timeoutMs: deps.latexTimeoutMs });

      res.setHeader("Content-Type", "application/pdf");
      return res.status(200).send(pdf);
    } catch (e: any) {
      const status = Number(e?.statusCode ?? 400);
      const log = typeof e?.log === "string" ? trimHugeLog(e.log) : undefined;
      const code = typeof e?.code === "string" ? e.code : undefined;
      const message = typeof e?.message === "string" ? e.message : "Compilation failed.";

      return res.status(status).json({ ok: false, error: message, code, log });
    }
  });

  // POST /latex/fix-latex
  router.post("/fix-latex", async (req, res) => {
    try {
      const latex = String(req.body?.latex ?? "");
      const log = String(req.body?.log ?? "");
      if (!latex.trim()) return res.status(400).json({ ok: false, error: "Missing 'latex'." });
      if (!log.trim()) return res.status(400).json({ ok: false, error: "Missing 'log'." });

      const fixedLatex = await fixLatexWithLog({ latex, log });
      if (!fixedLatex.trim()) return res.status(500).json({ ok: false, error: "Fix returned empty LaTeX." });

      return res.json({ ok: true, fixedLatex: applyLatexFallbacks(fixedLatex) });
    } catch (e: any) {
      const status = Number(e?.statusCode ?? 500);
      return res.status(status).json({ ok: false, error: e?.message ?? "Server error" });
    }
  });

  return router;
}