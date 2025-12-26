import Image from "next/image";

type Template = {
  id: string;
  name: string;
  format: string;
  publicPath: string;
  previewPath?: string;
  thumbnailPath?: string;
};

export default function TemplateCardSelect({
  t,
  selected,
  onSelect,
}: {
  t: Template;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "relative rounded-2xl border p-3 backdrop-blur transition",
        selected
          ? "border-emerald-400/80 bg-emerald-400/15 ring-2 ring-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
          : "border-white/12 bg-white/5 hover:bg-white/10",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        aria-pressed={selected}
        className={[
          "absolute right-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-semibold border",
          selected
            ? "border-emerald-400/80 bg-emerald-400 text-emerald-950"
            : "border-white/15 bg-white/10 text-white/80 hover:bg-white/15",
        ].join(" ")}
      >
        {selected ? "Selected" : "Select"}
      </button>

      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-xl bg-white/5 border border-white/10">
        {t.thumbnailPath ? (
          <Image
            src={t.thumbnailPath}
            alt={`${t.name} preview`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            No preview
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-sm font-semibold text-white">{t.name}</div>
        <div className="text-xs text-white/60">{t.format.toUpperCase()}</div>
      </div>
    </div>
  );
}
