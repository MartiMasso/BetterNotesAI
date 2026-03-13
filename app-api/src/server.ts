// app-api/src/server.ts
import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

import { buildTemplateIndex } from "./lib/templates";
import { createLatexRouter } from "./routes/latex";
import { createStripeRouter } from "./routes/stripe";

const app = express();

const APP_API_ROOT = path.resolve(__dirname, "..");
const APP_API_ENV_FILE = path.resolve(APP_API_ROOT, ".env");
const APP_WEB_ENV_LOCAL_FILE = path.resolve(APP_API_ROOT, "../app-web/.env.local");
const FRONTEND_ENV_ALIAS_MAP: Record<string, string[]> = {
  STRIPE_SECRET_KEY: ["STRIPE_SECRET_KEY"],
  STRIPE_WEBHOOK_SECRET: ["STRIPE_WEBHOOK_SECRET"],
  SITE_URL: ["SITE_URL", "NEXT_PUBLIC_SITE_URL"],
  SUPABASE_URL: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  SUPABASE_ANON_KEY: ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
};

function loadAppApiEnvFile() {
  if (!fs.existsSync(APP_API_ENV_FILE)) return;
  const result = dotenv.config({ path: APP_API_ENV_FILE, override: false });
  if (result.error) {
    console.warn(`[WARN] Could not load env file: ${APP_API_ENV_FILE}`, result.error.message);
  }
}

