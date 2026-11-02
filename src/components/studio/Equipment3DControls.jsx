import React from "react";
import { Trash2, RotateCw, ArrowLeftRight, LogIn, LogOut, ArrowUpDown } from "lucide-react";
import { smartObjectByType } from "@/lib/growroom/smartObjects";
import { getObjectHeightIn, effectiveHeightY } from "@/lib/growroom/equipmentHeight";
import { WALL_HEIGHT_MULT } from "@/lib/growroom/walls";

// Floating controls shown in the 3D scene when a placed equipment object is
// selected. Mirrors the 2D SelectedObjectRemove controls but adds a Height
// slider (pos.z). Doors get Hinge/Swing toggles instead of Rotate. Pure UI —
// all data changes are delegated to the parent handlers, which persist to
// objects[]. Mobile-friendly: 48px+ hit targets.
export default function Equipment3DControls({
  object,
  ceilingIn = 144,
  onRotate,
  onSetHeight,
  onSetSpec,
  onRemove,
}) {
  if (!object) return null;
  const label = smartObjectByType(object.type)?.label || "Equipment";
  const isDoor = object.type === "door";
  const hingeRight = object.spec?.hinge === "right";
  const swingOut = object.spec?.swing === "out";

  // Height slider range: 0 → (wall top − object height) so the top never pokes
  // through the ceiling. Doors are floor-pinned; no height control.
  const objH = getObjectHeightIn(object);
  const wallTop = (ceilingIn || 144) * (WALL_HEIGHT_MULT ?? 1);
  const maxY = Math.max(0, Math.round(wallTop - objH));
  // Reflect the SAME height the 3D mesh actually renders at: stored pos.z when set,
  // otherwise the type's natural default (e.g. fans start flush under the ceiling).
  // This keeps the slider in sync with the fan instead of showing 0.
  const curY = Math.round(effectiveHeightY(object, ceilingIn));
  const showHeight = !isDoor && onSetHeight && maxY > 0;

  return (
    <div
      className="absolute right-2 sm:right-3 bottom-20 sm:bottom-24 safe-right z-50 flex flex-col items-end gap-2 max-w-[calc(100vw-1rem)]"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showHeight && (
        <div className="flex items-center gap-2 rounded-2xl bg-card/95 backdrop-blur px-3 py-2 shadow-lg border w-52 sm:w-56">
          <ArrowUpDown className="w-4 h-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={maxY}
            step={1}
            value={Math.min(curY, maxY)}
            onChange={(e) => onSetHeight(Number(e.target.value))}
            className="flex-1 h-9 accent-primary touch-target"
            aria-label={`${label} height`}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 flex-wrap">
        {isDoor && onSetSpec && (
          <>
            <button
              onClick={() => onSetSpec("hinge", hingeRight ? "left" : "right")}
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold leading-none px-4 shadow-lg active:scale-95 transition-transform"
              aria-label="Flip door hinge side"
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" />
              <span className="leading-none">Hinge</span>
            </button>
            <button
              onClick={() => onSetSpec("swing", swingOut ? "in" : "out")}
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold leading-none px-4 shadow-lg active:scale-95 transition-transform"
              aria-label="Toggle door swing direction"
            >
              {swingOut ? <LogIn className="w-4 h-4 shrink-0" /> : <LogOut className="w-4 h-4 shrink-0" />}
              <span className="leading-none">{swingOut ? "Swing In" : "Swing Out"}</span>
            </button>
          </>
        )}
        {!isDoor && onRotate && (
          <button
            onClick={onRotate}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold leading-none px-4 shadow-lg active:scale-95 transition-transform"
            aria-label={`Rotate ${label}`}
          >
            <RotateCw className="w-4 h-4 shrink-0" />
            <span className="leading-none">Rotate</span>
          </button>
        )}
        <button
          onClick={onRemove}
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold leading-none px-4 shadow-lg active:scale-95 transition-transform"
          aria-label={`Remove ${label}`}
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span className="leading-none">Remove</span>
        </button>
      </div>
    </div>
  );
}