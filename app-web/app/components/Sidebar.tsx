"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";
import { listProjects, type Project } from "@/lib/api";
import ThemeToggle from "./ThemeToggle";
import type { User } from "@supabase/supabase-js";

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [recentProjects, setRecentProjects] = useState<Project[]>([]);
    const [projectsExpanded, setProjectsExpanded] = useState(true);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement | null>(null);

    // Auth
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => setUser(session?.user ?? null)
        );
        return () => subscription.unsubscribe();
    }, []);

    // Load recent projects
    useEffect(() => {
        if (!user) { setRecentProjects([]); return; }
        listProjects({ limit: 5 }).then(setRecentProjects);
    }, [user]);

    // Close profile menu on outside click
    useEffect(() => {
        if (!profileMenuOpen) return;
        function handleClick(e: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [profileMenuOpen]);

    // Close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    async function handleSignOut() {
        await supabase.auth.signOut();
        setProfileMenuOpen(false);
        router.push("/");
    }

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + "/");

    const navItems = [
        { label: "Home", href: "/workspace", icon: HomeIcon },
        { label: "Playground", href: "/playground", icon: PlaygroundIcon },
        { label: "Projects", href: "/projects", icon: ProjectsIcon },
        { label: "Starred", href: "/projects?filter=starred", icon: StarredIcon, indent: true },
        { label: "Shared with me", href: "/projects?filter=shared", icon: SharedIcon, indent: true },
        { label: "Templates", href: "/templates", icon: TemplatesIcon },
        { label: "Universities", href: "/universities", icon: UniversitiesIcon },
        { label: "Pricing", href: "/pricing", icon: PricingIcon },
    ];

    const sidebarContent = (
        <div className="flex flex-col h-full">
            {/* Logo + Collapse */}
            <div className="px-4 py-4 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/15 text-white flex items-center justify-center font-bold text-sm backdrop-blur">
                        B
                    </div>
                    {!collapsed && (
                        <div>
                            <div className="text-sm font-semibold">BetterNotes</div>
                            <div className="text-[10px] text-white/50">AI Workspace</div>
                        </div>
                    )}
                </Link>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <svg className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                </button>
            </div>

            {/* New Project button */}
            {user && (
                <div className="px-3 mb-2">
                    <Link
                        href="/projects?new=true"
                        className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600/80 to-blue-600/80 hover:from-purple-500/80 hover:to-blue-500/80 border border-white/10 text-white text-sm font-medium transition-all ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                            }`}
                    >
                        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        {!collapsed && <span>New Project</span>}
                    </Link>
                </div>
            )}

            {/* Navigation */}
            <nav className="px-2 space-y-0.5">
                {navItems.map(({ label, href, icon: Icon, indent }) => (
                    <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 rounded-xl text-sm transition-colors ${collapsed ? "justify-center px-2 py-2.5" : indent ? "pl-9 pr-3 py-2" : "px-3 py-2.5"
                            } ${isActive(href)
                                ? "bg-white/12 text-white font-medium"
                                : "text-white/60 hover:bg-white/8 hover:text-white/90"
                            } ${indent && collapsed ? "hidden" : ""}`}
                        title={collapsed ? label : undefined}
                    >
                        <Icon className={`flex-shrink-0 ${indent ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                        {!collapsed && <span className={indent ? "text-[13px]" : ""}>{label}</span>}
                    </Link>
                ))}
            </nav>

            {/* Recent Projects */}
            {user && !collapsed && (
                <div className="mt-4 px-2 flex-1 overflow-y-auto">
                    <button
                        onClick={() => setProjectsExpanded(!projectsExpanded)}
                        className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-semibold text-white/40 uppercase tracking-wider hover:text-white/60"
                    >
                        <span>Recent</span>
                        <svg className={`h-3 w-3 transition-transform ${projectsExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {projectsExpanded && (
                        <div className="mt-1 space-y-0.5">
                            {recentProjects.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-white/30">No projects yet</div>
                            ) : (
                                recentProjects.map((p) => (
                                    <Link
                                        key={p.id}
                                        href={`/workspace/${p.id}`}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors truncate ${pathname === `/workspace/${p.id}`
                                            ? "bg-white/12 text-white"
                                            : "text-white/55 hover:bg-white/8 hover:text-white/85"
                                            }`}
                                    >
                                        <svg className="h-3.5 w-3.5 flex-shrink-0 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                        <span className="truncate">{p.title || "Untitled"}</span>
                                        {p.is_starred && (
                                            <svg className="h-3 w-3 text-yellow-400/70 flex-shrink-0 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                        )}
                                    </Link>
                                ))
                            )}
                            {recentProjects.length > 0 && (
                                <Link
                                    href="/projects"
                                    className="block px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors"
                                >
                                    View all →
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Spacer when collapsed */}
            {(collapsed || !user) && <div className="flex-1" />}

            {/* Search shortcut hint */}
            {!collapsed && (
                <div className="px-3 mb-2">
                    <button
                        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
                    >
                        <svg className="h-3.5 w-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" /></svg>
                        <span className="text-xs text-white/30 flex-1">Search…</span>
                        <kbd className="text-[9px] text-white/20 border border-white/10 bg-white/5 rounded px-1 py-0.5 font-mono">⌘K</kbd>
                    </button>
                </div>
            )}

            {/* Profile footer */}
            {user ? (
                <div ref={profileRef} className="relative border-t border-white/8 p-3">
                    <button
                        onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                        className={`flex items-center gap-3 w-full rounded-xl hover:bg-white/8 transition-colors ${collapsed ? "justify-center p-2" : "px-3 py-2.5"
                            }`}
                    >
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 border border-white/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-white/80">
                                {(user.email?.[0] || "U").toUpperCase()}
                            </span>
                        </div>
                        {!collapsed && (
                            <div className="flex-1 text-left min-w-0">
                                <div className="text-sm text-white/80 truncate">{user.email?.split("@")[0] || "User"}</div>
                                <div className="text-[10px] text-white/40 truncate">{user.email}</div>
                            </div>
                        )}
                    </button>

                    {profileMenuOpen && (
                        <div className={`absolute ${collapsed ? "left-full ml-2" : "left-3 right-3"} bottom-full mb-2 rounded-xl border border-white/15 bg-neutral-950/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.4)] py-1 z-50`}>
                            <Link href="/settings" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Settings
                            </Link>
                            <Link href="/pricing" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                                </svg>
                                Plans
                            </Link>
                            <div className="px-3 py-2">
                                <ThemeToggle />
                            </div>
                            <div className="h-px bg-white/10 my-1" />
                            <button onClick={handleSignOut} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-300/80 hover:bg-red-500/10 hover:text-red-300">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                                </svg>
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="border-t border-white/8 p-3 space-y-2">
                    <Link href="/login" className={`block text-center rounded-xl border border-white/20 bg-white/8 text-sm text-white/80 hover:bg-white/12 transition-colors ${collapsed ? "px-2 py-2" : "px-3 py-2"}`}>
                        {collapsed ? "→" : "Log in"}
                    </Link>
                </div>
            )}
        </div>
    );

    return (
        <>
            {/* Mobile hamburger */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden fixed top-4 left-4 z-50 h-10 w-10 rounded-xl border border-white/20 bg-neutral-950/80 backdrop-blur flex items-center justify-center"
                aria-label="Toggle navigation"
            >
                <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    {mobileOpen
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    }
                </svg>
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            )}

            {/* Sidebar panel */}
            <aside className={`
                fixed md:relative z-40 top-0 left-0 h-screen
                border-r border-white/8 bg-neutral-950/70 backdrop-blur-xl
                transition-all duration-200 ease-out
                ${collapsed ? "md:w-[72px]" : "md:w-[260px]"}
                ${mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full md:translate-x-0"}
            `}>
                {sidebarContent}
            </aside>
        </>
    );
}


// ── Icon components ─────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
    );
}

function ProjectsIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
    );
}

function TemplatesIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
    );
}

function UniversitiesIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
    );
}

function PricingIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
    );
}

function StarredIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
    );
}

function SharedIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
    );
}

function PlaygroundIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
    );
}
