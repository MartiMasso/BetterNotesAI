// app-api/src/lib/latex.ts
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { extractExecOutput, makeHttpError, trimHugeLog } from "./errors";

const execFileAsync = promisify(execFile);

/* -------------------------
   tooling helpers
------------------------- */

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "which", [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------
   fallbacks (compilation-safety)
------------------------- */

export function stripMarkdownFences(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    const lines = t.split("\n");
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    return lines.join("\n").trim();
  }
  return t;
}

export function injectTheoremFallbacks(latex: string): string {
  // IMPORTANT: we do NOT try to detect "theorem-style already exists" perfectly;
  // we just ensure required environments exist *somehow*.
  const envs = [
    { name: "definition", title: "Definition" },
    { name: "theorem", title: "Theorem" },
    { name: "lemma", title: "Lemma" },
    { name: "proposition", title: "Proposition" },
    { name: "corollary", title: "Corollary" },
    { name: "example", title: "Example" },
    { name: "remark", title: "Remark" },
    { name: "obs", title: "Observation" },
  ];

  // Check which environments are USED in the document
  // Regex matches \begin{envname} with optional whitespace
  const needs = envs.filter((env) => {
    const pattern = new RegExp(`\\\\begin\\s*\\{${env.name}\\}`);
    return pattern.test(latex);
  });
  if (!needs.length) return latex;

  // Check which environments are already DEFINED via \newtheorem{envname}
  const alreadyDefined = new Set<string>();
  for (const env of needs) {
    const defPattern = new RegExp(`\\\\newtheorem\\s*\\{${env.name}\\}`);
    if (defPattern.test(latex)) {
      alreadyDefined.add(env.name);
    }
  }

  // Filter to only environments that need to be injected
  const toInject = needs.filter((env) => !alreadyDefined.has(env.name));
  if (!toInject.length) return latex;

  // Find \begin{document}
  const beginDocMatch = latex.match(/\\begin\s*\{document\}/);
  if (!beginDocMatch || beginDocMatch.index === undefined) return latex;

  // Check if amsthm is already loaded (handles \usepackage{amsthm} and \usepackage{amsmath,amsthm,...})
  const hasAmsthm = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*amsthm[^}]*\}/.test(latex);

  // Build injection block with proper LaTeX formatting
  const injectionLines: string[] = [];
  injectionLines.push("% BN_THEOREM_FALLBACKS");

  if (!hasAmsthm) {
    injectionLines.push("\\usepackage{amsthm}");
  }

  // Simple direct \newtheorem definitions
  // We've already filtered out environments that are already defined
  for (const env of toInject) {
    injectionLines.push(`\\newtheorem{${env.name}}{${env.title}}`);
  }

  const insertAt = beginDocMatch.index;
  return `${latex.slice(0, insertAt)}${injectionLines.join("\n")}\n\n${latex.slice(insertAt)}`;
}

