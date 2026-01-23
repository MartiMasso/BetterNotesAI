"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Background from "./components/Background";
import { supabase } from "@/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [menuOpen]);

  function onSend() {
    if (!prompt.trim()) return;
    router.push("/workspace");
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
  }

  return (
    <main className="relative min-h-screen text-white">
      {/* Make background non-interactive and behind everything */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Background />
      </div>

      {/* Top nav */}
      <header className="relative z-10 mx-auto max-w-6xl px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center font-semibold shadow-sm backdrop-blur">
            B
          </div>
          <div className="font-semibold tracking-tight">BetterNotes</div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
          <Link className="hover:text-white" href="/pricing">
            Pricing
          </Link>
          <Link className="hover:text-white" href="/discover">
            Discover
          </Link>
          <Link className="hover:text-white" href="/templates">
            Templates
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="h-10 w-10 rounded-full border border-white/20 bg-white/10 hover:bg-white/15 flex items-center justify-center"
                aria-label="Open account menu"
              >
                <svg
                  className="h-5 w-5 text-white/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M19 21a7 7 0 0 0-14 0" />
                  <circle cx="12" cy="8" r="4" />
                </svg>
              </button>

              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/15 bg-neutral-950/90 backdrop-blur p-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                  <div className="px-3 py-2 text-xs text-white/60">
                    {user.email ?? "Signed in"}
                  </div>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={onSignOut}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 backdrop-blur"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Introducing BetterNotes MVP
        </div>

        <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight">
          Turn messy notes into{" "}
          <span className="bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-emerald-400 bg-clip-text text-transparent">
            clean LaTeX
          </span>{" "}
          + PDF
        </h1>

        <p className="mt-4 text-white/70">
          Upload lecture slides or notes and generate a formula sheet, summary, or cheatsheet in seconds.
        </p>

        {/* Prompt box */}
        <div className="mt-10 mx-auto max-w-3xl rounded-2xl border border-white/20 bg-white/10 p-3 text-left backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2">
            <button
              className="h-10 w-10 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 flex items-center justify-center"
              title="Attach (coming soon)"
            >
              <span className="text-lg">＋</span>
            </button>

            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) onSend();
              }}
              className="h-10 flex-1 rounded-xl border border-white/20 bg-black/20 px-3 text-sm outline-none placeholder:text-white/50 text-white"
              placeholder="e.g. Make a formula sheet from my Quantum Mechanics lecture notes"
            />

            <button
              onClick={onSend}
              className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-neutral-950 hover:bg-white/90"
            >
              Build now →
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip onClick={() => setPrompt("Generate a formula sheet (equations + definitions only).")}>
              Formula sheet
            </Chip>
            <Chip onClick={() => setPrompt("Create a clean summary with sections and key definitions.")}>
              Summary notes
            </Chip>
            <Chip onClick={() => setPrompt("Extract key results, theorems, and final formulas.")}>
              Key results
            </Chip>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-white/60">
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1">PDF → LaTeX</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1">Compile Preview</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1">Download PDF/.tex</span>
          </div>
        </div>
      </section>

      {/* Templates */}
      <section id="templates" className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Discover templates</h2>
            <p className="text-sm text-white/65">Start your next project with a template</p>
          </div>
          <Link href="/discover" className="text-sm text-white/70 hover:text-white">
            View all →
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TemplateCard title="Formula Sheet" subtitle="Equations + definitions only" emoji="∑" />
          <TemplateCard title="Summary Notes" subtitle="Structured notes with clean sections" emoji="✦" />
          <TemplateCard title="Flashcards" subtitle="Turn notes into Q/A cards" emoji="⌁" />
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-white/50">
        © {new Date().getFullYear()} BetterNotes — MVP
      </footer>
    </main>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
    >
      {children}
    </button>
  );
}

function TemplateCard({ title, subtitle, emoji }: { title: string; subtitle: string; emoji: string }) {
  return (
    <Link
      href="/discover"
      className="block rounded-2xl border border-white/20 bg-white/10 p-4 hover:bg-white/15 backdrop-blur shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_20px_60px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="h-9 w-9 rounded-xl bg-white/15 border border-white/20 text-white flex items-center justify-center text-sm">
          {emoji}
        </div>
      </div>
      <div className="mt-2 text-xs text-white/65">{subtitle}</div>
      <div className="mt-4 text-xs text-white/60">Use template →</div>
    </Link>
  );
}
