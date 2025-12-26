import Link from "next/link";
import AppBackground from "../components/AppBackground";

export default function PricingPage() {
  return (
    <main className="relative min-h-screen text-white">
      <AppBackground />

      {/* Top bar */}
      <header className="mx-auto max-w-6xl px-4 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center font-semibold">
            B
          </div>
          <div className="font-semibold tracking-tight">BetterNotes</div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
          <Link className="hover:text-white" href="/discover">Discover</Link>
          <Link className="hover:text-white" href="/workspace">Workspace</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/workspace"
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 backdrop-blur"
          >
            Log in
          </Link>
          <Link
            href="/workspace"
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Content */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Student-friendly pricing
          </h1>
          <p className="mt-3 text-white/70 max-w-2xl mx-auto">
            Generate clean LaTeX from PDFs and compile beautiful PDFs. Start free, upgrade when you need bigger files,
            faster generation, and more monthly credits.
          </p>
        </div>

        {/* Cards */}
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <PlanCard
            name="Free"
            price="$0"
            tagline="Generous enough to be useful"
            highlight={false}
            ctaText="Start free"
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
            price="$15"
            period="/month"
            tagline="For students who use it every week"
            highlight
            badge="Most popular"
            ctaText="Upgrade to Pro"
            ctaHref="/workspace"
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

          <PlanCard
            name="Teams"
            price="$49"
            period="/month"
            tagline="For study groups & classes"
            highlight={false}
            ctaText="Contact us"
            ctaHref="/discover"
            features={[
              "1,200 credits / month (shared pool)",
              "Shared projects & templates",
              "Roles & permissions",
              "Team history + storage",
              "Priority support",
            ]}
            note="Great for shared study notes, labs, and group exam prep."
          />
        </div>

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
          <FaqItem
            q="Do credits roll over?"
            a="Pro credits roll over up to a cap (so you can save for exam season)."
          />
          <FaqItem
            q="Can I cancel anytime?"
            a="Yes — subscriptions are monthly and you can cancel anytime."
          />
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
          <div className="text-xs rounded-full border border-white/20 bg-white/10 px-2 py-1 text-white/80">
            {badge}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="text-4xl font-semibold tracking-tight">{price}</div>
        {period && <div className="text-sm text-white/60 mb-1">{period}</div>}
      </div>

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