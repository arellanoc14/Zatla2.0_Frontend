import React, { useState, useEffect, useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";

// Compact popover editor for the ACTIVE room's aisle/clearance settings
// (centerIn, frontIn, backIn, wallIn). Raw numeric inches — no unit symbols.
// Editing re-runs the active room's bench auto-layout via onApply; selected-room
// only. Renders as a mobile-friendly dropdown anchored under its button (no
// layout shift) and collapses on any tap outside the popover.
const FIELDS = [
  { key: "centerIn", label: "Center aisle" },
  { key: "frontIn", label: "Front" },
  { key: "backIn", label: "Back" },
  { key: "wallIn", label: "Side / wall" },
];

export default function AisleEditor({ open, onOpen, onClose, settings, onApply }) {
  const [vals, setVals] = useState(settings || {});
  const rootRef = useRef(null);

  // Re-seed local inputs from the room's settings each time the editor opens so
  // it always reflects the currently-selected room.
  useEffect(() => {
    if (open) setVals(settings || {});
  }, [open, settings]);

  // Tap/click anywhere outside → collapse. Capture phase so parent
  // stopPropagation wrappers can't swallow the event before we see it.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open, onClose]);

  const setField = (key, raw) => {
    const num = raw === "" ? "" : Number(raw);
    const next = { ...vals, [key]: num };
    setVals(next);
    onApply({ ...next, [key]: num === "" ? 0 : num });
  };

  // On blur, an empty field commits to 0 (a lone 0 is valid, e.g. Side/wall).
  const commitField = (key) => {
    if (vals[key] === "" || vals[key] == null) {
      const next = { ...vals, [key]: 0 };
      setVals(next);
      onApply(next);
    }
  };

  // A stored 0 shows as an empty field so typing never produces "010".
  const displayVal = (v) => (v === "" || v == null || Number(v) === 0 ? "" : Number(v));

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => (open ? onClose() : onOpen())}
        className={`inline-flex h-9 md:h-11 items-center justify-center gap-1.5 md:gap-2 rounded-full text-xs md:text-sm font-bold leading-none px-3 md:px-5 shadow-2xl active:scale-95 transition-transform border shrink-0 ${open ? "bg-primary text-primary-foreground border-primary" : "bg-slate-900/90 text-white border-white/10"}`}
        aria-label="Edit aisles"
        aria-expanded={open}
      >
        <SlidersHorizontal className="w-4 h-4 shrink-0" />
        <span className="leading-none">Aisle</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-60 max-w-[calc(100vw-2rem)] rounded-xl bg-card border shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Room Aisles (inches)</span>
            <button
              onClick={onClose}
              className="w-7 h-7 -mr-1 flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
              aria-label="Close aisle editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground leading-none">{f.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={displayVal(vals[f.key])}
                  onChange={(e) => setField(f.key, e.target.value)}
                  onBlur={() => commitField(f.key)}
                  className="h-9 rounded-md border bg-background px-2 text-sm w-full"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}