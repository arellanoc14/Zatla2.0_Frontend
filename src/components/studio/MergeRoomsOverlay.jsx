import React from "react";
import { X } from "lucide-react";
import { roomFloorRect } from "@/lib/growroom/facility";
import { roomOutlineFacility } from "@/lib/growroom/mergeRooms";
import { polygonBBox } from "@/lib/growroom/polygon";

// Merge mode — second step of the two-tap merge flow. Every OTHER room is drawn
// as an explicit, clearly-outlined tap target sitting exactly over its footprint,
// so picking never depends on hitting an invisible rectangle. View-only; the
// parent validates adjacency and shows the confirm dialog.
export default function MergeRoomsOverlay({ doc, viewport, onPick, onCancel }) {
  const { pixelsPerInch: ppi, panX, panY } = viewport;

  // Screen-space box for a room (polygon rooms use their outline's bounds).
  const boxFor = (r) => {
    const b = Array.isArray(r.polygon) && r.polygon.length >= 3
      ? polygonBBox(roomOutlineFacility(r))
      : roomFloorRect(r);
    return { left: panX + b.x * ppi, top: panY + b.y * ppi, width: b.w * ppi, height: b.h * ppi };
  };

  const targets = (doc.rooms || []).filter((r) => r.id !== doc.activeRoomId);
  const activeName = (doc.rooms || []).find((r) => r.id === doc.activeRoomId)?.name || "this room";

  return (
    <div
      className="absolute inset-0 z-40"
      style={{ cursor: "crosshair" }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Highlight the active room so it's obvious which room is being merged INTO. */}
      {(doc.rooms || []).filter((r) => r.id === doc.activeRoomId).map((r) => (
        <div
          key={r.id}
          className="absolute border-2 border-primary rounded-sm pointer-events-none"
          style={{ ...boxFor(r), background: "hsl(var(--primary) / 0.12)" }}
        />
      ))}

      {targets.map((r) => {
        const box = boxFor(r);
        return (
          <button
            key={r.id}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPick(r.id); }}
            className="absolute flex items-center justify-center rounded-sm border-2 border-dashed border-amber-400 bg-amber-400/20 hover:bg-amber-400/35 active:bg-amber-400/45 transition-colors"
            style={{ ...box, minWidth: 44, minHeight: 44 }}
            aria-label={`Merge with ${r.name || "room"}`}
          >
            <span className="px-2 py-1 rounded-md bg-black/75 text-[11px] font-bold text-amber-300 whitespace-nowrap">
              Merge with {r.name || "room"}
            </span>
          </button>
        );
      })}

      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/80 backdrop-blur px-4 py-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-semibold text-white whitespace-nowrap">
          Tap a highlighted room to merge with “{activeName}”
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white"
          aria-label="Cancel merge"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}