function loadFrontendManagedServerEnv() {
  if (!fs.existsSync(APP_WEB_ENV_LOCAL_FILE)) return;

  try {
    const parsed = dotenv.parse(fs.readFileSync(APP_WEB_ENV_LOCAL_FILE, "utf8"));

    for (const [targetKey, sourceCandidates] of Object.entries(FRONTEND_ENV_ALIAS_MAP)) {
      const value = sourceCandidates
        .map((sourceKey) => parsed[sourceKey])
        .find((raw) => typeof raw === "string" && raw.trim()) as string | undefined;
      if (!value) continue;
      // For local/dev, app-web/.env.local can be the single source of truth.
      process.env[targetKey] = value;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[WARN] Could not load env file: ${APP_WEB_ENV_LOCAL_FILE}`, message);
  }
}

loadAppApiEnvFile();
loadFrontendManagedServerEnv();

function readEnv(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  let value = raw.replace(/\r/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

  // Common production copy/paste issue: values pasted with surrounding quotes.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function readStripeSecretEnv(name: string): string {
  // Stripe secrets should never contain whitespace; remove it defensively to avoid
  // production copy/paste issues (Railway/Vercel UI, password managers, etc.).
  return readEnv(name).replace(/\s+/g, "");
}

function describeStripeKey(key: string) {
  if (!key) return { present: false, mode: "missing", length: 0, fingerprint: null };
  const mode = key.startsWith("sk_live_")
    ? "live"
    : key.startsWith("sk_test_")
      ? "test"
      : key.startsWith("rk_")
        ? "restricted"
        : "unknown";
  const fingerprint = crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
  return {
    present: true,
    mode,
    length: key.length,
    startsWithSk: key.startsWith("sk_"),
    fingerprint,
  };
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function getSupabaseProjectRefFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    if (!hostname.endsWith(".supabase.co")) return null;
    const [ref] = hostname.split(".");
    return ref || null;
  } catch {
    return null;
  }
}

function describeSupabaseAdmin(url: string, key: string) {
  const urlRef = getSupabaseProjectRefFromUrl(url);
  if (!key) {
    return {
      present: false,
      keyLength: 0,
      role: null as string | null,
      keyRef: null as string | null,
      urlRef,
      refMatchesUrl: null as boolean | null,
    };
  }

  const payload = decodeJwtPayload(key);
  const role = typeof payload?.role === "string" ? payload.role : null;

  let keyRef: string | null = typeof payload?.ref === "string" ? payload.ref : null;
  if (!keyRef && typeof payload?.iss === "string") {
    const m = payload.iss.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/auth\/v1\/?$/i);
    if (m?.[1]) keyRef = m[1];
  }

  return {
    present: true,
    keyLength: key.length,
    role,
    keyRef,
    urlRef,
    refMatchesUrl: keyRef && urlRef ? keyRef === urlRef : null,
  };
}

// -------------------------
// Env / Config
// -------------------------
const PORT = Number(process.env.PORT ?? 4000);

const OPENAI_API_KEY = readEnv("OPENAI_API_KEY");
if (!OPENAI_API_KEY) {
  console.warn("[WARN] OPENAI_API_KEY is not set. /generate-latex and /fix-latex will fail.");
}
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const TEMPLATE_DIR = process.env.TEMPLATE_DIR
  ? path.resolve(process.env.TEMPLATE_DIR)
  : path.join(process.cwd(), "templates"); // app-api/templates

const MAX_JSON_SIZE = process.env.MAX_JSON_SIZE ?? "20mb";
const LATEX_TIMEOUT_MS = Number(process.env.LATEX_TIMEOUT_MS ?? 180000);

const allowedOriginsRaw = readEnv("ALLOWED_ORIGINS");
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

// Stripe / Supabase (server-only)
const STRIPE_SECRET_KEY = readStripeSecretEnv("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = readStripeSecretEnv("STRIPE_WEBHOOK_SECRET");
const SITE_URL = readEnv("SITE_URL") || "http://localhost:3000";
const STRIPE_PRICE_PRO_MONTHLY = readEnv("STRIPE_PRICE_PRO_MONTHLY");

if (!STRIPE_SECRET_KEY) {
  console.warn("[WARN] STRIPE_SECRET_KEY is not set (checked runtime env + app-web/.env.local). Stripe routes will fail.");
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn("[WARN] STRIPE_WEBHOOK_SECRET is not set (checked runtime env + app-web/.env.local). /stripe/webhook signature verification will fail.");
}

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = readEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAdminInfo = describeSupabaseAdmin(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[WARN] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set (checked runtime env + app-web/.env.local). Stripe webhook DB sync will fail.");
} else {
  if (supabaseAdminInfo.role && supabaseAdminInfo.role !== "service_role") {
    console.warn("[WARN] SUPABASE_SERVICE_ROLE_KEY is not a service_role key. Stripe sync requires service_role.");
  }
  if (supabaseAdminInfo.refMatchesUrl === false) {
    console.warn(
      `[WARN] Supabase project mismatch. SUPABASE_URL ref=${supabaseAdminInfo.urlRef} but key ref=${supabaseAdminInfo.keyRef}.`
    );
  }
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
  : (null as any as Stripe);

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : (null as any);

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

// IMPORTANT:
// We keep express.json globally for your existing endpoints.
// For Stripe webhook we override with express.raw() ONLY on that route.
// Stripe webhook MUST receive raw body (no JSON parsing before it)
const isStripeWebhookPath = (url?: string) => {
  const pathOnly = (url ?? "").split("?")[0];
  return pathOnly === "/stripe/webhook" || pathOnly.startsWith("/stripe/webhook/");
};

app.use((req, res, next) => {
  if (isStripeWebhookPath(req.originalUrl)) return next();
  return express.json({ limit: MAX_JSON_SIZE })(req, res, next);
});

app.use((req, res, next) => {
  if (isStripeWebhookPath(req.originalUrl)) return next();
  return express.urlencoded({ extended: true, limit: MAX_JSON_SIZE })(req, res, next);
});

// -------------------------
// Core routes
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
    stripeKeyInfo: describeStripeKey(STRIPE_SECRET_KEY),
    stripeWebhookInfo: {
      present: Boolean(STRIPE_WEBHOOK_SECRET),
      length: STRIPE_WEBHOOK_SECRET.length,
      startsWithWhsec: STRIPE_WEBHOOK_SECRET.startsWith("whsec_"),
    },
    hasSupabaseAdmin: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    hasSupabaseAnon: Boolean(SUPABASE_ANON_KEY),
    supabaseAdminInfo,
    siteUrl: SITE_URL,
  });
});

app.get("/templates", (_req, res) => {
  const idx = buildTemplateIndex(TEMPLATE_DIR);
  res.json({ ok: true, templateDir: TEMPLATE_DIR, templates: Object.keys(idx).sort() });
});

// -------------------------
// Routers
// -------------------------

// LaTeX router (we mount twice: old endpoints + new /latex/* endpoints)
// - Old:  POST /generate-latex, /compile, /fix-latex
// - New:  POST /latex/generate-latex, /latex/compile, /latex/fix-latex
const latexRouter = createLatexRouter({
  openai,
  openaiModel: OPENAI_MODEL,
  templateDirAbs: TEMPLATE_DIR,
  latexTimeoutMs: LATEX_TIMEOUT_MS,
});
app.use("/", latexRouter);
app.use("/latex", latexRouter);

// Stripe router (expects /stripe/create-checkout-session, /stripe/create-portal-session, /stripe/webhook)
app.use(
  "/stripe",
  createStripeRouter({
    stripe,
    supabaseAdmin,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    siteUrl: SITE_URL,
    // useful if your stripe router asserts config:
    stripeSecretKeyPresent: Boolean(STRIPE_SECRET_KEY),
    supabasePresent: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    priceProId: STRIPE_PRICE_PRO_MONTHLY || undefined,
  })
);

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
  console.log(`💳 Stripe key info:`, describeStripeKey(STRIPE_SECRET_KEY));
  console.log(`🗄️ Supabase admin info:`, supabaseAdminInfo);
});
