import Image from "next/image";

type Template = {
  id: string;
  name: string;
  format: string;
  publicPath: string;
  previewPath?: string;
  thumbnailPath?: string;
};

export default function TemplateCard({ t }: { t: Template }) {
  const href = t.previewPath ?? t.publicPath;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-neutral-200 bg-white p-3 shadow-sm hover:shadow-md transition"
    >
      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
        {t.thumbnailPath ? (
          <Image
            src={t.thumbnailPath}
            alt={`${t.name} preview`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            No preview
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="font-medium">{t.name}</div>
        <div className="text-xs text-neutral-500">{t.format.toUpperCase()}</div>
      </div>
    </a>
  );
}