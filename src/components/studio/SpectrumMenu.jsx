import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RotateCcw, Sun } from "lucide-react";
import ChannelSliders from "@/components/spectrum/ChannelSliders";
import SpectrumChart from "@/components/spectrum/SpectrumChart";
import { FACTORY_LEVELS } from "@/lib/spectrum";

// Room-scoped spectrum picker for the 3D view. The first change of a drag is
// one undo step; the rest of the drag updates live without history entries.
// `trigger` (optional) replaces the default pill button, e.g. the 3D dock's
// icon button; `align` / `side` place the popover against it.
export default function SpectrumMenu({ spectrum, onSet, hasSelectedRoom, onOpenChange, trigger = null, align = "start", side = "bottom" }) {
  const dragging = useRef(false);
  const levels = spectrum || FACTORY_LEVELS;
  const isFactory = levels.every((v, i) => v === FACTORY_LEVELS[i]);
  const change = (next) => {
    onSet(next, { transient: dragging.current });
    dragging.current = true;
  };
  const commit = () => { dragging.current = false; };

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 rounded-full text-[11px] font-medium shrink-0 bg-black text-white hover:bg-black/80 hover:text-white shadow">
            <Sun className="w-3.5 h-3.5" /> <span>Spectrum</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-80 max-w-[calc(100vw-24px)] border-white/10 bg-slate-950 p-3 text-white">
        {!hasSelectedRoom ? (
          <p className="text-xs text-white/70">Select a room first to tune its light spectrum.</p>
        ) : (
          <>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2"><SpectrumChart levels={levels} /></div>
            <div className="mt-3">
              <ChannelSliders levels={levels} onChange={change} onCommit={commit} idPrefix="studio-ch" compact />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isFactory}
                onClick={() => onSet(FACTORY_LEVELS.slice())}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to factory
              </button>
              <button
                type="button"
                onClick={() => onSet(levels, { all: true })}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
              >
                Apply to all rooms
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}