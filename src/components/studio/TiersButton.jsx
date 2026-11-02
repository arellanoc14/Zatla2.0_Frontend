import React, { useEffect, useRef } from "react";
import { Layers, X } from "lucide-react";

// Compact selector for the ACTIVE room's bench configuration: Single, Double
// or Triple Tier (all rolling benches). Each pick sets both the bench type and
// the tier level in one atomic update so the layout rebuilds cleanly.
const OPTIONS = [
  { benchType: "rolling", tiers: 1, label: "Single Tier" },
  { benchType: "rolling", tiers: 2, label: "Double Tier" },
  { benchType: "rolling", tiers: 3, label: "Triple Tier" },
];

export default function TiersButton({ open, onOpen, onClose, tiers, benchType, onSet }) {
  const rootRef = useRef(null);

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

  const activeLabel = OPTIONS.find((o) => o.tiers === (tiers || 1))?.label;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => (open ? onClose() : onOpen())}
        className={`inline-flex h-9 md:h-11 items-center justify-center gap-1.5 md:gap-2 rounded-full text-xs md:text-sm font-bold leading-none px-3 md:px-5 shadow-2xl active:scale-95 transition-transform border shrink-0 ${open ? "bg-red-600 text-white border-red-500" : "bg-red-500 text-white border-red-400"}`}
        aria-label="Set bench type"
        aria-expanded={open}
      >
        <Layers className="w-4 h-4 shrink-0" />
        <span className="leading-none">{activeLabel || "Bench"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-44 max-w-[calc(100vw-2rem)] rounded-xl bg-card border shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Bench Type</span>
            <button
              onClick={onClose}
              className="w-7 h-7 -mr-1 flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
              aria-label="Close bench type"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {OPTIONS.map((o) => {
              const active = o.tiers === (tiers || 1);
              return (
                <button
                  key={o.label}
                  onClick={() => { onSet(o.benchType, o.tiers); onClose(); }}
                  className={`h-9 rounded-md text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground active:bg-muted"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}