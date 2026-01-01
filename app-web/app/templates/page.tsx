import TemplateCard from "@/app/components/TemplateCard";
import { templates } from "@/lib/templates";

export default function TemplatesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Templates</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Click a template to open its PDF preview.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <TemplateCard key={t.id} t={t as any} />
        ))}
      </div>
    </main>
  );
}