import React from "react";

// Lightweight branded loader: a spinning cannabis leaf (pure SVG/CSS, no asset
// download). Respects prefers-reduced-motion via the `reducedMotion` prop —
// spins continuously when motion is allowed, gently pulses when it isn't.
// Optional `progress` (0–100) renders a subtle ring + percentage under the leaf.
export default function LeafLoader({ reducedMotion = false, progress = null, label }) {
  const hasProgress = typeof progress === "number" && progress > 0 && progress < 100;
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const dash = hasProgress ? (progress / 100) * circumference : 0;

  return (
    <div className="flex flex-col items-center justify-center gap-3 select-none">
      <div className="relative w-20 h-20">
        {/* soft gold glow behind the leaf */}
        <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl" />

        {/* optional progress ring */}
        {hasProgress && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
            <circle
              cx="40"
              cy="40"
              r={r}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ transition: "stroke-dasharray 0.3s ease" }}
            />
          </svg>
        )}

        {/* spinning / pulsing cannabis leaf */}
        <svg
          viewBox="0 0 24 24"
          className={`absolute inset-0 m-auto w-11 h-11 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.55)] ${
            reducedMotion ? "animate-pulse" : "animate-spin"
          }`}
          style={reducedMotion ? undefined : { animationDuration: "1.6s" }}
          fill="currentColor"
          aria-hidden="true"
        >
          {/* stylized 7-point cannabis leaf */}
          <path d="M12 2c.5 1.8.6 3.6.4 5.4 1-1.3 2.2-2.4 3.6-3.2-.4 1.7-1.1 3.3-2.1 4.7 1.6-.8 3.3-1.3 5-1.6-1.1 1.4-2.5 2.6-4 3.5 1.8.1 3.5.5 5.1 1.2-1.6.6-3.3.9-5 1 1.3 1 2.4 2.2 3.3 3.6-1.7-.3-3.3-.9-4.8-1.7.6 1.6.9 3.3 1 5-1.2-1.2-2.2-2.6-3-4.1-.2 1.8-.7 3.5-1.5 5.1-.8-1.6-1.3-3.3-1.5-5.1-.8 1.5-1.8 2.9-3 4.1.1-1.7.4-3.4 1-5-1.5.8-3.1 1.4-4.8 1.7.9-1.4 2-2.6 3.3-3.6-1.7-.1-3.4-.4-5-1 1.6-.7 3.3-1.1 5.1-1.2-1.5-.9-2.9-2.1-4-3.5 1.7.3 3.4.8 5 1.6-1-1.4-1.7-3-2.1-4.7 1.4.8 2.6 1.9 3.6 3.2-.2-1.8-.1-3.6.4-5.4z" />
        </svg>
      </div>

      {hasProgress ? (
        <div className="text-xs font-mono font-semibold text-amber-300">{Math.round(progress)}%</div>
      ) : label ? (
        <div className="text-sm text-muted-foreground font-medium">{label}</div>
      ) : null}
    </div>
  );
}