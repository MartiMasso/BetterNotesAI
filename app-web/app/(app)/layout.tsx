import AppBackground from "../components/AppBackground";
import Sidebar from "../components/Sidebar";
import SearchModal from "../components/SearchModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-white relative">
      <AppBackground />
      <SearchModal />

      <div className="flex min-h-screen">
        {/* Phase 2 Sidebar — replaces the old minimal sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex-1 min-h-screen overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

