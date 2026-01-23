// app-api/src/server.ts
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);
const app = express();

// -------------------------
// Env / Config
// -------------------------
const PORT = Number(process.env.PORT ?? 4000);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
if (!OPENAI_API_KEY) {
  console.warn("[WARN] OPENAI_API_KEY is not set. /generate-latex and /fix-latex will fail.");
}

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const TEMPLATE_DIR = process.env.TEMPLATE_DIR
  ? path.resolve(process.env.TEMPLATE_DIR)
  : path.join(process.cwd(), "templates"); // app-api/templates

const MAX_JSON_SIZE = process.env.MAX_JSON_SIZE ?? "6mb";
const LATEX_TIMEOUT_MS = Number(process.env.LATEX_TIMEOUT_MS ?? 30000);

const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS ?? "").trim();
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

// -------------------------
// Middleware
// -------------------------
app.use(
  cors({
    origin: (origin, cb) => {
      if (!allowedOrigins) return cb(null, true); // dev: allow all
      if (!origin) return cb(null, true); // curl/server-to-server
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: MAX_JSON_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_JSON_SIZE }));

// -------------------------
// Helpers: templates
// -------------------------
type TemplateIndex = Record<string, string>; // templateId -> absPath

function buildTemplateIndex(dirAbs: string): TemplateIndex {
  const index: TemplateIndex = {};
  if (!fs.existsSync(dirAbs)) return index;
  const files = fs.readdirSync(dirAbs);
  for (const f of files) {
    if (!f.endsWith(".tex")) continue;
    const id = path.basename(f, ".tex");
    index[id] = path.join(dirAbs, f);
  }
  return index;
}

function loadTemplateOrThrow(templateId: string): { id: string; source: string; absPath: string } {
  const idx = buildTemplateIndex(TEMPLATE_DIR);
  const absPath = idx[templateId];
  if (!absPath) {
    const available = Object.keys(idx).sort();
    const msg =
      `[TEMPLATE_NOT_FOUND] templateId="${templateId}" not found.\n` +
      `TEMPLATE_DIR=${TEMPLATE_DIR}\n` +
      `Available: ${available.length ? available.join(", ") : "(none)"}`;
    const err = new Error(msg);
    (err as any).statusCode = 400;
    throw err;
  }
  const source = fs.readFileSync(absPath, "utf8");
  return { id: templateId, source, absPath };
}

// Placeholder heurística
const CONTENT_PLACEHOLDERS = ["{{CONTENT}}", "%%CONTENT%%", "%CONTENT%", "<<CONTENT>>"];
function findPlaceholder(templateSrc: string): string | null {
  for (const p of CONTENT_PLACEHOLDERS) if (templateSrc.includes(p)) return p;
  return null;
}

// -------------------------
// Helpers: LaTeX compile
// -------------------------
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "which", [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function trimHugeLog(s: string, max = 60000) {
  if (s.length <= max) return s;
  return s.slice(-max);
}

function makeHttpError(message: string, statusCode: number, log?: string, code?: string) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (log) err.log = log;
  if (code) err.code = code;
  return err as Error;
}

function extractExecOutput(e: any): { stdout?: string; stderr?: string } {
  return {
    stdout: typeof e?.stdout === "string" ? e.stdout : undefined,
    stderr: typeof e?.stderr === "string" ? e.stderr : undefined,
  };
}

async function compileLatexToPdf(latexSource: string): Promise<{ pdf: Buffer; log: string }> {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "betternotes-tex-"));
  const texPath = path.join(workDir, "main.tex");
  const pdfPath = path.join(workDir, "main.pdf");
  const texLogPath = path.join(workDir, "main.log");

  await fs.promises.writeFile(texPath, latexSource, "utf8");

  let log = "";
  try {
    const hasLatexmk = await commandExists("latexmk");

    if (hasLatexmk) {
      try {
        const { stdout, stderr } = await execFileAsync(
          "latexmk",
          [
            "-pdf",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-file-line-error",
            "main.tex",
          ],
          { cwd: workDir, timeout: LATEX_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }
        );
        log += stdout ?? "";
        log += stderr ?? "";
      } catch (e: any) {
        const extra = extractExecOutput(e);
        log += extra.stdout ?? "";
        log += extra.stderr ?? "";
        // bubble up; we'll format a useful HTTP error below if PDF is missing
      }
    } else {
      const hasPdflatex = await commandExists("pdflatex");
      if (!hasPdflatex) {
        throw makeHttpError(
          "[LATEX_TOOLING_MISSING] Neither latexmk nor pdflatex found in PATH. Install TeX Live or use the Docker image.",
          500,
          undefined,
          "LATEX_TOOLING_MISSING"
        );
      }

      // 2 pasadas
      for (let i = 0; i < 2; i++) {
        try {
          const { stdout, stderr } = await execFileAsync(
            "pdflatex",
            ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"],
            { cwd: workDir, timeout: LATEX_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }
          );
          log += stdout ?? "";
          log += stderr ?? "";
        } catch (e: any) {
          const extra = extractExecOutput(e);
          log += extra.stdout ?? "";
          log += extra.stderr ?? "";
          // stop further passes
          break;
        }
      }
    }

    if (!fs.existsSync(pdfPath)) {
      // Añade main.log si existe
      if (fs.existsSync(texLogPath)) {
        log += "\n\n----- main.log -----\n";
        log += await fs.promises.readFile(texLogPath, "utf8");
      }

      const trimmed = trimHugeLog(log);
      // Distinguish timeouts a bit better
      const isTimeout = trimmed.includes("Timeout") || trimmed.includes("ETIMEDOUT");
      throw makeHttpError(
        "LaTeX compilation failed.",
        isTimeout ? 408 : 422,
        trimmed,
        isTimeout ? "LATEX_TIMEOUT" : "LATEX_COMPILE_FAILED"
      );
    }

    const pdf = await fs.promises.readFile(pdfPath);

    // Opcional: adjunta main.log en éxito también (útil para debug)
    if (fs.existsSync(texLogPath)) {
      const mainLog = await fs.promises.readFile(texLogPath, "utf8");
      log += "\n\n----- main.log -----\n" + mainLog;
    }

    return { pdf, log: trimHugeLog(log) };
  } finally {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch {}
  }
}

