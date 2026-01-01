import "dotenv/config";
import express from "express";
import type { Response } from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import OpenAI from "openai";

const app = express();

const PORT = Number(process.env.PORT || 4000);

// En dev: http://localhost:3000 (Next)
// En prod: tu dominio de web (Vercel / GitHub Pages)
const rawAllowedOrigins = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || "http://localhost:3000";
const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes("*")) return callback(null, true);
      return callback(null, allowedOrigins.includes(origin));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEMPLATE_FILES: Record<string, string> = {
  landscape_3col_maths: "templates/landscape_3col_maths.tex",
  "2cols_portrait": "templates/2cols_portrait.tex",
};

function loadTemplateSource(templateId?: string): string | null {
  if (!templateId) return null;
  const relPath = TEMPLATE_FILES[templateId];
  if (!relPath) return null;
  const absPath = path.join(process.cwd(), relPath);
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function extractLatex(raw: string) {
  const fenced = raw.match(/```(?:latex)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

function ensureOpenAIKey(res: Response) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set." });
    return false;
  }
  return true;
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject({ error, stdout, stderr });
        else resolve({ stdout, stderr });
      }
    );
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// POST /generate-latex  { prompt, templateId?, baseLatex? } -> { latex }
app.post("/generate-latex", async (req, res) => {
  if (!ensureOpenAIKey(res)) return;

  try {
    const { prompt, templateId, baseLatex } = req.body ?? {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing 'prompt' string." });
    }

    const templateSource =
      typeof templateId === "string" ? loadTemplateSource(templateId) : null;
    const systemBase = `
You generate ONLY a complete LaTeX document that compiles.
Return ONLY LaTeX (no explanations, no Markdown fences).
`.trim();
    const system = templateSource
      ? [
          systemBase,
          "Use the following LaTeX template as the base.",
          "Preserve the preamble, macros, and layout commands.",
          "Replace the document body content with material that satisfies the user request while keeping the overall structure.",
          "Template:",
          templateSource,
        ].join("\n")
      : [
          systemBase,
          "Use article class.",
          "Include: \\usepackage{amsmath, amssymb, geometry} and margin=1in.",
          "If unsure, keep it minimal and compilable.",
        ].join("\n");

    const messages: { role: "system" | "assistant" | "user"; content: string }[] = [
      { role: "system", content: system },
    ];

    if (typeof baseLatex === "string" && baseLatex.trim()) {
      messages.push({ role: "assistant", content: baseLatex });
      messages.push({
        role: "user",
        content: `Revise the previous LaTeX above according to: ${prompt}. Return the full updated document.`,
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: messages,
    });

    const raw = (resp as any).output_text ?? "";
    const latex = extractLatex(raw);
    if (!latex) return res.status(500).json({ error: "Empty LaTeX output." });

    return res.json({ latex });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

// POST /fix-latex  { latex, log } -> { fixedLatex }
app.post("/fix-latex", async (req, res) => {
  if (!ensureOpenAIKey(res)) return;

  try {
    const { latex, log } = req.body ?? {};
    if (!latex || typeof latex !== "string") {
      return res.status(400).json({ error: "Missing 'latex' string." });
    }

    const system = `
You fix LaTeX compilation errors.
Return ONLY the full corrected LaTeX document (no explanations, no Markdown fences).
`.trim();

    const userParts = [
      "LaTeX input:",
      latex,
      "",
      "Compiler log:",
      typeof log === "string" && log.trim() ? log : "(no log provided)",
      "",
      "Fix the errors and return the full LaTeX document.",
    ];

    const resp = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: userParts.join("\n") },
      ],
    });

    const raw = (resp as any).output_text ?? "";
    const fixedLatex = extractLatex(raw);
    if (!fixedLatex) return res.status(500).json({ error: "Empty LaTeX output." });

    return res.json({ fixedLatex });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

// POST /compile  { latex: "..." }  -> application/pdf
app.post("/compile", async (req, res) => {
  try {
    const latex = req.body?.latex;

    if (typeof latex !== "string" || latex.trim().length === 0) {
      return res.status(400).json({ error: "The 'latex' field is empty." });
    }

    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "betternotes-compile-"));
    fs.writeFileSync(path.join(jobDir, "main.tex"), latex, "utf8");

    try {
      await run("latexmk", [
        "-pdf",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        "main.tex"
      ], jobDir);
    } catch (e: any) {
      const log = (e?.stderr || e?.stdout || "").toString();
      return res.status(400).json({ error: "LaTeX compilation failed.", log });
    }

    const pdfPath = path.join(jobDir, "main.pdf");
    if (!fs.existsSync(pdfPath)) {
      return res.status(400).json({ error: "main.pdf was not generated." });
    }

    const pdf = fs.readFileSync(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="notes.pdf"');
    return res.status(200).send(pdf);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
});
