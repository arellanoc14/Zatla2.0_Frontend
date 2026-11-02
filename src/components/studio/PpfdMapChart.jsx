import React, { useMemo } from "react";
import { fillGrid, gridStats } from "@/lib/lighting/ppfdMaps";
// Vivid ramp: the same colours as the 3D PPFD tiles this card sits over.
import { heatCssVivid as heat, heatTextColor } from "@/lib/lighting/ppfdColor";

// The spec sheet's "PPFD READING" lattice, drawn as a heat map. Printed
// cells show their number; blank cells are coloured by interpolation only
// (fillGrid) so the map reads as one surface without inventing readings.
//
// Every cell carries `animate-ppfd-cell` with a delay that grows with its
// distance from the centre, so the map blooms outward from the hot spot
// each time the model / wattage changes (the parent re-keys this component).
const num = (v) => v.toLocaleString("en-US");

// colorFor (optional): v → CSS colour, e.g. growth-stage bands; overrides the
// relative min→max heat ramp.
export default function PpfdMapChart({ map, title = null, colorFor = null }) {
  const filled = useMemo(() => fillGrid(map.grid), [map]);
  const stats = useMemo(() => gridStats(map.grid), [map]);
  const rows = map.grid.length;
  const cols = map.grid[0].length;
  const cy = (rows - 1) / 2, cx = (cols - 1) / 2;
  const range = Math.max(1, stats.max - stats.min);
  // The 4x6 / 4x8 / 5x5 sheets print 11-, 13- and 15-column lattices. Past 9
  // columns, flexible cells get too small to read a 4-digit value, so those
  // maps use fixed 20px cells and scroll sideways inside the panel instead.
  const wide = cols > 9;
  const fontPx = wide ? 7 : 9;

  return (
    <div className="animate-fade-up">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold text-emerald-300">
          {title ?? `${map.heightIn}″ height @ ${map.dimmingPct ?? 100}% (${map.wattageW}W)`}
        </span>
        {map.coverage && <span className="text-[10px] text-white/45">{map.coverage}</span>}
      </div>
      <div className={wide ? "overflow-x-auto pb-1" : ""}>
      <div
        className="grid gap-[2px] rounded-md overflow-hidden"
        style={{
          gridTemplateColumns: wide ? `repeat(${cols}, 20px)` : `repeat(${cols}, minmax(0, 1fr))`,
          width: wide ? "max-content" : undefined,
        }}
      >
        {map.grid.map((row, y) =>
          row.map((v, x) => {
            const printed = typeof v === "number";
            const t = (filled[y][x] - stats.min) / range;
            const delay = Math.hypot(x - cx, y - cy) * 60;
            return (
              <div
                key={`${y}-${x}`}
                title={printed ? `${v} µmol/m²/s` : undefined}
                className="animate-ppfd-cell aspect-square flex items-center justify-center rounded-[3px] font-mono font-semibold tabular-nums leading-none"
                style={{
                  fontSize: `${fontPx}px`,
                  background: colorFor ? colorFor(filled[y][x]) : heat(t),
                  color: printed ? (colorFor ? "#fff" : heatTextColor(t)) : "transparent",
                  opacity: printed ? 1 : 0.55,
                  animationDelay: `${delay}ms`,
                }}
              >
                {printed ? v : ""}
              </div>
            );
          })
        )}
      </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-white/55 tabular-nums">
        <span>avg <span className="text-white font-semibold">{num(stats.avg)}</span></span>
        <span>max <span className="text-white font-semibold">{num(stats.max)}</span></span>
        <span>min <span className="text-white font-semibold">{num(stats.min)}</span></span>
      </div>
    </div>
  );
}