// -------------------------
// Helpers: OpenAI
// -------------------------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function stripMarkdownFences(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    const lines = t.split("\n");
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    return lines.join("\n").trim();
  }
  return t;
}

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

  // Build a message list so we can support iterative editing when baseLatex is provided.
  const messages: { role: "system" | "assistant" | "user"; content: string }[] = [
    { role: "system", content: system },
  ];

  // If we have a base LaTeX, we treat this as an edit pass and ask for a FULL updated document.
  if (typeof baseLatex === "string" && baseLatex.trim()) {
    messages.push({ role: "assistant", content: baseLatex });
    messages.push({
      role: "user",
      content: `Revise the previous LaTeX above according to: ${prompt}. Return the full updated document.`,
    });
  } else if (wantOnlyBody) {
    // Template has a known placeholder; we only want body content.
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
    // Generate a full document (no placeholder flow).
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

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages,
  });

  const out = resp.choices?.[0]?.message?.content ?? "";
  return stripMarkdownFences(out);
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

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const out = resp.choices?.[0]?.message?.content ?? "";
  return stripMarkdownFences(out);
}

// -------------------------
// Routes
// -------------------------
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "betternotes-app-api",
    port: PORT,
    templateDir: TEMPLATE_DIR,
    hasOpenAIKey: Boolean(OPENAI_API_KEY),
  });
});

app.get("/templates", (_req, res) => {
  const idx = buildTemplateIndex(TEMPLATE_DIR);
  res.json({ ok: true, templateDir: TEMPLATE_DIR, templates: Object.keys(idx).sort() });
});

