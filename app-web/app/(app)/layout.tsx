import Link from "next/link";
import AppBackground from "../components/AppBackground";
import MyProjects from "../components/MyProjects";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-white relative">
      <AppBackground />

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex w-64 flex-col border-r border-white/10 bg-white/5 backdrop-blur">
          <div className="px-4 py-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center font-semibold">
                B
              </div>
              <div>
                <div className="text-sm font-semibold">BetterNotes</div>
                <div className="text-xs text-white/60">Workspace</div>
              </div>
            </Link>
          </div>

          <nav className="px-2 py-2 text-sm">
            <SidebarItem label="Home" href="/workspace" />
            <SidebarItem label="Templates" href="/templates" />
            <SidebarItem label="Pricing" href="/pricing" />
          </nav>

          {/* My Projects - Client Component */}
          <div className="px-2 flex-1 overflow-y-auto">
            <MyProjects />
          </div>

          <div className="mt-auto p-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <div className="text-sm font-medium">Upgrade to Pro</div>
              <div className="text-xs text-white/60 mt-1">
                Unlock more generations and bigger files.
              </div>
              <Link
                href="/pricing"
                className="mt-3 block w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90 text-center"
              >
                Upgrade
              </Link>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

function SidebarItem({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
    >
      {label}
    </Link>
  );
}
