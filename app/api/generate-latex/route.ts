import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // important (OpenAI SDK runs server-side)

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEMPLATE_FILES: Record<string, string> = {
  landscape_3col_maths: "public/templates/landscape_3col_maths.tex",
  "2cols_portrait": "public/templates/2cols_portrait.tex",
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
  // If model returns ```latex ... ``` or ``` ... ```
  const fenced = raw.match(/```(?:latex)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

export async function POST(req: Request) {
  try {
    const { prompt, templateId } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing 'prompt' string." }, { status: 400 });
    }

    const templateSource = typeof templateId === "string" ? loadTemplateSource(templateId) : null;
    const systemBase = `
You generate ONLY a complete LaTeX document that compiles.
Return ONLY LaTeX (no explanations).
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

    // Responses API is the recommended primitive in openai-node.  [oai_citation:1‡GitHub](https://github.com/openai/openai-node?utm_source=chatgpt.com)
    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });

    // openai-node returns output_text helper on response objects in many examples/docs.  [oai_citation:2‡GitHub](https://github.com/openai/openai-node?utm_source=chatgpt.com)
    const raw = (resp as any).output_text ?? "";
    const latex = extractLatex(raw);

    if (!latex) {
      return NextResponse.json({ error: "Empty LaTeX output." }, { status: 500 });
    }

    return NextResponse.json({ latex });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
