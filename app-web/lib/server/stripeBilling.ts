import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
  status?: number;
};

type StripeApiErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type StripeCustomer = {
  id: string;
};

type StripePrice = {
  id?: string | null;
};

type StripeSubscriptionItem = {
  price?: StripePrice | null;
};

type StripeSubscriptionItems = {
  data?: StripeSubscriptionItem[];
};

type StripeSubscriptionLike = {
  id: string;
  status?: string | null;
  customer: string | { id: string };
  metadata?: Record<string, string | undefined>;
  items?: StripeSubscriptionItems;
  current_period_end?: number | null;
};

type StripeCheckoutSessionLike = {
  id: string;
  customer: string | { id: string } | null;
  subscription?: string | StripeSubscriptionLike | null;
  metadata?: Record<string, string | undefined>;
  url?: string | null;
};

type StripeEvent = {
  type: string;
  data: {
    object: StripeSubscriptionLike;
  };
};

type BillingDeps = {
  stripeSecretKey: string;
  webhookSecret: string;
  siteUrl: string;
  priceProId: string;
  supabaseAdmin: SupabaseClient;
  hasSupabase: boolean;
};

type CheckoutInput = {
  priceId?: string;
  userId?: string;
  email?: string;
  plan?: string;
};

type PortalInput = {
  userId?: string;
};

type SyncCheckoutInput = {
  sessionId?: string;
  userId?: string;
};

type SubscriptionUpsertInput = {
  userId: string;
  stripeCustomerId: string;
  subscription: StripeSubscriptionLike;
  priceProId: string;
};

type SupabaseAdminInfo = {
  hasUrl: boolean;
  hasServiceRoleKey: boolean;
  role: string | null;
  urlRef: string | null;
  keyRef: string | null;
  refMatchesUrl: boolean | null;
};

let parsedLocalEnvCache: Record<string, string> | null = null;

function parseEnvFileContent(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function loadLocalEnvFallback() {
  if (parsedLocalEnvCache) return parsedLocalEnvCache;

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "app-web/.env.local"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const parsed = parseEnvFileContent(fs.readFileSync(envPath, "utf8"));
      if (Object.keys(parsed).length > 0) {
        parsedLocalEnvCache = parsed;
        return parsedLocalEnvCache;
      }
    } catch {
      // keep trying next candidate
    }
  }

  parsedLocalEnvCache = {};
  return parsedLocalEnvCache;
}

