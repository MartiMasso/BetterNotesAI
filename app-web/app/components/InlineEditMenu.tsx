"use client";

import { useEffect, useRef, useState } from "react";

interface InlineEditMenuProps {
    /** The textarea/element ref the menu should track */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Fires when the user selects an action on highlighted text */
    onAction: (action: "change" | "explain" | "delete", selectedText: string) => void;
}

export default function InlineEditMenu({ containerRef, onAction }: InlineEditMenuProps) {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [selection, setSelection] = useState("");
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        function handleSelection() {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text || !el) { setVisible(false); return; }

            // Make sure the selection is within our container
            if (!el.contains(sel?.anchorNode || null)) { setVisible(false); return; }

            const range = sel?.getRangeAt(0);
            if (!range) { setVisible(false); return; }

            const rect = range.getBoundingClientRect();
            const containerRect = el.getBoundingClientRect();

            setPosition({
                top: rect.top - containerRect.top - 40,
                left: rect.left - containerRect.left + rect.width / 2,
            });
            setSelection(text);
            setVisible(true);
        }

        document.addEventListener("selectionchange", handleSelection);
        return () => document.removeEventListener("selectionchange", handleSelection);
    }, [containerRef]);

    if (!visible || !selection) return null;

    const actions = [
        { key: "change" as const, label: "Change", icon: "✏️" },
        { key: "explain" as const, label: "Explain", icon: "💡" },
        { key: "delete" as const, label: "Delete", icon: "🗑" },
    ];

    return (
        <div
            ref={menuRef}
            className="absolute z-50 flex items-center gap-0.5 rounded-xl border border-white/15 bg-neutral-900/95 backdrop-blur-xl shadow-xl p-1"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: "translateX(-50%)",
            }}
        >
            {actions.map(({ key, label, icon }) => (
                <button
                    key={key}
                    onClick={() => {
                        onAction(key, selection);
                        setVisible(false);
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
                >
                    <span className="text-[10px]">{icon}</span>
                    {label}
                </button>
            ))}
        </div>
    );
}
