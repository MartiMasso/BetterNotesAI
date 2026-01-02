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

// --- Config ---
const PORT = Number(process.env.PORT || 4000);

const rawAllowedOrigins =
  process.env.CORS_ORIGIN ||
  process.env.ALLOWED_ORIGIN ||
  "http://localhost:3000";

const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

// --- Middleware ---
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

// --- OpenAI Setup ---
function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getModel() {
  // Cambiado a gpt-4o-mini porque gpt-4.1-mini no existe
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

// --- Templates ---
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
    execFile(
      cmd,
      args,
      { cwd, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject({ error, stdout, stderr });
        else resolve({ stdout, stderr });
      }
    );
  });
}

function sanitizeLatexUnicode(input: string): string {
  let s = input;
  const replacements: Array<[RegExp, string]> = [
    [/β/g, "\\beta "], [/α/g, "\\alpha "], [/γ/g, "\\gamma "], [/δ/g, "\\delta "],
    [/ε/g, "\\epsilon "], [/θ/g, "\\theta "], [/λ/g, "\\lambda "], [/μ/g, "\\mu "],
    [/ν/g, "\\nu "], [/π/g, "\\pi "], [/ρ/g, "\\rho "], [/σ/g, "\\sigma "],
    [/τ/g, "\\tau "], [/φ/g, "\\phi "], [/ω/g, "\\omega "], [/∞/g, "\\infty "],
    [/∂/g, "\\partial "], [/∇/g, "\\nabla "], [/→/g, "\\to "], [/≤/g, "\\le "],
    [/≥/g, "\\ge "], [/≠/g, "\\neq "], [/±/g, "\\pm "]
  ];
  for (const [re, rep] of replacements) s = s.replace(re, rep);
  return s.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

// --- Routes ---
app.get("/health", (_req, res) => {
  res.json({ ok: true, port: PORT, status: "alive" });
});

// GENERATE LATEX
app.post("/generate-latex", async (req, res) => {
  try {
    const { prompt, templateId, baseLatex } = req.body;
    const openai = getOpenAIClient();
    
    const templateSource = loadTemplateSource(templateId);
    const system = templateSource 
      ? `Use this template: ${templateSource}` 
      : "Use article class with amssymb and amsmath.";

    const messages: any = [{ role: "system", content: system }];
    if (baseLatex) messages.push({ role: "assistant", content: baseLatex });
    messages.push({ role: "user", content: prompt });

    // CORRECCIÓN AQUÍ: Sintaxis oficial de OpenAI Chat Completions
    const resp = await openai.chat.completions.create({
      model: getModel(),
      messages: messages,
    });

    const raw = resp.choices[0]?.message?.content ?? "";
    const latex = extractLatex(raw);

    res.json({ latex: sanitizeLatexUnicode(latex) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// COMPILE PDF (Esto sustituye al route.ts de compile que no tenías)
app.post("/compile", async (req, res) => {
  try {
    const { latex: latexRaw } = req.body;
    const latex = sanitizeLatexUnicode(latexRaw);
    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "compile-"));
    const texPath = path.join(jobDir, "main.tex");
    
    fs.writeFileSync(texPath, latex, "utf8");

    await run("latexmk", ["-lualatex", "-interaction=nonstopmode", "main.tex"], jobDir);

    const pdfPath = path.join(jobDir, "main.pdf");
    const pdf = fs.readFileSync(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.send(pdf);
  } catch (err: any) {
    res.status(400).json({ error: "Compilation failed", log: err.stdout });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API ONLINE en puerto ${PORT}`);
});
