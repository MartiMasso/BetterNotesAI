import Image from "next/image";

type Template = {
  id: string;
  name: string;
  format: string;
  publicPath: string;
  previewPath?: string;
  thumbnailPath?: string;
  isPro?: boolean;
};

export default function TemplateCardSelect({
  t,
  selected,
  onSelect,
  onPreview,
  userIsPro = false,
  onProBlocked,
}: {
  t: Template;
  selected: boolean;
  onSelect: () => void;
  onPreview?: () => void;
  userIsPro?: boolean;
  onProBlocked?: () => void;
}) {
  const isPro = t.isPro ?? false;
  const isLocked = isPro && !userIsPro;

  function handleSelect() {
    if (isLocked && onProBlocked) {
      onProBlocked();
      return;
    }
    onSelect();
  }

  function handlePreview(event: React.MouseEvent) {
    event.stopPropagation();
    if (onPreview) onPreview();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelect();
        }
      }}
      className={[
        "relative rounded-2xl border p-3 backdrop-blur transition",
        selected
          ? "border-emerald-400/80 bg-emerald-400/15 ring-2 ring-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
          : isLocked
            ? "border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10 cursor-pointer"
            : "border-white/12 bg-white/5 hover:bg-white/10",
      ].join(" ")}
    >
      {/* PRO Badge */}
      {isPro && (
        <div className="absolute left-3 top-3 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg z-10">
          PRO
        </div>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleSelect();
        }}
        aria-pressed={selected}
        className={[
          "absolute right-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-semibold border z-10",
          selected
            ? "border-emerald-400/80 bg-emerald-400 text-emerald-950"
            : isLocked
              ? "border-amber-400/50 bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
              : "border-white/15 bg-white/10 text-white/80 hover:bg-white/15",
        ].join(" ")}
      >
        {selected ? "Selected" : isLocked ? "Unlock" : "Select"}
      </button>

      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-xl bg-white/5 border border-white/10">
        {t.thumbnailPath ? (
          <Image
            src={t.thumbnailPath}
            alt={`${t.name} preview`}
            fill
            className={["object-cover", isLocked ? "opacity-60" : ""].join(" ")}
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            No preview
          </div>
        )}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{t.name}</div>
          <div className="text-xs text-white/60">{t.format.toUpperCase()}</div>
        </div>
        {onPreview && (
          <button
            type="button"
            onClick={handlePreview}
            className="rounded-lg p-2 border border-white/15 bg-white/5 hover:bg-white/15 transition-colors"
            title="Preview template"
          >
            <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
