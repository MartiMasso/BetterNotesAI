"use client";

import { useEffect, useState } from "react";
import { updateProfile } from "@/lib/api";

type Theme = "light" | "dark" | "system";

function getStoredTheme(): Theme {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("betternotes-theme") as Theme) || "dark";
}

function resolveTheme(theme: Theme): "light" | "dark" {
    if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
}

function applyTheme(theme: Theme) {
    const resolved = resolveTheme(theme);
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.classList.toggle("light", resolved === "light");
}

export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        const stored = getStoredTheme();
        setTheme(stored);
        applyTheme(stored);
    }, []);

    async function handleChange(t: Theme) {
        setTheme(t);
        localStorage.setItem("betternotes-theme", t);
        applyTheme(t);

        // Sync to DB so theme persists across devices
        const dbTheme = t === "system" ? resolveTheme(t) : t;
        await updateProfile({ theme: dbTheme });
    }

    const options: { value: Theme; label: string; icon: string }[] = [
        { value: "light", label: "Light", icon: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" },
        { value: "dark", label: "Dark", icon: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" },
        { value: "system", label: "System", icon: "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25h-13.5A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25h-13.5A2.25 2.25 0 013 12V5.25" },
    ];

    return (
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
            {options.map(({ value, label, icon }) => (
                <button
                    key={value}
                    onClick={() => handleChange(value)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${theme === value ? "bg-white/12 text-white font-medium" : "text-white/40 hover:text-white/60"}`}
                    title={label}
                >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                    <span className="hidden sm:inline">{label}</span>
                </button>
            ))}
        </div>
    );
}
