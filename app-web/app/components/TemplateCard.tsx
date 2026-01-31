"use client";

import Image from "next/image";

type Template = {
  id: string;
  name: string;
  format: string;
  publicPath: string;
  previewPath?: string;
  thumbnailPath?: string;
};

interface TemplateCardProps {
  t: Template;
  onClick?: (template: Template) => void;
}

export default function TemplateCard({ t, onClick }: TemplateCardProps) {
  function handleClick(e: React.MouseEvent) {
    if (onClick) {
      e.preventDefault();
      onClick(t);
    }
  }

  const href = t.previewPath ?? t.publicPath;

  return (
    <a
      href={onClick ? "#" : href}
      target={onClick ? undefined : "_blank"}
      rel="noreferrer"
      onClick={handleClick}
      className="block rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md hover:bg-accent/50 transition cursor-pointer"
    >
      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        {t.thumbnailPath ? (
          <Image
            src={t.thumbnailPath}
            alt={`${t.name} preview`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No preview
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="font-medium text-card-foreground">{t.name}</div>
        <div className="text-xs text-muted-foreground">{t.format.toUpperCase()}</div>
      </div>
    </a>
  );
}
