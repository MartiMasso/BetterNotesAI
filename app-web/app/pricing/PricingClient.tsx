"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppBackground from "../components/AppBackground";
import Navbar from "../components/Navbar";
import { useToast } from "../components/Toast";
import * as supabaseMod from "../../supabaseClient";

const supabase: any = (supabaseMod as any).supabase ?? (supabaseMod as any).default;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Set these in app-web/.env.local
// NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_...
const PRICE_PRO_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? "";

// Default selection (monthly)
const PRICE_PRO = PRICE_PRO_MONTHLY;

type CurrentPlan = "free" | "pro";

export default function PricingClient({
  success,
  canceled,
  sessionId,
}: {
  success: boolean;
  canceled: boolean;
  sessionId?: string;
}) {
  const [loadingPlan, setLoadingPlan] = useState<null | "pro">(null);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const { toast } = useToast();

  const loadCurrentPlan = useCallback(async () => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const user = data?.user;
      if (!user) {
        setCurrentPlan(null);
        return null;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const plan = profile?.plan === "pro" ? "pro" : "free";
      setCurrentPlan(plan);
      return plan;
    } catch (e) {
      console.warn("Failed to load current plan:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    loadCurrentPlan();
  }, [loadCurrentPlan]);

  useEffect(() => {
    if (!success) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const plan = await loadCurrentPlan();
      if (plan === "pro" || attempts >= 12) {
        clearInterval(interval);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [success, loadCurrentPlan]);

  useEffect(() => {
    if (!success || !sessionId) return;
    let cancelled = false;

    (async () => {
      try {
        if (!supabase) return;
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data?.user;
        if (!user) return;

        const resp = await fetch(`${API_URL}/stripe/sync-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            userId: user.id,
          }),
        });

        const json = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(json?.error ?? "Failed to sync checkout session");

        if (!cancelled) await loadCurrentPlan();
      } catch (e) {
        console.warn("Failed to sync checkout session:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [success, sessionId, loadCurrentPlan]);

  async function startCheckout(priceId: string) {
    try {
      if (!supabase) throw new Error("Supabase client not found. Check app-web/supabaseClient.ts exports.");
      if (!priceId)
        throw new Error("Missing Stripe priceId. Set NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY in app-web/.env.local");

      setLoadingPlan("pro");

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const user = data?.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const resp = await fetch(`${API_URL}/stripe/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          userId: user.id,
          email: user.email ?? undefined,
          plan: "pro",
        }),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Failed to create checkout session");
      if (!json?.url) throw new Error("Checkout session did not return a URL");

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      toast(e?.message ?? "Stripe checkout failed", "error");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function manageSubscription() {
    try {
      if (!supabase) throw new Error("Supabase client not found.");
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const user = data?.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const resp = await fetch(`${API_URL}/stripe/create-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Failed to create portal session");
      if (!json?.url) throw new Error("Portal session did not return a URL");

      window.location.href = json.url;
    } catch (e: any) {
      console.error(e);
      toast(e?.message ?? "Failed to open subscription management", "error");
    }
  }

  return (
    <main className="relative min-h-screen text-white">
      <AppBackground />
      <Navbar />

      {/* Content */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16">
        {(success || canceled) && (
          <div className="mb-6 rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-4 text-sm text-white/80">
            {success ? (
              <div>
                <div className="font-semibold text-white">✅ Payment successful</div>
                <div className="mt-1 text-white/70">
                  Your subscription is being activated. If it doesn't update in a few seconds, refresh the page.
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/workspace"
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90"
                  >
                    Go to Workspace
                  </Link>
                  <button
                    type="button"
                    onClick={() => loadCurrentPlan()}
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="font-semibold text-white">Payment canceled</div>
                <div className="mt-1 text-white/70">No worries — you can try again anytime.</div>
              </div>
            )}
          </div>
        )}

        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Student-friendly pricing</h1>
          <p className="mt-3 text-white/70 max-w-2xl mx-auto">
            Generate clean LaTeX from PDFs and compile beautiful PDFs. Start free, upgrade when you need bigger files,
            faster generation, and more monthly credits.
          </p>
        </div>

        {/* Cards */}
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <PlanCard
            name="Free"
            price="0€"
            tagline="Generous enough to be useful"
            highlight={currentPlan === "free"}
            badge={currentPlan === "free" ? "Current plan" : undefined}
            ctaText={currentPlan === "free" ? "Current plan" : "Start free"}
            ctaHref="/workspace"
            features={[
              "5 daily credits (cap 60 / month)",
              "PDF upload up to 10 pages",
              "LaTeX export (.tex)",
              "PDF compile + preview",
              "Basic templates",
            ]}
            note="Best for trying the workflow and small weekly updates."
          />

          <PlanCard
            name="Pro (Student)"
            price="11.99€"
            period="/month"
            tagline="For students who use it every week"
            highlight={currentPlan ? currentPlan === "pro" : true}
            badge={currentPlan === "pro" ? "Current plan" : "Most popular"}
            ctaText={currentPlan === "pro" ? "Current plan" : "Upgrade to Pro"}
            ctaHref=""
            onCtaClick={() => startCheckout(PRICE_PRO)}
            ctaDisabled={loadingPlan === "pro" || currentPlan === "pro"}
            ctaLoading={loadingPlan === "pro"}
            features={[
              "300 monthly credits + 5 daily (up to 450 / month)",
              "Credit rollover (up to 2× monthly)",
              "PDF upload up to 80 pages",
              "Auto-fix compilation (retries)",
              "Higher-quality formatting + structure",
              "Priority queue (faster)",
            ]}
            note="If you generate summaries/formula sheets regularly, this removes friction."
          />
        </div>

        {/* Manage Subscription (Pro users only) */}
        {currentPlan === "pro" && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={manageSubscription}
              className="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors"
            >
              Manage Subscription
            </button>
            <p className="mt-2 text-xs text-white/50">Update payment, view invoices, or cancel</p>
          </div>
        )}

        {/* FAQ */}
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <FaqItem
            q="What is a credit?"
            a="A credit is one generation. Larger PDFs or heavier formatting may consume more than one credit."
          />
          <FaqItem
            q="Can BetterNotes compile my LaTeX?"
            a="Yes. We compile in a sandboxed LaTeX environment and show a preview. Pro includes automatic retries for common errors."
          />
          <FaqItem q="Do credits roll over?" a="Pro credits roll over up to a cap (so you can save for exam season)." />
          <FaqItem q="Can I cancel anytime?" a="Yes — subscriptions are monthly and you can cancel anytime." />
        </div>

        <div className="mt-14 text-center text-xs text-white/50">
          Prices and limits are MVP defaults — you can adjust anytime as costs/usage become clearer.{" "}
          <Link href="/workspace" className="underline hover:text-white">
            Try it now
          </Link>
          .
        </div>
      </section>
    </main>
  );
}

/* ---------------- components ---------------- */

function PlanCard({
  name,
  price,
  period,
  tagline,
  features,
  note,
  ctaText,
  ctaHref,
  highlight,
  badge,
  onCtaClick,
  ctaDisabled,
  ctaLoading,
}: {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  note: string;
  ctaText: string;
  ctaHref: string;
  highlight: boolean;
  badge?: string;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border backdrop-blur p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_20px_60px_rgba(0,0,0,0.35)]",
        highlight ? "border-white/25 bg-white/12" : "border-white/12 bg-white/8",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-white/60 mt-1">{tagline}</div>
        </div>

        {badge && (
          <div className="text-xs rounded-full border border-white/20 bg-white/10 px-2 py-1 text-white/80">{badge}</div>
        )}
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="text-4xl font-semibold tracking-tight">{price}</div>
        {period && <div className="text-sm text-white/60 mb-1">{period}</div>}
      </div>

      {onCtaClick ? (
        <button
          type="button"
          onClick={onCtaClick}
          disabled={Boolean(ctaDisabled)}
          className={[
            "mt-5 block w-full text-center rounded-xl px-3 py-2 text-sm font-semibold",
            highlight
              ? "bg-white text-neutral-950 hover:bg-white/90"
              : "bg-white/10 border border-white/15 text-white hover:bg-white/15",
            ctaDisabled ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
        >
          {ctaLoading ? "Redirecting..." : ctaText}
        </button>
      ) : (
        <Link
          href={ctaHref}
          className={[
            "mt-5 block w-full text-center rounded-xl px-3 py-2 text-sm font-semibold",
            highlight
              ? "bg-white text-neutral-950 hover:bg-white/90"
              : "bg-white/10 border border-white/15 text-white hover:bg-white/15",
          ].join(" ")}
        >
          {ctaText}
        </Link>
      )}

      <ul className="mt-5 space-y-2 text-sm text-white/80">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="mt-[2px] inline-block h-4 w-4 rounded bg-emerald-400/20 border border-emerald-400/30" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 text-xs text-white/55">{note}</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/8 backdrop-blur p-5">
      <div className="font-semibold">{q}</div>
      <div className="mt-2 text-sm text-white/70">{a}</div>
    </div>
  );
}
