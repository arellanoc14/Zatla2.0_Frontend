import React from "react";
import { Gauge, Zap, RefreshCw, CalendarRange } from "lucide-react";

// Industry-standard grower efficiency metrics. Pure presentation — every input
// is passed in from the single sources: yield from the production calc (grams),
// canopy ft² from real placed benches (growing surface incl. tiers), wattage
// from the light count × per-fixture draw, cycle length from the wizard.
export default function GrowerMetrics({ gramsPerHarvest, canopySqft, totalWatts, cycleDays, buffer = 0 }) {
  const gPerSqft = canopySqft > 0 ? gramsPerHarvest / canopySqft : 0;
  const gPerWatt = totalWatts > 0 ? gramsPerHarvest / totalWatts : 0;
  const d = parseFloat(cycleDays) || 0;
  const b = parseFloat(buffer) || 0;
  const turns = d > 0 ? 365 / (d + b) : 0;
  const annualGrams = gramsPerHarvest * turns;
  const annualLbs = annualGrams / 453.592;

  // Benchmark tiers
  const sqftTone = gPerSqft >= 70 ? "excellent" : gPerSqft >= 50 ? "good" : "low";
  const wattTone = gPerWatt >= 1.0 ? "good" : gPerWatt >= 0.8 ? "ok" : "low";
  const turnsTone = turns >= 6 ? "excellent" : turns >= 4 ? "good" : "ok";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <Gauge className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground">Grower efficiency</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricTile
          icon={Gauge}
          label="Yield density"
          value={`${gPerSqft.toFixed(1)} g/ft²`}
          benchmark="Target 50–70+ per harvest"
          tone={sqftTone}
        />
        <MetricTile
          icon={Zap}
          label="Energy efficiency"
          value={`${gPerWatt.toFixed(2)} g/W`}
          benchmark="Target ~1.0 g/watt"
          tone={wattTone}
        />
        <MetricTile
          icon={RefreshCw}
          label="Harvest turns"
          value={`${turns.toFixed(1)}/yr`}
          benchmark="Up to ~6 turns/yr"
          tone={turnsTone}
        />
        <MetricTile
          icon={CalendarRange}
          label="Annual yield"
          value={`${Math.round(annualLbs).toLocaleString()} lbs`}
          benchmark={`${Math.round(annualGrams).toLocaleString()} g/yr`}
          tone="neutral"
        />
      </div>

      <p className="text-[9px] text-muted-foreground/70 px-0.5">
        Densities use canopy footprint only (growing area, aisles excluded).
      </p>
    </div>
  );
}

const TONES = {
  excellent: "bg-amber-500/10 border-amber-500/30 text-amber-600",
  good: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
  ok: "bg-sky-500/10 border-sky-500/30 text-sky-600",
  low: "bg-destructive/10 border-destructive/30 text-destructive",
  neutral: "bg-muted/20 border-input text-foreground",
};

function MetricTile({ icon: Icon, label, value, benchmark, tone }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${TONES[tone] || TONES.neutral}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3 shrink-0 opacity-80" />
        <span className="text-[9px] uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <div className="font-mono text-sm font-bold leading-tight">{value}</div>
      <div className="text-[9px] opacity-70 mt-0.5">{benchmark}</div>
    </div>
  );
}