export function injectCommonMathFallbacks(latex: string): string {
  // Find \begin{document}
  const beginDocMatch = latex.match(/\\begin\s*\{document\}/);
  if (!beginDocMatch || beginDocMatch.index === undefined) return latex;

  const marker = "% BN_MATH_FALLBACKS";
  if (latex.includes(marker)) return latex;

  // Check for usage of custom math commands
  const wantsAbs = /\\abs\s*\{/.test(latex);
  const wantsNorm = /\\norm\s*\{/.test(latex);
  const wantsColoneqq = /\\coloneqq\b/.test(latex);
  const wantsGenerated = /\\generated\s*\{/.test(latex);

  const defs: string[] = [marker];
  if (wantsAbs) defs.push("\\providecommand{\\abs}[1]{\\left|#1\\right|}");
  if (wantsNorm) defs.push("\\providecommand{\\norm}[1]{\\left\\|#1\\right\\|}");
  if (wantsColoneqq) defs.push("\\providecommand{\\coloneqq}{\\mathrel{:=}}");
  if (wantsGenerated) defs.push("\\providecommand{\\generated}[1]{(\\min\\{#1\\},\\max\\{#1\\})}");

  if (defs.length === 1) return latex;

  const injection = `${defs.join("\n")}\n`;
  const insertAt = beginDocMatch.index;
  return `${latex.slice(0, insertAt)}${injection}\n${latex.slice(insertAt)}`;
}

export function applyLatexFallbacks(latex: string): string {
  return injectCommonMathFallbacks(injectTheoremFallbacks(latex));
}

/* -------------------------
   compile
------------------------- */

export async function compileLatexToPdf(
  latexSourceRaw: string,
  opts: { timeoutMs: number }
): Promise<{ pdf: Buffer; log: string; latexPatched: string }> {
  const latexSource = applyLatexFallbacks(latexSourceRaw);

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
          ["-pdf", "-bibtex-", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"],
          { cwd: workDir, timeout: opts.timeoutMs, maxBuffer: 20 * 1024 * 1024 }
        );
        log += stdout ?? "";
        log += stderr ?? "";
      } catch (e: any) {
        const extra = extractExecOutput(e);
        log += extra.stdout ?? "";
        log += extra.stderr ?? "";
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

      for (let i = 0; i < 2; i++) {
        try {
          const { stdout, stderr } = await execFileAsync(
            "pdflatex",
            ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"],
            { cwd: workDir, timeout: opts.timeoutMs, maxBuffer: 20 * 1024 * 1024 }
          );
          log += stdout ?? "";
          log += stderr ?? "";
        } catch (e: any) {
          const extra = extractExecOutput(e);
          log += extra.stdout ?? "";
          log += extra.stderr ?? "";
          break;
        }
      }
    }

    if (!fs.existsSync(pdfPath)) {
      if (fs.existsSync(texLogPath)) {
        log += "\n\n----- main.log -----\n";
        log += await fs.promises.readFile(texLogPath, "utf8");
      }

      const trimmed = trimHugeLog(log);
      const isTimeout = trimmed.includes("Timeout") || trimmed.includes("ETIMEDOUT");
      throw makeHttpError(
        "LaTeX compilation failed.",
        isTimeout ? 408 : 422,
        trimmed,
        isTimeout ? "LATEX_TIMEOUT" : "LATEX_COMPILE_FAILED"
      );
    }

    const pdf = await fs.promises.readFile(pdfPath);

    if (fs.existsSync(texLogPath)) {
      const mainLog = await fs.promises.readFile(texLogPath, "utf8");
      log += "\n\n----- main.log -----\n" + mainLog;
    }

    return { pdf, log: trimHugeLog(log), latexPatched: latexSource };
  } finally {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch { }
  }
}


/* -------------------------
   multi-file project compile
------------------------- */

export interface ProjectFile {
  path: string;   // e.g. "main.tex", "chapters/ch1.tex", "figures/plot.png"
  content: string; // text content OR base64 for binary
  isBinary?: boolean;
}

/**
 * Compile a multi-file LaTeX project.
 * Writes all files to a temp directory preserving subdirectory structure,
 * then runs latexmk/pdflatex on the specified main file.
 */
export async function compileMultiFileProject(
  files: ProjectFile[],
  mainFile: string,
  opts: { timeoutMs: number }
): Promise<{ pdf: Buffer; log: string }> {
  if (!files.length) {
    throw makeHttpError("No files provided.", 400, undefined, "NO_FILES");
  }
  if (!files.some((f) => f.path === mainFile)) {
    throw makeHttpError(
      `Main file "${mainFile}" not found in provided files.`,
      400,
      undefined,
      "MAIN_FILE_NOT_FOUND"
    );
  }

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "betternotes-project-"));
  const pdfName = mainFile.replace(/\.tex$/, ".pdf");
  const logName = mainFile.replace(/\.tex$/, ".log");

  try {
    // Write all files to the temp directory
    for (const file of files) {
      const absPath = path.join(workDir, file.path);
      const dir = path.dirname(absPath);
      await fs.promises.mkdir(dir, { recursive: true });

      if (file.isBinary) {
        // Binary files are base64-encoded
        const buf = Buffer.from(file.content, "base64");
        await fs.promises.writeFile(absPath, buf);
      } else {
        // Text files — apply fallbacks only to .tex files
        let content = file.content;
        if (file.path.endsWith(".tex")) {
          content = applyLatexFallbacks(content);
        }
        await fs.promises.writeFile(absPath, content, "utf8");
      }
    }

    // Compile
    let log = "";
    const hasLatexmk = await commandExists("latexmk");
    const mainDir = path.dirname(path.join(workDir, mainFile));
    const mainBasename = path.basename(mainFile);

    if (hasLatexmk) {
      try {
        const { stdout, stderr } = await execFileAsync(
          "latexmk",
          ["-pdf", "-bibtex-", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", mainBasename],
          { cwd: mainDir, timeout: opts.timeoutMs, maxBuffer: 20 * 1024 * 1024 }
        );
        log += stdout ?? "";
        log += stderr ?? "";
      } catch (e: any) {
        const extra = extractExecOutput(e);
        log += extra.stdout ?? "";
        log += extra.stderr ?? "";
      }
    } else {
      const hasPdflatex = await commandExists("pdflatex");
      if (!hasPdflatex) {
        throw makeHttpError(
          "[LATEX_TOOLING_MISSING] Neither latexmk nor pdflatex found.",
          500,
          undefined,
          "LATEX_TOOLING_MISSING"
        );
      }

      for (let i = 0; i < 2; i++) {
        try {
          const { stdout, stderr } = await execFileAsync(
            "pdflatex",
            ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", mainBasename],
            { cwd: mainDir, timeout: opts.timeoutMs, maxBuffer: 20 * 1024 * 1024 }
          );
          log += stdout ?? "";
          log += stderr ?? "";
        } catch (e: any) {
          const extra = extractExecOutput(e);
          log += extra.stdout ?? "";
          log += extra.stderr ?? "";
          break;
        }
      }
    }

    const pdfPath = path.join(mainDir, path.basename(pdfName));
    const texLogPath = path.join(mainDir, path.basename(logName));

    if (!fs.existsSync(pdfPath)) {
      if (fs.existsSync(texLogPath)) {
        log += "\n\n----- main.log -----\n";
        log += await fs.promises.readFile(texLogPath, "utf8");
      }
      const trimmed = trimHugeLog(log);
      const isTimeout = trimmed.includes("Timeout") || trimmed.includes("ETIMEDOUT");
      throw makeHttpError(
        "Multi-file LaTeX compilation failed.",
        isTimeout ? 408 : 422,
        trimmed,
        isTimeout ? "LATEX_TIMEOUT" : "LATEX_COMPILE_FAILED"
      );
    }

    const pdf = await fs.promises.readFile(pdfPath);

    if (fs.existsSync(texLogPath)) {
      const mainLog = await fs.promises.readFile(texLogPath, "utf8");
      log += "\n\n----- main.log -----\n" + mainLog;
    }

    return { pdf, log: trimHugeLog(log) };
  } finally {
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    } catch { }
  }
}