import React from "react";
import { Minus, Plus } from "lucide-react";

// Mobile-friendly stepper for tier count. Allowed values: 1, 2, 3 only.
// Minus (left) — value (center) — plus (right), all ≥44px tap targets.
export default function TierStepper({ value, onChange, min = 1, max = 3 }) {
  const v = Math.min(max, Math.max(min, Number(value) || min));
  const dec = () => { if (v > min) onChange(v - 1); };
  const inc = () => { if (v < max) onChange(v + 1); };

  return (
    <div className="flex items-stretch rounded-lg border border-input overflow-hidden">
      <button
        type="button"
        onClick={dec}
        disabled={v <= min}
        aria-label="Decrease tiers"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground hover:bg-muted/60 active:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        <Minus className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-[44px] min-h-[44px] flex items-center justify-center font-mono text-base font-bold text-foreground border-x border-input select-none">
        {v}
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={v >= max}
        aria-label="Increase tiers"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground hover:bg-muted/60 active:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}