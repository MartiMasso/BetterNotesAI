export default function Background() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_20%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(900px_500px_at_20%_70%,rgba(236,72,153,0.30),transparent_60%),radial-gradient(900px_500px_at_80%_75%,rgba(34,197,94,0.18),transparent_60%)]" />

      {/* Animated blobs */}
      <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/25 blur-3xl animate-blob1" />
      <div className="absolute top-40 -left-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-3xl animate-blob2" />
      <div className="absolute top-56 -right-24 h-[520px] w-[520px] rounded-full bg-emerald-400/15 blur-3xl animate-blob3" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.09] bg-[linear-gradient(to_right,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.18)_1px,transparent_1px)] bg-[size:56px_56px]" />

      {/* Grain */}
      <div className="absolute inset-0 opacity-[0.18] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.55%22/%3E%3C/svg%3E')]" />
    </div>
  );
}