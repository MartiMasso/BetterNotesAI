export default function AppBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base */}
      <div className="absolute inset-0 bg-neutral-950" />

      {/* Soft glow */}
      <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_35%_10%,rgba(99,102,241,0.22),transparent_60%),radial-gradient(900px_600px_at_75%_30%,rgba(236,72,153,0.18),transparent_60%),radial-gradient(900px_600px_at_70%_85%,rgba(34,197,94,0.12),transparent_60%)]" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Grain */}
      <div className="absolute inset-0 opacity-[0.16] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.55%22/%3E%3C/svg%3E')]" />
    </div>
  );
}