"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type StepState = "pending" | "active" | "done";

type StepsContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
};

const StepsContext = createContext<StepsContextValue | null>(null);

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type StepsProps = PropsWithChildren<{
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  className?: string;
}>;

export function Steps({
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
}: StepsProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? internalOpen;

  const value = useMemo<StepsContextValue>(() => {
    return {
      open: resolvedOpen,
      setOpen: (next) => {
        if (open === undefined) setInternalOpen(next);
        onOpenChange?.(next);
      },
    };
  }, [resolvedOpen, open, onOpenChange]);

  return (
    <StepsContext.Provider value={value}>
      <div className={joinClasses("space-y-2", className)}>{children}</div>
    </StepsContext.Provider>
  );
}

type StepsTriggerProps = PropsWithChildren<{
  className?: string;
}>;

export function StepsTrigger({ children, className }: StepsTriggerProps) {
  const ctx = useContext(StepsContext);
  if (!ctx) {
    throw new Error("StepsTrigger must be used within <Steps>");
  }

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      aria-expanded={ctx.open}
      className={joinClasses(
        "group flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-left hover:bg-white/8",
        className,
      )}
    >
      <span className="min-w-0">{children}</span>
      <svg
        className={joinClasses(
          "h-4 w-4 shrink-0 text-white/40 transition-transform",
          ctx.open && "rotate-180",
        )}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.12l3.71-3.9a.75.75 0 0 1 1.08 1.04l-4.25 4.46a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

type StepsContentProps = PropsWithChildren<{
  className?: string;
}>;

export function StepsContent({ children, className }: StepsContentProps) {
  const ctx = useContext(StepsContext);
  if (!ctx) {
    throw new Error("StepsContent must be used within <Steps>");
  }
  if (!ctx.open) return null;

  return (
    <div className={joinClasses("rounded-lg border border-white/10 bg-black/20 p-2", className)}>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

type StepsItemProps = PropsWithChildren<{
  state?: StepState;
  className?: string;
}>;

export function StepsItem({
  children,
  state = "pending",
  className,
}: StepsItemProps) {
  const dotClass =
    state === "done"
      ? "bg-emerald-300 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]"
      : state === "active"
        ? "bg-cyan-200 shadow-[0_0_0_3px_rgba(34,211,238,0.12)]"
        : "bg-white/25";

  const textClass =
    state === "done"
      ? "text-white/85"
      : state === "active"
        ? "text-cyan-100"
        : "text-white/50";

  return (
    <div className={joinClasses("flex items-center gap-2 rounded-md px-1.5 py-1", className)}>
      <span className={joinClasses("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden />
      <span className={joinClasses("text-xs", textClass)}>{children}</span>
    </div>
  );
}

