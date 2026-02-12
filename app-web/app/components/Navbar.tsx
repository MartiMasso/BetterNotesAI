"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  async function onSignOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
  }

  return (
    <>
      <header className="relative z-10 mx-auto max-w-6xl px-4 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center font-semibold shadow-sm backdrop-blur">
            B
          </div>
          <div className="font-semibold tracking-tight">BetterNotes</div>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
          <Link className="hover:text-white transition-colors" href="/workspace">
            Workspace
          </Link>
          <Link className="hover:text-white transition-colors" href="/templates">
            Templates
          </Link>
          <Link className="hover:text-white transition-colors" href="/pricing">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="md:hidden h-10 w-10 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 flex items-center justify-center backdrop-blur"
            aria-label="Toggle menu"
          >
            <svg
              className="h-5 w-5 text-white/80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {mobileNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

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
                  <div className="px-3 py-2 text-xs text-white/60">{user.email ?? "Signed in"}</div>
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

      {mobileNavOpen && (
        <div className="md:hidden relative z-20 mx-4 mb-4 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.35)]">
          <Link
            href="/workspace"
            onClick={() => setMobileNavOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            Workspace
          </Link>
          <Link
            href="/templates"
            onClick={() => setMobileNavOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            Templates
          </Link>
          <Link
            href="/pricing"
            onClick={() => setMobileNavOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
          >
            Pricing
          </Link>
        </div>
      )}
    </>
  );
}
