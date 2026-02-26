"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type ThinkingBarProps = {
  text: string;
  stopLabel?: string;
  onStop?: () => void;
  onClick?: () => void;
  className?: string;
  rightSlot?: ReactNode;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ThinkingBar({
  text,
  stopLabel,
  onStop,
  onClick,
  className,
  rightSlot,
}: ThinkingBarProps) {
  const clickable = typeof onClick === "function";

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  }

  function handleStopClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onStop?.();
  }

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={joinClasses(
        "relative overflow-hidden rounded-xl border border-cyan-300/20 bg-gradient-to-r from-cyan-400/10 via-white/5 to-emerald-400/10 p-3",
        clickable && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-300/40",
        className,
      )}
      aria-label={text}
    >
      <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="thinking-bar-slider h-full w-20 rounded-full bg-gradient-to-r from-cyan-300/70 to-emerald-300/70" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <div className="flex items-center gap-1" aria-hidden>
            <span className="thinking-bar-dot h-1.5 w-1.5 rounded-full bg-cyan-200" />
            <span className="thinking-bar-dot h-1.5 w-1.5 rounded-full bg-cyan-200" style={{ animationDelay: "0.15s" }} />
            <span className="thinking-bar-dot h-1.5 w-1.5 rounded-full bg-cyan-200" style={{ animationDelay: "0.3s" }} />
          </div>
          <span className="truncate text-xs font-medium text-white/90">{text}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
          {stopLabel && onStop && (
            <button
              type="button"
              onClick={handleStopClick}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/75 hover:bg-white/10 hover:text-white"
            >
              {stopLabel}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .thinking-bar-slider {
          animation: thinkingBarSlide 1.8s ease-in-out infinite;
        }
        .thinking-bar-dot {
          animation: thinkingBarDot 0.9s ease-in-out infinite;
        }
        @keyframes thinkingBarSlide {
          0% { transform: translateX(-140%); opacity: 0.35; }
          50% { opacity: 1; }
          100% { transform: translateX(420%); opacity: 0.35; }
        }
        @keyframes thinkingBarDot {
          0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-1px); }
        }
      `}</style>
    </div>
  );
}

