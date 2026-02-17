"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    getProfile, updateProfile,
    listUniversities, listPrograms,
    type UserProfile, type University, type DegreeProgram,
} from "@/lib/api";
import { uploadAvatar } from "@/lib/storage";

export default function ProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Form state
    const [displayName, setDisplayName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [universityId, setUniversityId] = useState<string | null>(null);
    const [programId, setProgramId] = useState<string | null>(null);

    // Dropdowns
    const [universities, setUniversities] = useState<University[]>([]);
    const [programs, setPrograms] = useState<DegreeProgram[]>([]);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function init() {
            const [p, unis] = await Promise.all([getProfile(), listUniversities()]);
            if (!p) { router.push("/login"); return; }
            setProfile(p);
            setDisplayName(p.display_name || "");
            setAvatarUrl(p.avatar_url || "");
            setUniversityId(p.university_id);
            setProgramId(p.degree_program_id);
            setUniversities(unis);
            if (p.university_id) {
                const progs = await listPrograms(p.university_id);
                setPrograms(progs);
            }
            setLoading(false);
        }
        init();
    }, [router]);

    useEffect(() => {
        if (!universityId) { setPrograms([]); setProgramId(null); return; }
        listPrograms(universityId).then(setPrograms);
    }, [universityId]);

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = await uploadAvatar(file);
        if (url) {
            setAvatarUrl(url);
        }
    }

    async function handleSave() {
        setSaving(true);
        setSaved(false);
        const ok = await updateProfile({
            display_name: displayName.trim() || undefined,
            avatar_url: avatarUrl || undefined,
            university_id: universityId,
            degree_program_id: programId,
        });
        if (ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
        setSaving(false);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-white/40 text-sm">Loading profile…</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 md:p-10 max-w-xl mx-auto">
            <button onClick={() => router.push("/settings")} className="text-xs text-white/40 hover:text-white/60 mb-4 flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                Settings
            </button>
            <h1 className="text-2xl font-bold mb-1">Profile</h1>
            <p className="text-white/50 text-sm mb-8">Customize how you appear across BetterNotes.</p>

            {/* Avatar */}
            <div className="mb-8">
                <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-3">Avatar</label>
                <div className="flex items-center gap-4">
                    <button onClick={() => avatarInputRef.current?.click()} className="h-16 w-16 rounded-2xl bg-white/10 border border-white/10 overflow-hidden hover:border-white/25 transition-colors flex-shrink-0 flex items-center justify-center">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <svg className="h-6 w-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                            </svg>
                        )}
                    </button>
                    <div>
                        <button onClick={() => avatarInputRef.current?.click()} className="text-xs text-white/60 hover:text-white/80 underline underline-offset-2">Upload photo</button>
                        <div className="text-[10px] text-white/20 mt-0.5">JPG, PNG, or WebP. Max 1MB.</div>
                    </div>
                    <input ref={avatarInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAvatarUpload} />
                </div>
            </div>

            {/* Display name */}
            <div className="mb-6">
                <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">Display Name</label>
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name…"
                    className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none placeholder:text-white/35 text-white focus:border-white/25 transition-colors"
                />
            </div>

            {/* Email (read-only) */}
            <div className="mb-6">
                <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">Email</label>
                <div className="h-10 rounded-xl border border-white/8 bg-white/[0.02] px-3 text-sm flex items-center text-white/40">{profile?.email || "—"}</div>
            </div>

            {/* University */}
            <div className="mb-6">
                <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">University</label>
                <select
                    value={universityId || ""}
                    onChange={(e) => setUniversityId(e.target.value || null)}
                    className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none text-white appearance-none cursor-pointer"
                >
                    <option value="" className="bg-neutral-900">Select university…</option>
                    {universities.map((u) => (
                        <option key={u.id} value={u.id} className="bg-neutral-900">{u.name}</option>
                    ))}
                </select>
            </div>

            {/* Degree program */}
            {universityId && (
                <div className="mb-6">
                    <label className="text-xs text-white/30 uppercase tracking-wider font-semibold block mb-2">Degree Program</label>
                    <select
                        value={programId || ""}
                        onChange={(e) => setProgramId(e.target.value || null)}
                        className="w-full h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none text-white appearance-none cursor-pointer"
                    >
                        <option value="" className="bg-neutral-900">Select program…</option>
                        {programs.map((p) => (
                            <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Save */}
            <div className="flex items-center gap-3 pt-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${saving ? "bg-white/15 text-white/40 cursor-not-allowed" : "bg-white text-neutral-950 hover:bg-white/90"}`}
                >
                    {saving ? "Saving…" : "Save changes"}
                </button>
                {saved && <span className="text-xs text-emerald-400 animate-pulse">Saved ✓</span>}
            </div>
        </div>
    );
}
