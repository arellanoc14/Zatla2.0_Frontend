import React from "react";
import { CHANNELS } from "@/lib/spectrum";

// Four channel sliders. onCommit (optional) fires when a drag/keypress ends.
export default function ChannelSliders({ levels, onChange, onCommit, idPrefix = "zatla-ch", compact = false }) {
  const set = (i, v) => { const next = levels.slice(); next[i] = v; onChange(next); };
  const end = onCommit ? () => onCommit() : undefined;
  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {CHANNELS.map((ch, i) => (
        <div key={ch.id}>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${idPrefix}-${ch.id}`} className={`flex items-center gap-2 font-medium ${compact ? "text-xs" : "text-sm"}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
              {ch.detail}
            </label>
            <span className={`font-mono tabular-nums text-white/80 ${compact ? "text-xs" : "text-sm"}`}>{levels[i]}%</span>
          </div>
          <input
            id={`${idPrefix}-${ch.id}`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={levels[i]}
            onChange={(e) => set(i, Number(e.target.value))}
            onPointerUp={end}
            onKeyUp={end}
            className={`${compact ? "mt-1" : "mt-2"} h-2 w-full cursor-pointer`}
            style={{ accentColor: ch.color }}
          />
          {!compact && <p className="mt-1 text-xs text-white/50">{ch.note} · factory share {ch.factory}%</p>}
        </div>
      ))}
    </div>
  );
}