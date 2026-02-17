"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

// ── Types ──
interface ConfirmOptions {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "default" | "info";
}

interface PromptOptions {
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
}

interface DialogContextValue {
    showConfirm: (options: ConfirmOptions) => Promise<boolean>;
    showPrompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue>({
    showConfirm: () => Promise.resolve(false),
    showPrompt: () => Promise.resolve(null),
});

export function useDialog() {
    return useContext(DialogContext);
}

type DialogState =
    | { type: "confirm"; options: ConfirmOptions; resolve: (val: boolean) => void }
    | { type: "prompt"; options: PromptOptions; resolve: (val: string | null) => void }
    | null;

export function DialogProvider({ children }: { children: React.ReactNode }) {
    const [dialog, setDialog] = useState<DialogState>(null);

    const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setDialog({ type: "confirm", options, resolve });
        });
    }, []);

    const showPrompt = useCallback((options: PromptOptions): Promise<string | null> => {
        return new Promise((resolve) => {
            setDialog({ type: "prompt", options, resolve });
        });
    }, []);

    function close(result: boolean | string | null) {
        if (!dialog) return;
        if (dialog.type === "confirm") {
            (dialog.resolve as (v: boolean) => void)(result as boolean);
        } else {
            (dialog.resolve as (v: string | null) => void)(result as string | null);
        }
        setDialog(null);
    }

    return (
        <DialogContext.Provider value={{ showConfirm, showPrompt }}>
            {children}
            {dialog && <DialogOverlay dialog={dialog} onClose={close} />}
        </DialogContext.Provider>
    );
}

function DialogOverlay({ dialog, onClose }: { dialog: NonNullable<DialogState>; onClose: (result: boolean | string | null) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState(
        dialog.type === "prompt" ? dialog.options.defaultValue || "" : ""
    );

    useEffect(() => {
        if (dialog.type === "prompt" && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [dialog.type]);

    // Handle Escape
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose(dialog.type === "confirm" ? false : null);
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [dialog.type, onClose]);

    const isConfirm = dialog.type === "confirm";
    const opts = dialog.options;
    const variant = isConfirm ? (opts as ConfirmOptions).variant || "default" : "default";

    const confirmBtnClass = variant === "danger"
        ? "bg-red-600 hover:bg-red-500 text-white"
        : "bg-white text-neutral-950 hover:bg-white/90";

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ animation: "fadeIn 0.15s ease-out" }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onClose(isConfirm ? false : null)} />
            <div className="relative rounded-2xl border border-white/15 bg-neutral-900/95 backdrop-blur-xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ animation: "scaleIn 0.2s ease-out" }}>
                <h3 className="text-base font-semibold text-white mb-1">
                    {opts.title}
                </h3>
                {opts.message && <p className="text-sm text-white/50 mb-4">{opts.message}</p>}

                {dialog.type === "prompt" && (
                    <input
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) onClose(inputValue.trim()); }}
                        placeholder={(opts as PromptOptions).placeholder || ""}
                        className="w-full h-10 rounded-xl border border-white/15 bg-black/30 px-3 text-sm outline-none text-white placeholder:text-white/30 mb-4 focus:border-white/30 transition-colors"
                    />
                )}

                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => onClose(isConfirm ? false : null)}
                        className="rounded-xl px-4 py-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 text-white/70"
                    >
                        {(isConfirm ? (opts as ConfirmOptions).cancelText : (opts as PromptOptions).cancelText) || "Cancel"}
                    </button>
                    <button
                        onClick={() => onClose(isConfirm ? true : (inputValue.trim() || null))}
                        disabled={dialog.type === "prompt" && !inputValue.trim()}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${confirmBtnClass}`}
                    >
                        {(isConfirm ? (opts as ConfirmOptions).confirmText : (opts as PromptOptions).confirmText) || "OK"}
                    </button>
                </div>
            </div>
        </div>
    );
}
