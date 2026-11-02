import React from "react";
import { X } from "lucide-react";
import { smartObjectByType } from "@/lib/growroom/smartObjects";

// Floating indicator shown while Placement Mode is active: names the equipment
// being placed, hints tap vs drag, and offers a Done button to exit the mode.
export default function PlacementBadge({ type, onDone }) {
  const label = smartObjectByType(type)?.label || type;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-16 z-40 flex items-center gap-2 rounded-full bg-card border shadow-2xl pl-4 pr-1.5 py-1.5"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <span className="text-xs font-semibold whitespace-nowrap">Placing: {label}</span>
      <span className="hidden sm:inline text-[10px] text-muted-foreground whitespace-nowrap">tap = one · drag = row</span>
      <button
        onClick={onDone}
        className="inline-flex h-7 items-center gap-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 active:scale-95 transition-transform"
        aria-label="Exit placement mode"
      >
        <X className="w-3.5 h-3.5" /> Done
      </button>
    </div>
  );
}