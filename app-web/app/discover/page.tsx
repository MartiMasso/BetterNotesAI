import Navbar from "@/app/components/Navbar";
import AppBackground from "@/app/components/AppBackground";

export default function DiscoverPage() {
  return (
    <main className="relative min-h-screen text-white">
      <AppBackground />
      <Navbar />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-foreground">Discover</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Templates and examples coming soon.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PlaceholderCard title="Community Templates" description="Browse templates shared by other students" />
          <PlaceholderCard title="Featured Examples" description="See what's possible with BetterNotes" />
          <PlaceholderCard title="Your Creations" description="Share your work with the community" />
        </div>
      </section>
    </main>
  );
}

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
      <div className="h-32 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-sm">
        Coming soon
      </div>
      <div className="mt-4">
        <div className="font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm text-white/60">{description}</div>
      </div>
    </div>
  );
}
