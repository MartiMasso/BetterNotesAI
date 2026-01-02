// app-api/src/server.ts
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
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 4000);

// CORS
const rawAllowedOrigins =
  process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || "http://localhost:3000";

const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // requests without Origin (curl/healthchecks) should pass
      if (!origin) return callback(null, true);

      // allow all
      if (allowedOrigins.includes("*")) return callback(null, true);

      // exact match
      const ok = allowedOrigins.includes(origin);
      return callback(null, ok);
    },
  })
);

app.use(express.json({ limit: "2mb" }));

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

// OpenAI
function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}
function ensureOpenAIKey(res: Response) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set." });
    return false;
  }
  return true;
}

// Templates
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

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject({ error, stdout, stderr });
      else resolve({ stdout, stderr });
    });
  });
}

function sanitizeLatexUnicode(input: string): string {
  let s = input;

  const replacements: Array<[RegExp, string]> = [
    [/β/g, "\\beta "],
    [/α/g, "\\alpha "],
    [/γ/g, "\\gamma "],
    [/δ/g, "\\delta "],
    [/ε/g, "\\epsilon "],
    [/θ/g, "\\theta "],
    [/λ/g, "\\lambda "],
    [/μ/g, "\\mu "],
    [/ν/g, "\\nu "],
    [/π/g, "\\pi "],
    [/ρ/g, "\\rho "],
    [/σ/g, "\\sigma "],
    [/τ/g, "\\tau "],
    [/φ/g, "\\phi "],
    [/ω/g, "\\omega "],
    [/Γ/g, "\\Gamma "],
    [/Δ/g, "\\Delta "],
    [/Θ/g, "\\Theta "],
    [/Λ/g, "\\Lambda "],
    [/Π/g, "\\Pi "],
    [/Σ/g, "\\Sigma "],
    [/Φ/g, "\\Phi "],
    [/Ω/g, "\\Omega "],
    [/∞/g, "\\infty "],
    [/∂/g, "\\partial "],
    [/∇/g, "\\nabla "],
    [/→/g, "\\to "],
    [/⇒/g, "\\Rightarrow "],
    [/⇔/g, "\\Leftrightarrow "],
    [/≤/g, "\\le "],
    [/≥/g, "\\ge "],
    [/≠/g, "\\neq "],
    [/±/g, "\\pm "],
    [/×/g, "\\times "],
    [/⋅/g, "\\cdot "],
    [/−/g, "-"],
    [/–/g, "-"],
    [/“/g, "``"],
    [/”/g, "''"],
    [/’/g, "'"],
    [/…/g, "\\ldots "],
  ];

  for (const [re, rep] of replacements) s = s.replace(re, rep);
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  return s;
}

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, port: PORT });
});

// Generate LaTeX
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
Avoid raw Unicode math symbols (e.g., β, α, ∂, ≤, ≥). Use LaTeX macros instead.
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

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
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

    const openai = getOpenAIClient();
    const resp = await openai.chat.completions.create({
      model: getModel(),
      messages,
    });

    const raw = resp.choices[0]?.message?.content ?? "";
    const latex = extractLatex(raw);
    if (!latex) return res.status(500).json({ error: "Empty LaTeX output." });

    return res.json({ latex: sanitizeLatexUnicode(latex) });
  } catch (err: any) {
    console.error("generate-latex error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

// Compile PDF
app.post("/compile", async (req, res) => {
  try {
    const latexRaw = req.body?.latex;

    if (typeof latexRaw !== "string" || latexRaw.trim().length === 0) {
      return res.status(400).json({ error: "The 'latex' field is empty." });
    }

    const latex = sanitizeLatexUnicode(latexRaw);

    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "betternotes-compile-"));
    fs.writeFileSync(path.join(jobDir, "main.tex"), latex, "utf8");

    try {
      await run(
        "latexmk",
        [
          "-lualatex",
          "-interaction=nonstopmode",
          "-halt-on-error",
          "-file-line-error",
          "-no-shell-escape",
          "main.tex",
        ],
        jobDir
      );
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
    console.error("compile error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on port ${PORT}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
});
