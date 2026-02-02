// Helper for persisting workspace state in localStorage
// This allows users to continue their work after logging in

const STORAGE_KEY = "betternotes_workspace_draft";

export interface WorkspaceDraft {
    draftLatex: string;
    savedLatex: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    selectedTemplateId: string | null;
    savedAt: number; // timestamp
}

export function saveWorkspaceDraft(draft: Omit<WorkspaceDraft, "savedAt">): void {
    if (typeof window === "undefined") return;

    // Only save if there's actual content
    if (!draft.draftLatex && !draft.savedLatex && draft.messages.length <= 1) {
        return;
    }

    const data: WorkspaceDraft = {
        ...draft,
        savedAt: Date.now(),
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("Failed to save workspace draft:", e);
    }
}

export function loadWorkspaceDraft(): WorkspaceDraft | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const data = JSON.parse(raw) as WorkspaceDraft;

        // Check if draft is older than 7 days
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - data.savedAt > sevenDaysMs) {
            clearWorkspaceDraft();
            return null;
        }

        return data;
    } catch (e) {
        console.warn("Failed to load workspace draft:", e);
        return null;
    }
}

export function clearWorkspaceDraft(): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn("Failed to clear workspace draft:", e);
    }
}

export function hasWorkspaceDraft(): boolean {
    return loadWorkspaceDraft() !== null;
}