// POST /generate-latex
// body: { prompt: string, templateId?: string, baseLatex?: string }
// resp: { ok, latex, usedTemplateId }
app.post("/generate-latex", async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt ?? "").trim();
    const templateId = String(req.body?.templateId ?? "2cols_portrait").trim();
    const baseLatexTrimmed = String(req.body?.baseLatex ?? "");
    const hasBaseLatex = baseLatexTrimmed.trim().length > 0;

    if (!prompt) return res.status(400).json({ ok: false, error: "Missing 'prompt'." });

    const { source: templateSource } = loadTemplateOrThrow(templateId);
    const placeholder = findPlaceholder(templateSource);

    // If baseLatex is provided, we are doing an edit pass and expect a FULL updated document.
    // Only use the template placeholder flow when we are NOT editing an existing document.
    const wantOnlyBody = !hasBaseLatex && Boolean(placeholder);

    const generated = await generateLatexFromPrompt({
      prompt,
      templateId,
      templateSource,
      wantOnlyBody,
      baseLatex: hasBaseLatex ? baseLatexTrimmed.trim() : undefined,
    });

    const latex = wantOnlyBody && placeholder ? templateSource.replace(placeholder, generated) : generated;

    return res.json({ ok: true, latex, usedTemplateId: templateId });
  } catch (e) {
    next(e);
  }
});

// POST /compile
// body: { latex: string }
// success: application/pdf (binary)
// error:  { ok:false, error:string, log?:string }
app.post("/compile", async (req, res, next) => {
  try {
    const latex = String(req.body?.latex ?? "");
    if (!latex.trim()) return res.status(400).json({ ok: false, error: "Missing 'latex'." });

    const { pdf, log } = await compileLatexToPdf(latex);

    // Importante: tu frontend hace arrayBuffer(), así que aquí devolvemos PDF binario
    res.setHeader("Content-Type", "application/pdf");
    // Si quieres, puedes mandar el log en header (recortado) para debug:
    // res.setHeader("X-Latex-Log", Buffer.from(log).toString("base64"));
    return res.status(200).send(pdf);
  } catch (e: any) {
    const status = Number(e?.statusCode ?? 400);
    const log = typeof e?.log === "string" ? trimHugeLog(e.log) : undefined;
    const code = typeof e?.code === "string" ? e.code : undefined;
    const message = typeof e?.message === "string" ? e.message : "Compilation failed.";

    return res.status(status).json({
      ok: false,
      error: message,
      code,
      log,
    });
  }
});

// POST /fix-latex
// body: { latex: string, log: string }
// resp: { ok:true, fixedLatex }
app.post("/fix-latex", async (req, res, next) => {
  try {
    const latex = String(req.body?.latex ?? "");
    const log = String(req.body?.log ?? "");
    if (!latex.trim()) return res.status(400).json({ ok: false, error: "Missing 'latex'." });
    if (!log.trim()) return res.status(400).json({ ok: false, error: "Missing 'log'." });

    const fixedLatex = await fixLatexWithLog({ latex, log });
    if (!fixedLatex.trim()) return res.status(500).json({ ok: false, error: "Fix returned empty LaTeX." });

    return res.json({ ok: true, fixedLatex });
  } catch (e) {
    next(e);
  }
});

// -------------------------
// Error handler
// -------------------------
app.use((err: any, _req: any, res: any, _next: any) => {
  const status = Number(err?.statusCode ?? 500);
  const message = err?.message ? String(err.message) : "Unknown error";
  if (status >= 500) console.error("[ERROR]", err);
  res.status(status).json({ ok: false, error: message });
});

// -------------------------
// Start
// -------------------------
app.listen(PORT, () => {
  console.log(`✅ app-api listening on http://localhost:${PORT}`);
  console.log(`📁 TEMPLATE_DIR: ${TEMPLATE_DIR}`);
});
