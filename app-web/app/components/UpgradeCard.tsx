"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

export default function UpgradeCard() {
    const [hidden, setHidden] = useState(true); // hidden by default until we know

    useEffect(() => {
        let mounted = true;

        async function checkPlan() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    // Not logged in — show the card (encourage signup → upgrade)
                    if (mounted) setHidden(false);
                    return;
                }

                const { data: profile } = await supabase
                    .from("profiles")
                    .select("plan")
                    .eq("id", user.id)
                    .maybeSingle();

                if (mounted) {
                    setHidden(profile?.plan === "pro");
                }
            } catch {
                // Fail open — show the card
                if (mounted) setHidden(false);
            }
        }

        checkPlan();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            checkPlan();
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    if (hidden) return null;

    return (
        <div className="mt-auto p-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                <div className="text-sm font-medium">Upgrade to Pro</div>
                <div className="text-xs text-white/60 mt-1">
                    Unlock more generations and bigger files.
                </div>
                <Link
                    href="/pricing"
                    className="mt-3 block w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90 text-center"
                >
                    Upgrade
                </Link>
            </div>
        </div>
    );
}
