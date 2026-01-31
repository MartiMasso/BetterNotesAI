// app-api/src/server.ts
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import OpenAI from "openai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
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
// Stripe / Supabase (server-only)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
if (!STRIPE_SECRET_KEY) {
    console.warn("[WARN] STRIPE_SECRET_KEY is not set. Stripe routes will fail.");
}
if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("[WARN] STRIPE_WEBHOOK_SECRET is not set. /stripe/webhook signature verification will fail.");
}
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[WARN] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Stripe webhook DB sync will fail.");
}
// -------------------------
// Clients
// -------------------------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY, {
    // If this apiVersion causes issues, remove this line.
    // apiVersion: "2025-01-27.acacia",
    })
    : null;
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;
// -------------------------
// Middleware
// -------------------------
app.use(cors({
    origin: (origin, cb) => {
        if (!allowedOrigins)
            return cb(null, true); // dev: allow all
        if (!origin)
            return cb(null, true); // curl/server-to-server
        return allowedOrigins.includes(origin)
            ? cb(null, true)
            : cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));
// IMPORTANT:
// We keep express.json globally for your existing endpoints.
// For Stripe webhook we override with express.raw() ONLY on that route.
app.use(express.json({ limit: MAX_JSON_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_JSON_SIZE }));
function buildTemplateIndex(dirAbs) {
    const index = {};
    if (!fs.existsSync(dirAbs))
        return index;
    const files = fs.readdirSync(dirAbs);
    for (const f of files) {
        if (!f.endsWith(".tex"))
            continue;
        const id = path.basename(f, ".tex");
        index[id] = path.join(dirAbs, f);
    }
    return index;
}
function loadTemplateOrThrow(templateId) {
    const idx = buildTemplateIndex(TEMPLATE_DIR);
    const absPath = idx[templateId];
    if (!absPath) {
        const available = Object.keys(idx).sort();
        const msg = `[TEMPLATE_NOT_FOUND] templateId="${templateId}" not found.\n` +
            `TEMPLATE_DIR=${TEMPLATE_DIR}\n` +
            `Available: ${available.length ? available.join(", ") : "(none)"}`;
        const err = new Error(msg);
        err.statusCode = 400;
        throw err;
    }
    const source = fs.readFileSync(absPath, "utf8");
    return { id: templateId, source, absPath };
}
// Placeholder heurística
const CONTENT_PLACEHOLDERS = ["{{CONTENT}}", "%%CONTENT%%", "%CONTENT%", "<<CONTENT>>"];
function findPlaceholder(templateSrc) {
    for (const p of CONTENT_PLACEHOLDERS)
        if (templateSrc.includes(p))
            return p;
    return null;
}
// -------------------------
// Helpers: LaTeX compile
// -------------------------
async function commandExists(cmd) {
    try {
        await execFileAsync(process.platform === "win32" ? "where" : "which", [cmd], { timeout: 3000 });
        return true;
    }
    catch {
        return false;
    }
}
function trimHugeLog(s, max = 60000) {
    if (s.length <= max)
        return s;
    return s.slice(-max);
}
function makeHttpError(message, statusCode, log, code) {
    const err = new Error(message);
    err.statusCode = statusCode;
    if (log)
        err.log = log;
    if (code)
        err.code = code;
    return err;
}
function extractExecOutput(e) {
    return {
        stdout: typeof e?.stdout === "string" ? e.stdout : undefined,
        stderr: typeof e?.stderr === "string" ? e.stderr : undefined,
    };
}
async function compileLatexToPdf(latexSource) {
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
                const { stdout, stderr } = await execFileAsync("latexmk", ["-pdf", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"], { cwd: workDir, timeout: LATEX_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 });
                log += stdout ?? "";
                log += stderr ?? "";
            }
            catch (e) {
                const extra = extractExecOutput(e);
                log += extra.stdout ?? "";
                log += extra.stderr ?? "";
            }
        }
        else {
            const hasPdflatex = await commandExists("pdflatex");
            if (!hasPdflatex) {
                throw makeHttpError("[LATEX_TOOLING_MISSING] Neither latexmk nor pdflatex found in PATH. Install TeX Live or use the Docker image.", 500, undefined, "LATEX_TOOLING_MISSING");
            }
            for (let i = 0; i < 2; i++) {
                try {
                    const { stdout, stderr } = await execFileAsync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"], { cwd: workDir, timeout: LATEX_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 });
                    log += stdout ?? "";
                    log += stderr ?? "";
                }
                catch (e) {
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
            throw makeHttpError("LaTeX compilation failed.", isTimeout ? 408 : 422, trimmed, isTimeout ? "LATEX_TIMEOUT" : "LATEX_COMPILE_FAILED");
        }
        const pdf = await fs.promises.readFile(pdfPath);
        if (fs.existsSync(texLogPath)) {
            const mainLog = await fs.promises.readFile(texLogPath, "utf8");
            log += "\n\n----- main.log -----\n" + mainLog;
        }
        return { pdf, log: trimHugeLog(log) };
    }
    finally {
        try {
            await fs.promises.rm(workDir, { recursive: true, force: true });
        }
        catch { }
    }
}
// -------------------------
// Helpers: OpenAI
// -------------------------
function stripMarkdownFences(text) {
    const t = text.trim();
    if (t.startsWith("```")) {
        const lines = t.split("\n");
        lines.shift();
        if (lines.length && lines[lines.length - 1].trim() === "```")
            lines.pop();
        return lines.join("\n").trim();
    }
    return t;
}
async function generateLatexFromPrompt(args) {
    const { prompt, templateId, templateSource, wantOnlyBody, baseLatex } = args;
    const system = [
        "You are BetterNotes AI.",
        "Output ONLY LaTeX source (no Markdown, no explanations).",
        "Your LaTeX MUST compile with pdflatex.",
        "Avoid exotic packages. Be conservative and minimal.",
        "Never output triple backticks.",
    ].join(" ");
    const messages = [
        { role: "system", content: system },
    ];
    if (typeof baseLatex === "string" && baseLatex.trim()) {
        messages.push({ role: "assistant", content: baseLatex });
        messages.push({
            role: "user",
            content: `Revise the previous LaTeX above according to: ${prompt}. Return the full updated document.`,
        });
    }
    else if (wantOnlyBody) {
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
    }
    else {
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
async function fixLatexWithLog(args) {
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
// Stripe helpers
// -------------------------
function assertStripeConfigured() {
    if (!STRIPE_SECRET_KEY)
        throw makeHttpError("[STRIPE_NOT_CONFIGURED] STRIPE_SECRET_KEY missing.", 500);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
        throw makeHttpError("[SUPABASE_NOT_CONFIGURED] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing.", 500);
}
// -------------------------
// Routes (core)
// -------------------------
app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        service: "betternotes-app-api",
        port: PORT,
        templateDir: TEMPLATE_DIR,
        hasOpenAIKey: Boolean(OPENAI_API_KEY),
        hasStripeKey: Boolean(STRIPE_SECRET_KEY),
        hasWebhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
    });
});
app.get("/templates", (_req, res) => {
    const idx = buildTemplateIndex(TEMPLATE_DIR);
    res.json({ ok: true, templateDir: TEMPLATE_DIR, templates: Object.keys(idx).sort() });
});
// -------------------------
// Stripe routes
// -------------------------
// POST /stripe/create-checkout-session
// body: { priceId: string, userId: string, email?: string }
// resp: { ok:true, url:string }
app.post("/stripe/create-checkout-session", async (req, res) => {
    try {
        assertStripeConfigured();
        const { priceId, userId, email } = req.body;
        if (!priceId || !userId) {
            return res.status(400).json({ ok: false, error: "Missing priceId or userId." });
        }
        // 1) Find Stripe customer in Supabase
        const { data: customerRow, error: cErr } = await supabaseAdmin
            .from("customers")
            .select("stripe_customer_id")
            .eq("id", userId)
            .maybeSingle();
        if (cErr)
            throw cErr;
        let stripeCustomerId = customerRow?.stripe_customer_id ?? null;
        // 2) Create customer if missing
        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: email ?? undefined,
                metadata: { supabase_user_id: userId },
            });
            stripeCustomerId = customer.id;
            await supabaseAdmin.from("customers").upsert({
                id: userId,
                stripe_customer_id: stripeCustomerId,
            });
        }
        // 3) Create Checkout Session (subscription)
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            allow_promotion_codes: true,
            success_url: `${SITE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${SITE_URL}/pricing`,
        });
        return res.json({ ok: true, url: session.url });
    }
    catch (e) {
        console.error("[stripe/create-checkout-session]", e);
        return res.status(500).json({ ok: false, error: e.message ?? "Server error" });
    }
});
// POST /stripe/create-portal-session
// body: { userId: string }
// resp: { ok:true, url:string }
app.post("/stripe/create-portal-session", async (req, res) => {
    try {
        assertStripeConfigured();
        const { userId } = req.body;
        if (!userId)
            return res.status(400).json({ ok: false, error: "Missing userId." });
        const { data: customerRow, error: cErr } = await supabaseAdmin
            .from("customers")
            .select("stripe_customer_id")
            .eq("id", userId)
            .maybeSingle();
        if (cErr)
            throw cErr;
        const stripeCustomerId = customerRow?.stripe_customer_id;
        if (!stripeCustomerId)
            return res.status(400).json({ ok: false, error: "No Stripe customer for user." });
        const portal = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${SITE_URL}/pricing`,
        });
        return res.json({ ok: true, url: portal.url });
    }
    catch (e) {
        console.error("[stripe/create-portal-session]", e);
        return res.status(500).json({ ok: false, error: e.message ?? "Server error" });
    }
});
// POST /stripe/webhook
// IMPORTANT: must use express.raw() and must be defined BEFORE any route-specific json parsers for this path
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!STRIPE_WEBHOOK_SECRET) {
        return res.status(500).send("STRIPE_WEBHOOK_SECRET not set");
    }
    if (!STRIPE_SECRET_KEY) {
        return res.status(500).send("STRIPE_SECRET_KEY not set");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).send("Supabase admin env not set");
    }
    const sig = req.headers["stripe-signature"];
    if (!sig)
        return res.status(400).send("Missing stripe-signature");
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error("[stripe/webhook] signature error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const sub = event.data.object;
                const primaryItem = sub.items?.data?.[0];
                const currentPeriodStart = primaryItem?.current_period_start ?? null;
                const currentPeriodEnd = primaryItem?.current_period_end ?? null;
                // === Adjust to your exact schema if needed ===
                await supabaseAdmin.from("subscriptions").upsert({
                    id: sub.id,
                    customer_id: sub.customer,
                    status: sub.status,
                    current_period_start: currentPeriodStart
                        ? new Date(currentPeriodStart * 1000).toISOString()
                        : null,
                    current_period_end: currentPeriodEnd
                        ? new Date(currentPeriodEnd * 1000).toISOString()
                        : null,
                    cancel_at_period_end: sub.cancel_at_period_end,
                    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
                    ended_at: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
                    trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
                    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
                });
                break;
            }
            // Optional:
            case "checkout.session.completed":
            case "invoice.paid":
            case "invoice.payment_failed":
            default:
                break;
        }
        return res.json({ received: true });
    }
    catch (e) {
        console.error("[stripe/webhook] handler error:", e);
        return res.status(500).json({ error: e.message ?? "Webhook handler failed" });
    }
});
// -------------------------
// BetterNotes AI Routes
// -------------------------
// POST /generate-latex
// body: { prompt: string, templateId?: string, baseLatex?: string }
// resp: { ok, latex, usedTemplateId }
app.post("/generate-latex", async (req, res, next) => {
    try {
        const prompt = String(req.body?.prompt ?? "").trim();
        const templateId = String(req.body?.templateId ?? "2cols_portrait").trim();
        const baseLatexTrimmed = String(req.body?.baseLatex ?? "");
        const hasBaseLatex = baseLatexTrimmed.trim().length > 0;
        if (!prompt)
            return res.status(400).json({ ok: false, error: "Missing 'prompt'." });
        const { source: templateSource } = loadTemplateOrThrow(templateId);
        const placeholder = findPlaceholder(templateSource);
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
    }
    catch (e) {
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
        if (!latex.trim())
            return res.status(400).json({ ok: false, error: "Missing 'latex'." });
        const { pdf, log } = await compileLatexToPdf(latex);
        res.setHeader("Content-Type", "application/pdf");
        return res.status(200).send(pdf);
    }
    catch (e) {
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
        if (!latex.trim())
            return res.status(400).json({ ok: false, error: "Missing 'latex'." });
        if (!log.trim())
            return res.status(400).json({ ok: false, error: "Missing 'log'." });
        const fixedLatex = await fixLatexWithLog({ latex, log });
        if (!fixedLatex.trim())
            return res.status(500).json({ ok: false, error: "Fix returned empty LaTeX." });
        return res.json({ ok: true, fixedLatex });
    }
    catch (e) {
        next(e);
    }
});
// -------------------------
// Error handler
// -------------------------
app.use((err, _req, res, _next) => {
    const status = Number(err?.statusCode ?? 500);
    const message = err?.message ? String(err.message) : "Unknown error";
    if (status >= 500)
        console.error("[ERROR]", err);
    res.status(status).json({ ok: false, error: message });
});
// -------------------------
// Start
// -------------------------
app.listen(PORT, () => {
    console.log(`✅ app-api listening on http://localhost:${PORT}`);
    console.log(`📁 TEMPLATE_DIR: ${TEMPLATE_DIR}`);
});
