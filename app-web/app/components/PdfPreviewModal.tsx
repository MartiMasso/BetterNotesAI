"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  title: string;
  templateId?: string;
  isPro?: boolean;
  userIsPro?: boolean;
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  title,
  templateId,
  isPro = false,
  userIsPro = false
}: PdfPreviewModalProps) {
  const router = useRouter();
  const isLocked = isPro && !userIsPro;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  function handleUseTemplate() {
    if (isLocked) {
      router.push("/pricing");
      onClose();
      return;
    }
    if (templateId) router.push(`/workspace?template=${templateId}`);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-5xl h-[92vh] flex flex-col rounded-2xl border border-white/20 bg-neutral-900/95 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_25px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white truncate pr-4">{title}</h2>
            {isPro && (
              <span className="rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                PRO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {templateId && (
              <button
                onClick={handleUseTemplate}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                  isLocked
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                    : "bg-white text-neutral-950 hover:bg-white/90"
                ].join(" ")}
              >
                {isLocked ? "Upgrade to Pro →" : "Use this template →"}
              </button>
            )}
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-colors"
            >
              Open in new tab ↗
            </a>
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5 text-white/80"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-3">
          <iframe
            src={pdfUrl}
            className="w-full h-full rounded-xl bg-white"
            title={`Preview: ${title}`}
          />
        </div>
      </div>
    </div>
  );
}

