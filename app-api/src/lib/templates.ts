// app-api/src/lib/templates.ts
import fs from "fs";
import path from "path";

export type TemplateIndex = Record<string, string>; // templateId -> absPath

export const CONTENT_PLACEHOLDERS = ["{{CONTENT}}", "%%CONTENT%%", "%CONTENT%", "<<CONTENT>>"] as const;

export function buildTemplateIndex(dirAbs: string): TemplateIndex {
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

export function loadTemplateOrThrow(templateDirAbs: string, templateId: string): { id: string; source: string; absPath: string } {
  const idx = buildTemplateIndex(templateDirAbs);
  const absPath = idx[templateId];

  if (!absPath) {
    const available = Object.keys(idx).sort();
    const msg =
      `[TEMPLATE_NOT_FOUND] templateId="${templateId}" not found.\n` +
      `TEMPLATE_DIR=${templateDirAbs}\n` +
      `Available: ${available.length ? available.join(", ") : "(none)"}`;
    const err: any = new Error(msg);
    err.statusCode = 400;
    throw err;
  }

  const source = fs.readFileSync(absPath, "utf8");
  return { id: templateId, source, absPath };
}

export function findPlaceholder(templateSrc: string): string | null {
  for (const p of CONTENT_PLACEHOLDERS) if (templateSrc.includes(p)) return p;
  return null;
}