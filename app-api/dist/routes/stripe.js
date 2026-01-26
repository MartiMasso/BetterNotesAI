// app-api/src/routes/stripe.ts
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
// Si esta línea te da guerra por versión, bórrala.
// apiVersion: "2025-01-27.acacia",
});
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/**
 * POST /stripe/create-checkout-session
 * Body: { priceId: string, userId: string, email?: string }
 * Devuelve: { url: string }
 */
router.post("/create-checkout-session", express.json(), async (req, res) => {
    try {
        const { priceId, userId, email } = req.body;
        if (!priceId || !userId) {
            return res.status(400).json({ error: "Missing priceId or userId" });
        }
        // 1) Buscar stripe_customer_id en Supabase
        const { data: customerRow, error: cErr } = await supabaseAdmin
            .from("customers")
            .select("stripe_customer_id")
            .eq("id", userId)
            .maybeSingle();
        if (cErr)
            throw cErr;
        let stripeCustomerId = customerRow?.stripe_customer_id ?? null;
        // 2) Si no existe, crear customer en Stripe y guardarlo
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
        // 3) Crear Checkout Session (subscription)
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.SITE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_URL}/pricing`,
            allow_promotion_codes: true,
        });
        return res.json({ url: session.url });
    }
    catch (e) {
        console.error("[stripe/create-checkout-session]", e);
        return res.status(500).json({ error: e.message ?? "Server error" });
    }
});
/**
 * POST /stripe/create-portal-session
 * Body: { userId: string }
 * Devuelve: { url: string }
 */
router.post("/create-portal-session", express.json(), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId)
            return res.status(400).json({ error: "Missing userId" });
        const { data: customerRow, error: cErr } = await supabaseAdmin
            .from("customers")
            .select("stripe_customer_id")
            .eq("id", userId)
            .maybeSingle();
        if (cErr)
            throw cErr;
        const stripeCustomerId = customerRow?.stripe_customer_id;
        if (!stripeCustomerId)
            return res.status(400).json({ error: "No Stripe customer for user" });
        const portal = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${process.env.SITE_URL}/pricing`,
        });
        return res.json({ url: portal.url });
    }
    catch (e) {
        console.error("[stripe/create-portal-session]", e);
        return res.status(500).json({ error: e.message ?? "Server error" });
    }
});
/**
 * POST /stripe/webhook
 * IMPORTANTE: debe usar express.raw, NO express.json
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig)
        return res.status(400).send("Missing stripe-signature");
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
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
                // === AJUSTA AQUÍ si tus columnas difieren ===
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
            // útiles para debug / estados de pago (opcionales)
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
export default router;
