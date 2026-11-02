import React, { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Zap, Layers, Boxes, Info } from "lucide-react";

const SQFT_TO_M2 = 10.7639;

export const LIGHTS_4FT = [
  { id: "660w_4x8", footprint: "4×8", wattage: 660, ppfd: 1361 },
  { id: "800w_4x8", footprint: "4×8", wattage: 800, ppfd: 1440 },
  { id: "830w_4x8", footprint: "4×8", wattage: 830, ppfd: 1675 },
  { id: "900w_4x8", footprint: "4×8", wattage: 900, ppfd: 1617 },
  { id: "1000w_4x8", footprint: "4×8", wattage: 1000, ppfd: 1962 },
];

export const LIGHTS_5FT = [
  { id: "1000w_5x4", footprint: "5×4", wattage: 1000, ppfd: 1255 },
  { id: "1350w_5x4", footprint: "5×4", wattage: 1350, ppfd: 1696 },
];

export function getLightById(id) {
  return [...LIGHTS_4FT, ...LIGHTS_5FT].find((l) => l.id === id) || null;
}

// Summarize the actual placed benches into size groups (e.g. "20× 4×8 + 4× 4×4"),
// the dominant bench width (for light filtering) and total canopy. Single source
// of truth = the placed benches on the 2D schematic.
export function summarizePlacedBenches(benches = []) {
  if (!benches || benches.length === 0) {
    return { count: 0, groups: [], dominantWidthFt: 4, canopySqft: 0 };
  }
  const map = new Map();
  let widthAccumByCount = {};
  for (const b of benches) {
    const wFt = Math.round((b.widthIn || 0) / 12);
    const lFt = Math.round((b.lengthIn || 0) / 12);
    const key = `${wFt}x${lFt}`;
    const existing = map.get(key) || { label: `${wFt}×${lFt}`, widthFt: wFt, lengthFt: lFt, count: 0 };
    existing.count += 1;
    map.set(key, existing);
    widthAccumByCount[wFt] = (widthAccumByCount[wFt] || 0) + 1;
  }
  const groups = [...map.values()].sort((a, b) => b.count - a.count);
  // Dominant width = the bench width most benches use (drives 4ft vs 5ft lights)
  const dominantWidthFt = Number(
    Object.entries(widthAccumByCount).sort((a, b) => b[1] - a[1])[0][0]
  );
  const canopySqft = Math.round(
    benches.reduce((sum, b) => {
      const tiers = Math.max(1, b.tiers || 1);
      return sum + ((b.lengthIn || 0) * (b.widthIn || 0) * tiers) / 144;
    }, 0)
  );
  return { count: benches.length, groups, dominantWidthFt, canopySqft };
}

export default function RoomSetup({
  benches = [],
  lightId, onLightIdChange,
}) {
  const summary = summarizePlacedBenches(benches);
  const hasBenches = summary.count > 0;
  const lights = summary.dominantWidthFt === 5 ? LIGHTS_5FT : LIGHTS_4FT;

  // Keep the selected light consistent with the dominant bench width on the schematic.
  useEffect(() => {
    if (hasBenches && !lights.some((l) => l.id === lightId)) {
      onLightIdChange(lights[0].id);
    }
  }, [lights, lightId, hasBenches]);

  const canopyM2 = (summary.canopySqft / SQFT_TO_M2).toFixed(2);

  if (!hasBenches) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
        <Boxes className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          Add benches to your layout to see production estimates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Detected bench size(s) — read-only, sourced from the 2D schematic */}
      <div>
        <Label className="text-[10px] text-muted-foreground mb-1 block">Bench size (from your layout)</Label>
        <div className="rounded-md border bg-muted/30 px-3 py-2.5">
          <div className="space-y-1">
            {summary.groups.map((g) => (
              <div key={g.label} className="flex items-center gap-2 text-xs min-w-0 font-mono">
                <span className="text-muted-foreground">QTY:</span>
                <span className="font-semibold text-foreground">{g.count}</span>
                <span className="text-muted-foreground/50">—</span>
                <span className="text-muted-foreground">Bench Size:</span>
                <span className="font-semibold text-foreground">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Total canopy: <span className="font-mono font-semibold text-foreground">{canopyM2} m²</span>
          <span className="text-muted-foreground/50"> · {summary.canopySqft.toLocaleString()} sqft</span>
        </div>
      </div>

      {/* Light Model — filtered by the dominant bench width on the schematic */}
      <div>
        <Label className="text-[10px] text-muted-foreground mb-1 block">Grow light</Label>
        <div className="space-y-1">
          {lights.map((l) => {
            const active = lightId === l.id;
            return (
              <button
                key={l.id}
                onClick={() => onLightIdChange(l.id)}
                className={`w-full flex items-center justify-between gap-2 rounded-md border px-2.5 py-2.5 min-h-[44px] text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-input bg-transparent hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 min-w-0">
                  <span className={`font-mono font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                    {l.footprint}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-muted-foreground">{l.wattage}W</span>
                  <span className="text-muted-foreground">·</span>
                  <span className={`font-mono font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                    {l.ppfd} PPFD
                  </span>
                </div>
                <Zap className={`w-3 h-3 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Total benches — from the schematic */}
      <div className="rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Layers className="w-3 h-3" /> Total benches
          </span>
          <span className="font-mono font-bold text-foreground">{summary.count}</span>
        </div>
        <div className="text-[9px] text-muted-foreground mt-0.5">
          Pulled from the benches placed on your layout
        </div>
      </div>
    </div>
  );
}