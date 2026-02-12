// app-api/src/routes/stripe.ts
import express from "express";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

type StripeDeps = {
  stripe: Stripe;
  supabaseAdmin: SupabaseClient;
  siteUrl: string;
  webhookSecret: string;
  stripeSecretKeyPresent: boolean;
  supabasePresent: boolean;
  priceProId?: string;
};

function makeHttpError(message: string, statusCode: number) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err as Error;
}

function assertStripeConfigured(deps: StripeDeps) {
  if (!deps.stripeSecretKeyPresent) throw makeHttpError("[STRIPE_NOT_CONFIGURED] STRIPE_SECRET_KEY missing.", 500);
  if (!deps.supabasePresent) throw makeHttpError("[SUPABASE_NOT_CONFIGURED] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing.", 500);
}

export function createStripeRouter(deps: StripeDeps) {
  const router = express.Router();

  // POST /stripe/create-checkout-session
  router.post("/create-checkout-session", async (req, res) => {
    try {
      assertStripeConfigured(deps);

      const { priceId, userId, email, plan } = req.body as {
        priceId?: string;
        userId?: string;
        email?: string;
        plan?: string;
      };
      if (!priceId || !userId) return res.status(400).json({ ok: false, error: "Missing priceId or userId." });

      const planNormalized = plan === "pro" ? "pro" : null;
      const resolvedPlan = planNormalized ?? (deps.priceProId && priceId === deps.priceProId ? "pro" : null);
      if (!resolvedPlan) {
        return res.status(400).json({ ok: false, error: "Only the Pro plan is available right now." });
      }
      if (deps.priceProId && priceId !== deps.priceProId) {
        return res.status(400).json({ ok: false, error: "Invalid Pro priceId." });
      }

      const { data: profile, error: pErr } = await deps.supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id, email")
        .eq("id", userId)
        .maybeSingle();

      if (pErr) throw pErr;

      let stripeCustomerId = (profile?.stripe_customer_id as string | null) ?? null;

      if (!stripeCustomerId) {
        const customer = await deps.stripe.customers.create({
          email: email ?? (profile?.email ?? undefined),
          metadata: { supabase_user_id: userId },
        });
        stripeCustomerId = customer.id;

        await deps.supabaseAdmin.from("profiles").upsert({
          id: userId,
          email: email ?? profile?.email ?? null,
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        });
      }

      const session = await deps.stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        metadata: {
          plan: resolvedPlan,
          supabase_user_id: userId,
        },
        subscription_data: {
          metadata: {
            plan: resolvedPlan,
            supabase_user_id: userId,
          },
        },
        success_url: `${deps.siteUrl}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${deps.siteUrl}/pricing?canceled=1`,
      });

      return res.json({ ok: true, url: session.url });
    } catch (e: any) {
      console.error("[stripe/create-checkout-session]", e);
      return res.status(500).json({ ok: false, error: e.message ?? "Server error" });
    }
  });

  // POST /stripe/sync-checkout-session
  // Fallback sync for local/dev setups where webhooks may be delayed or not forwarded.
  router.post("/sync-checkout-session", async (req, res) => {
    try {
      assertStripeConfigured(deps);

      const { sessionId, userId } = req.body as { sessionId?: string; userId?: string };
      if (!sessionId || !userId) return res.status(400).json({ ok: false, error: "Missing sessionId or userId." });

      const session = await deps.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });

      const stripeCustomerId =
        typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
      if (!stripeCustomerId) {
        return res.status(400).json({ ok: false, error: "Checkout session has no customer." });
      }

      let subscription: Stripe.Subscription | null = null;
      if (session.subscription) {
        subscription =
          typeof session.subscription === "string"
            ? await deps.stripe.subscriptions.retrieve(session.subscription)
            : (session.subscription as Stripe.Subscription);
      }
      if (!subscription) {
        return res.status(400).json({ ok: false, error: "Checkout session has no subscription." });
      }

      const sessionUserId = (session.metadata as any)?.supabase_user_id ?? null;
      const subUserId = (subscription.metadata as any)?.supabase_user_id ?? null;
      const ownerUserId = subUserId ?? sessionUserId ?? null;
      if (ownerUserId && ownerUserId !== userId) {
        return res.status(403).json({ ok: false, error: "Checkout session does not belong to this user." });
      }

      const { data: profile, error: pErr } = await deps.supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();
      if (pErr) throw pErr;

      const existingCustomerId = (profile?.stripe_customer_id as string | null) ?? null;
      if (existingCustomerId && existingCustomerId !== stripeCustomerId) {
        return res.status(409).json({ ok: false, error: "Customer mismatch for user profile." });
      }

      const stripeSubscriptionId = subscription.id;
      const status = subscription.status ?? null;
      const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
      const periodEnd = (subscription as any).current_period_end ?? null;
      const periodEndIso = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

      const planFromMeta = (subscription.metadata as any)?.plan ?? null;
      const priceIsPro = deps.priceProId ? priceId === deps.priceProId : null;
      const resolvedPlan =
        planFromMeta === "pro"
          ? deps.priceProId
            ? priceIsPro
              ? "pro"
              : null
            : "pro"
          : priceIsPro
            ? "pro"
            : null;
      const shouldSetPro = resolvedPlan === "pro" && (status === "active" || status === "trialing");

      const { data: existing, error: exErr } = await deps.supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("stripe_subscription_id", stripeSubscriptionId)
        .maybeSingle();
      if (exErr) throw exErr;

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
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await deps.supabaseAdmin.from("subscriptions").insert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          price_id: priceId,
          status,
          current_period_end: periodEndIso,
        });
        if (insErr) throw insErr;
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
      if (shouldSetPro) profileUpdate.plan = "pro";

      const { error: profUpErr } = await deps.supabaseAdmin.from("profiles").upsert(profileUpdate);
      if (profUpErr) throw profUpErr;

      return res.json({ ok: true, synced: true, plan: shouldSetPro ? "pro" : "free", status });
    } catch (e: any) {
      console.error("[stripe/sync-checkout-session]", e);
      return res.status(500).json({ ok: false, error: e.message ?? "Server error" });
    }
  });

  // POST /stripe/create-portal-session
  router.post("/create-portal-session", async (req, res) => {
    try {
      assertStripeConfigured(deps);

      const { userId } = req.body as { userId?: string };
      if (!userId) return res.status(400).json({ ok: false, error: "Missing userId." });

      const { data: profile, error: pErr } = await deps.supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

      if (pErr) throw pErr;

      const stripeCustomerId = profile?.stripe_customer_id as string | undefined;
      if (!stripeCustomerId) return res.status(400).json({ ok: false, error: "No Stripe customer for user." });

      const portal = await deps.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${deps.siteUrl}/pricing`,
      });

      return res.json({ ok: true, url: portal.url });
    } catch (e: any) {
      console.error("[stripe/create-portal-session]", e);
      return res.status(500).json({ ok: false, error: e.message ?? "Server error" });
    }
  });

  // POST /stripe/webhook  (raw body required for signature verification)
  router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!deps.webhookSecret) return res.status(500).send("STRIPE_WEBHOOK_SECRET not set");

    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).send("Missing stripe-signature");

    let event: Stripe.Event;
    try {
      event = deps.stripe.webhooks.constructEvent(req.body, sig, deps.webhookSecret);
    } catch (err: any) {
      console.error("[stripe/webhook] signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;

          const stripeSubscriptionId = sub.id;
          const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const status = sub.status ?? null;
          const priceId = sub.items?.data?.[0]?.price?.id ?? null;

          const periodEnd = (sub as any).current_period_end ?? null;
          const periodEndIso = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

          let userId: string | null = (sub.metadata as any)?.supabase_user_id ?? null;

          if (!userId) {
            const { data: prof, error: profErr } = await deps.supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("stripe_customer_id", stripeCustomerId)
              .maybeSingle();

            if (profErr) throw profErr;
            userId = prof?.id ?? null;
          }

          if (!userId) {
            console.warn("[stripe/webhook] No user found for stripe_customer_id:", stripeCustomerId);
            break;
          }

          const planFromMeta = (sub.metadata as any)?.plan ?? null;
          const priceIsPro = deps.priceProId ? priceId === deps.priceProId : null;
          const resolvedPlan =
            planFromMeta === "pro"
              ? deps.priceProId
                ? priceIsPro
                  ? "pro"
                  : null
                : "pro"
              : priceIsPro
                ? "pro"
                : null;
          const shouldSetPro = resolvedPlan === "pro" && (status === "active" || status === "trialing");

          const { data: existing, error: exErr } = await deps.supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("stripe_subscription_id", stripeSubscriptionId)
            .maybeSingle();

          if (exErr) throw exErr;

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
            if (updErr) throw updErr;
          } else {
            const { error: insErr } = await deps.supabaseAdmin.from("subscriptions").insert({
              user_id: userId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              price_id: priceId,
              status,
              current_period_end: periodEndIso,
            });
            if (insErr) throw insErr;
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
          if (shouldSetPro) profileUpdate.plan = "pro";

          const { error: profUpErr } = await deps.supabaseAdmin.from("profiles").upsert(profileUpdate);
          if (profUpErr) throw profUpErr;

          break;
        }
        default:
          break;
      }

      return res.json({ received: true });
    } catch (e: any) {
      console.error("[stripe/webhook] handler error:", e);
      return res.status(500).json({ error: e.message ?? "Webhook handler failed" });
    }
  });

  return router;
}
