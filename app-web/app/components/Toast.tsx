"use client";

import { useEffect, useState, createContext, useContext, useCallback, useRef } from "react";

// ── Types ──
interface ToastItem {
    id: number;
    message: string;
    type: "success" | "error" | "info" | "warning";
    duration: number;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastItem["type"], duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
    toast: () => { },
});

export function useToast() {
    return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const toast = useCallback((message: string, type: ToastItem["type"] = "info", duration = 4000) => {
        const id = ++nextId;
        setToasts((prev) => [...prev, { id, message, type, duration }]);
    }, []);

    const remove = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast container */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <ToastBubble key={t.id} item={t} onDone={() => remove(t.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastBubble({ item, onDone }: { item: ToastItem; onDone: () => void }) {
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setExiting(true), item.duration);
        return () => clearTimeout(timer);
    }, [item.duration]);

    useEffect(() => {
        if (exiting) {
            const timer = setTimeout(onDone, 300);
            return () => clearTimeout(timer);
        }
    }, [exiting, onDone]);

    const colors: Record<string, string> = {
        success: "border-emerald-400/25 bg-emerald-500/15 text-emerald-200",
        error: "border-red-400/25 bg-red-500/15 text-red-200",
        warning: "border-amber-400/25 bg-amber-500/15 text-amber-200",
        info: "border-blue-400/25 bg-blue-500/15 text-blue-200",
    };

    const icons: Record<string, React.ReactNode> = {
        success: <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>,
        error: <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
        warning: <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>,
        info: <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>,
    };

    return (
        <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm backdrop-blur-xl shadow-2xl transition-all duration-300 max-w-sm ${colors[item.type]} ${exiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}`}
            style={{ animation: exiting ? undefined : "toastSlideIn 0.3s ease-out" }}
        >
            {icons[item.type]}
            <span className="flex-1">{item.message}</span>
            <button onClick={() => setExiting(true)} className="text-white/30 hover:text-white/60 ml-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
}
