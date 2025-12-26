import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject({ error, stdout, stderr });
      else resolve({ stdout, stderr });
    });
  });
}

export async function POST(req: Request) {
  try {
    const { latex } = await req.json();

    if (typeof latex !== "string" || latex.trim().length === 0) {
      return new Response(JSON.stringify({ error: "The 'latex' field is empty." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "betternotes-compile-"));
    fs.writeFileSync(path.join(jobDir, "main.tex"), latex, "utf8");

    // Compile inside Docker (sandbox-ish). No shell escape.
    const args = [
      "run",
      "--rm",
      "--cpus=1",
      "--memory=1g",
      "-v",
      `${jobDir}:/work`,
      "-w",
      "/work",
      "texlive/texlive",
      "latexmk",
      "-pdf",
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-no-shell-escape",
      "main.tex",
    ];

    try {
      await run("docker", args);
    } catch (e: any) {
      const log = (e?.stderr || e?.stdout || "").toString();
      return new Response(JSON.stringify({ error: "LaTeX compilation failed.", log }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pdfPath = path.join(jobDir, "main.pdf");
    if (!fs.existsSync(pdfPath)) {
      return new Response(JSON.stringify({ error: "main.pdf was not generated." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pdf = fs.readFileSync(pdfPath);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="notes.pdf"',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}