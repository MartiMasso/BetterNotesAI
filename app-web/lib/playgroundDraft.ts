// lib/playgroundDraft.ts — localStorage persistence for playground sessions
// Same pattern as workspaceDraft.ts but for the LaTeX Playground IDE

const STORAGE_KEY = "betternotes_playground";

export interface PlaygroundSession {
    sessionName: string;
    files: { path: string; content: string }[];
    activeFilePath: string;
    splitRatio: number;
    savedAt: number;
}

export function savePlaygroundDraft(draft: Omit<PlaygroundSession, "savedAt">): void {
    if (typeof window === "undefined") return;

    // Only save if there's actual content
    if (!draft.files.length || !draft.files.some((f) => f.content.trim())) return;

    const data: PlaygroundSession = {
        ...draft,
        savedAt: Date.now(),
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("Failed to save playground draft:", e);
    }
}

export function loadPlaygroundDraft(): PlaygroundSession | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const data = JSON.parse(raw) as PlaygroundSession;

        // Check if draft is older than 7 days
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - data.savedAt > sevenDaysMs) {
            clearPlaygroundDraft();
            return null;
        }

        return data;
    } catch (e) {
        console.warn("Failed to load playground draft:", e);
        return null;
    }
}

export function clearPlaygroundDraft(): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn("Failed to clear playground draft:", e);
    }
}

export function hasPlaygroundDraft(): boolean {
    return loadPlaygroundDraft() !== null;
}
