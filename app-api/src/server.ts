// app-api/src/server.ts
import express from "express";
import cors from "cors";
import path from "path";
import OpenAI from "openai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

import { buildTemplateIndex } from "./lib/templates";
import { createLatexRouter } from "./routes/latex";
import { createStripeRouter } from "./routes/stripe";

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
const LATEX_TIMEOUT_MS = Number(process.env.LATEX_TIMEOUT_MS ?? 60000);

const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS ?? "").trim();
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

// Stripe / Supabase (server-only)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const STRIPE_PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";

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
    hasSupabaseAdmin: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
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
});