function readEnv(name: string): string {
  const raw = process.env[name] ?? loadLocalEnvFallback()[name];
  if (typeof raw !== "string") return "";
  let value = raw.replace(/\r/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function readSecretEnv(name: string): string {
  return readEnv(name).replace(/\s+/g, "");
}

function getBillingDeps(): BillingDeps {
  const stripeSecretKey = readSecretEnv("STRIPE_SECRET_KEY");
  const webhookSecret = readSecretEnv("STRIPE_WEBHOOK_SECRET");
  const siteUrl = readEnv("SITE_URL") || readEnv("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
  const priceProId = readEnv("STRIPE_PRICE_PRO_MONTHLY") || readEnv("NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY");
  const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  const hasSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
  const supabaseAdmin = hasSupabase
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : (null as any as SupabaseClient);

  return {
    stripeSecretKey,
    webhookSecret,
    siteUrl,
    priceProId,
    supabaseAdmin,
    hasSupabase,
  };
}

function makeHttpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
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

function describeSupabaseAdminEnv(): SupabaseAdminInfo {
  const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const hasUrl = Boolean(supabaseUrl);
  const hasServiceRoleKey = Boolean(serviceRoleKey);
  const urlRef = getSupabaseProjectRefFromUrl(supabaseUrl);

  const payload = serviceRoleKey ? decodeJwtPayload(serviceRoleKey) : null;
  const role = typeof payload?.role === "string" ? payload.role : null;

  let keyRef: string | null = typeof payload?.ref === "string" ? payload.ref : null;
  if (!keyRef && typeof payload?.iss === "string") {
    const m = payload.iss.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/auth\/v1\/?$/i);
    if (m?.[1]) keyRef = m[1];
  }

  return {
    hasUrl,
    hasServiceRoleKey,
    role,
    urlRef,
    keyRef,
    refMatchesUrl: keyRef && urlRef ? keyRef === urlRef : null,
  };
}

function isSupabaseInvalidApiKeyError(err: SupabaseErrorLike) {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("invalid api key");
}

function throwSupabaseError(operation: string, err: SupabaseErrorLike): never {
  const hint = isSupabaseInvalidApiKeyError(err)
    ? "Check Vercel env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    : "";
  const wrapped: any = makeHttpError(
    `[SUPABASE_ERROR:${operation}] ${err?.message ?? "Unknown Supabase error."}${hint ? ` ${hint}` : ""}`,
    500
  );
  wrapped.source = "supabase";
  wrapped.operation = operation;
  wrapped.supabase = {
    code: err?.code,
    hint: err?.hint,
    details: err?.details,
    status: err?.status,
  };
  throw wrapped;
}

function assertConfiguredForBilling(deps: BillingDeps) {
  if (!deps.stripeSecretKey) throw makeHttpError("[STRIPE_NOT_CONFIGURED] STRIPE_SECRET_KEY missing.", 500);
  const adminInfo = describeSupabaseAdminEnv();
  if (!deps.hasSupabase) {
    const details = `hasSupabaseUrl=${adminInfo.hasUrl} hasServiceRoleKey=${adminInfo.hasServiceRoleKey}`;
    throw makeHttpError(
      `[SUPABASE_NOT_CONFIGURED] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing. ${details}`,
      500
    );
  }
  if (adminInfo.role && adminInfo.role !== "service_role") {
    throw makeHttpError(
      `[SUPABASE_INVALID_KEY] SUPABASE_SERVICE_ROLE_KEY has role='${adminInfo.role}', expected 'service_role'.`,
      500
    );
  }
  if (adminInfo.refMatchesUrl === false) {
    throw makeHttpError(
      `[SUPABASE_PROJECT_MISMATCH] SUPABASE_URL ref=${adminInfo.urlRef} but SUPABASE_SERVICE_ROLE_KEY ref=${adminInfo.keyRef}.`,
      500
    );
  }
}

function assertConfiguredForWebhook(deps: BillingDeps) {
  assertConfiguredForBilling(deps);
  if (!deps.webhookSecret) throw makeHttpError("[STRIPE_NOT_CONFIGURED] STRIPE_WEBHOOK_SECRET missing.", 500);
}

function buildStripeError(operation: string, statusCode: number, payload: StripeApiErrorPayload, requestId: string | null): Error {
  const message = payload?.error?.message ?? `Stripe API error (${statusCode})`;
  const err: any = makeHttpError(message, statusCode >= 400 ? statusCode : 500);
  err.source = "stripe";
  err.operation = operation;
  err.type = payload?.error?.type;
  err.code = payload?.error?.code;
  err.requestId = requestId;
  err.raw = payload?.error;
  return err as Error;
}

async function stripeRequest<T>(
  secretKey: string,
  operation: string,
  endpointPath: string,
  options?: { method?: "GET" | "POST"; params?: URLSearchParams }
): Promise<T> {
  const method = options?.method ?? "GET";
  const hasBody = method === "POST";
  const query = method === "GET" && options?.params ? `?${options.params.toString()}` : "";
  const url = `https://api.stripe.com${endpointPath}${query}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(hasBody ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: hasBody ? options?.params?.toString() : undefined,
  });

  const text = await res.text();
  const requestId = res.headers.get("request-id");
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw buildStripeError(operation, res.status, data as StripeApiErrorPayload, requestId);
  }

  return data as T;
}

function customerIdOf(customer: string | { id: string } | null | undefined): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function resolvePlan(priceId: string | null, planFromMeta: string | null, priceProId: string) {
  const priceIsPro = Boolean(priceProId && priceId === priceProId);
  const resolvedPlan =
    planFromMeta === "pro"
      ? priceProId
        ? priceIsPro
          ? "pro"
          : null
        : "pro"
      : priceIsPro
        ? "pro"
        : null;
  const shouldSetPro = resolvedPlan === "pro";
  return { resolvedPlan, shouldSetPro };
}

function getSubscriptionPriceId(subscription: StripeSubscriptionLike): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

function toIsoFromEpochSeconds(epochSeconds?: number | null): string | null {
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

async function upsertSubscriptionAndProfile(input: SubscriptionUpsertInput, deps: BillingDeps) {
  const { userId, stripeCustomerId, subscription, priceProId } = input;
  const stripeSubscriptionId = subscription.id;
  const status = subscription.status ?? null;
  const priceId = getSubscriptionPriceId(subscription);
  const periodEndIso = toIsoFromEpochSeconds(subscription.current_period_end ?? null);

  const planFromMeta = subscription.metadata?.plan ?? null;
  const { shouldSetPro } = resolvePlan(priceId, planFromMeta, priceProId);
  const shouldSetProAndActive = shouldSetPro && (status === "active" || status === "trialing");

  const { data: existing, error: exErr } = await deps.supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (exErr) throwSupabaseError("subscriptions.select", exErr);

  if (existing?.id) {
    const { error: updErr } = await deps.supabaseAdmin
      .from("subscriptions")
      .update({
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        price_id: priceId,
        status,
        current_period_end: periodEndIso,
      })
      .eq("id", existing.id);
    if (updErr) throwSupabaseError("subscriptions.update", updErr);
  } else {
    const { error: insErr } = await deps.supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      price_id: priceId,
      status,
      current_period_end: periodEndIso,
    });
    if (insErr) throwSupabaseError("subscriptions.insert", insErr);
  }

  const profileUpdate: Record<string, any> = {
    id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subscription_status: status,
    price_id: priceId,
    current_period_end: periodEndIso,
    updated_at: new Date().toISOString(),
  };
  if (shouldSetProAndActive) profileUpdate.plan = "pro";

  const { error: profUpErr } = await deps.supabaseAdmin.from("profiles").upsert(profileUpdate);
  if (profUpErr) throwSupabaseError("profiles.upsert", profUpErr);

  return { status, plan: shouldSetProAndActive ? "pro" : "free" };
}

function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",");
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) {
    throw makeHttpError("Invalid stripe-signature header.", 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > 300) {
    throw makeHttpError("Stripe signature timestamp is outside tolerance.", 400);
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const valid = signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig) || sig.length !== expected.length) return false;
    const sigBuf = Buffer.from(sig, "hex");
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  });

  if (!valid) throw makeHttpError("Stripe signature verification failed.", 400);
}

export async function createCheckoutSessionForUser(input: CheckoutInput) {
  const deps = getBillingDeps();
  assertConfiguredForBilling(deps);

  const { priceId, userId, email, plan } = input;
  if (!priceId || !userId) throw makeHttpError("Missing priceId or userId.", 400);

  const resolvedPlan = plan === "pro" ? "pro" : deps.priceProId && priceId === deps.priceProId ? "pro" : null;
  if (!resolvedPlan) throw makeHttpError("Only the Pro plan is available right now.", 400);
  if (deps.priceProId && priceId !== deps.priceProId) throw makeHttpError("Invalid Pro priceId.", 400);

  const { data: profile, error: pErr } = await deps.supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throwSupabaseError("profiles.select.checkout", pErr);

  let stripeCustomerId = (profile?.stripe_customer_id as string | null) ?? null;
  if (!stripeCustomerId) {
    const customerParams = new URLSearchParams();
    if (email ?? profile?.email) customerParams.append("email", (email ?? profile?.email)!);
    customerParams.append("metadata[supabase_user_id]", userId);

    const customer = await stripeRequest<StripeCustomer>(
      deps.stripeSecretKey,
      "customers.create.checkout",
      "/v1/customers",
      { method: "POST", params: customerParams }
    );
    stripeCustomerId = customer.id;

    const { error: profUpsertErr } = await deps.supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: email ?? profile?.email ?? null,
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    });
    if (profUpsertErr) throwSupabaseError("profiles.upsert.checkout_customer", profUpsertErr);
  }

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("customer", stripeCustomerId);
  params.append("line_items[0][price]", priceId);
  params.append("line_items[0][quantity]", "1");
  params.append("allow_promotion_codes", "true");
  params.append("metadata[plan]", resolvedPlan);
  params.append("metadata[supabase_user_id]", userId);
  params.append("subscription_data[metadata][plan]", resolvedPlan);
  params.append("subscription_data[metadata][supabase_user_id]", userId);
  params.append("success_url", `${deps.siteUrl}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${deps.siteUrl}/pricing?canceled=1`);

  const session = await stripeRequest<StripeCheckoutSessionLike>(
    deps.stripeSecretKey,
    "checkout.sessions.create",
    "/v1/checkout/sessions",
    { method: "POST", params }
  );

  return { ok: true, url: session.url };
}

export async function createPortalSessionForUser(input: PortalInput) {
  const deps = getBillingDeps();
  assertConfiguredForBilling(deps);

  const { userId } = input;
  if (!userId) throw makeHttpError("Missing userId.", 400);

  const { data: profile, error: pErr } = await deps.supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throwSupabaseError("profiles.select.portal", pErr);

  const stripeCustomerId = profile?.stripe_customer_id as string | undefined;
  if (!stripeCustomerId) throw makeHttpError("No Stripe customer for user.", 400);

  const params = new URLSearchParams();
  params.append("customer", stripeCustomerId);
  params.append("return_url", `${deps.siteUrl}/pricing`);

  const portal = await stripeRequest<{ url: string }>(
    deps.stripeSecretKey,
    "billing_portal.sessions.create",
    "/v1/billing_portal/sessions",
    { method: "POST", params }
  );

  return { ok: true, url: portal.url };
}

export async function syncCheckoutSessionForUser(input: SyncCheckoutInput) {
  const deps = getBillingDeps();
  assertConfiguredForBilling(deps);

  const { sessionId, userId } = input;
  if (!sessionId || !userId) throw makeHttpError("Missing sessionId or userId.", 400);

  const retrieveParams = new URLSearchParams();
  retrieveParams.append("expand[]", "subscription");

  const session = await stripeRequest<StripeCheckoutSessionLike>(
    deps.stripeSecretKey,
    "checkout.sessions.retrieve.sync",
    `/v1/checkout/sessions/${sessionId}`,
    { method: "GET", params: retrieveParams }
  );

  const stripeCustomerId = customerIdOf(session.customer);
  if (!stripeCustomerId) throw makeHttpError("Checkout session has no customer.", 400);

  let subscription: StripeSubscriptionLike | null = null;
  if (session.subscription) {
    subscription =
      typeof session.subscription === "string"
        ? await stripeRequest<StripeSubscriptionLike>(
          deps.stripeSecretKey,
          "subscriptions.retrieve.sync",
          `/v1/subscriptions/${session.subscription}`,
          { method: "GET" }
        )
        : session.subscription;
  }
  if (!subscription) throw makeHttpError("Checkout session has no subscription.", 400);

  const sessionUserId = session.metadata?.supabase_user_id ?? null;
  const subUserId = subscription.metadata?.supabase_user_id ?? null;
  const ownerUserId = subUserId ?? sessionUserId ?? null;
  if (ownerUserId && ownerUserId !== userId) {
    throw makeHttpError("Checkout session does not belong to this user.", 403);
  }

  const { data: profile, error: pErr } = await deps.supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throwSupabaseError("profiles.select.sync_checkout", pErr);

  const existingCustomerId = (profile?.stripe_customer_id as string | null) ?? null;
  if (existingCustomerId && existingCustomerId !== stripeCustomerId) {
    throw makeHttpError("Customer mismatch for user profile.", 409);
  }

  const result = await upsertSubscriptionAndProfile({
    userId,
    stripeCustomerId,
    subscription,
    priceProId: deps.priceProId,
  }, deps);

  return { ok: true, synced: true, ...result };
}

export async function processStripeWebhook(rawBody: string, signature: string) {
  const deps = getBillingDeps();
  assertConfiguredForWebhook(deps);

  verifyStripeWebhookSignature(rawBody, signature, deps.webhookSecret);
  const event = JSON.parse(rawBody) as StripeEvent;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as StripeSubscriptionLike;
      const stripeCustomerId = customerIdOf(sub.customer);
      if (!stripeCustomerId) return { received: true };

      let userId: string | null = sub.metadata?.supabase_user_id ?? null;
      if (!userId) {
        const { data: prof, error: profErr } = await deps.supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();
        if (profErr) throwSupabaseError("profiles.select.webhook_customer_lookup", profErr);
        userId = prof?.id ?? null;
      }

      if (!userId) {
        console.warn("[stripe/webhook] No user found for stripe_customer_id:", stripeCustomerId);
        return { received: true };
      }

      await upsertSubscriptionAndProfile({
        userId,
        stripeCustomerId,
        subscription: sub,
        priceProId: deps.priceProId,
      }, deps);
      return { received: true };
    }
    default:
      return { received: true };
  }
}
