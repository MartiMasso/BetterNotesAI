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

  async function generateLatexFromPrompt(args: {
    prompt: string;
    templateId: string;
    templateSource: string;
    wantOnlyBody: boolean;
    baseLatex?: string;
  }): Promise<string> {
    const { prompt, templateId, templateSource, wantOnlyBody, baseLatex } = args;

    const system = [
      "You are BetterNotes AI.",
      "Output ONLY LaTeX source (no Markdown, no explanations).",
      "Your LaTeX MUST compile with pdflatex.",
      "Avoid exotic packages. Be conservative and minimal.",
      "Never output triple backticks.",
    ].join(" ");

    const messages: { role: "system" | "assistant" | "user"; content: string }[] = [{ role: "system", content: system }];

    if (typeof baseLatex === "string" && baseLatex.trim()) {
      messages.push({ role: "assistant", content: baseLatex });
      messages.push({
        role: "user",
        content: `Revise the previous LaTeX above according to: ${prompt}. Return the full updated document.`,
      });
    } else if (wantOnlyBody) {
      messages.push({
        role: "user",
        content: [
          `We will insert your output into a LaTeX template (templateId="${templateId}").`,
          "Return ONLY the body/content to be inserted at the placeholder, NOT a full document.",
          "",
          "=== TEMPLATE (for style reference) ===",
          templateSource,
          "",
          "=== USER REQUEST ===",
          prompt,
        ].join("\n"),
      });
    } else {
      messages.push({
        role: "user",
        content: [
          `Create a complete LaTeX document based on templateId="${templateId}".`,
          "Ensure the final output is a complete compilable .tex file for pdflatex.",
          "",
          "=== TEMPLATE (you may adapt) ===",
          templateSource,
          "",
          "=== USER REQUEST ===",
          prompt,
        ].join("\n"),
      });
    }

    const resp = await deps.openai.chat.completions.create({
      model: deps.openaiModel,
      temperature: 0.2,
      messages,
    });

    const out = resp.choices?.[0]?.message?.content ?? "";
    return applyLatexFallbacks(stripMarkdownFences(out));
  }

  async function fixLatexWithLog(args: { latex: string; log: string }): Promise<string> {
    const { latex, log } = args;

    const system = [
      "You are BetterNotes AI.",
      "You must output ONLY LaTeX source (no Markdown, no explanations).",
      "Fix the LaTeX so it compiles with pdflatex.",
      "Make the smallest changes necessary.",
      "Never output triple backticks.",
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
    return applyLatexFallbacks(stripMarkdownFences(out));
  }

  // POST /latex/generate-latex
  router.post("/generate-latex", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt ?? "").trim();
      const templateId = String(req.body?.templateId ?? "2cols_portrait").trim();
      const baseLatexTrimmed = String(req.body?.baseLatex ?? "");
      const hasBaseLatex = baseLatexTrimmed.trim().length > 0;

      if (!prompt) return res.status(400).json({ ok: false, error: "Missing 'prompt'." });

      const { source: templateSource } = loadTemplateOrThrow(deps.templateDirAbs, templateId);
      const placeholder = findPlaceholder(templateSource);
      const wantOnlyBody = !hasBaseLatex && Boolean(placeholder);

      const generated = await generateLatexFromPrompt({
        prompt,
        templateId,
        templateSource,
        wantOnlyBody,
        baseLatex: hasBaseLatex ? baseLatexTrimmed.trim() : undefined,
      });

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