import React from "react";
import { Trash2, RotateCw, ArrowLeftRight, LogIn, LogOut } from "lucide-react";
import { smartObjectByType } from "@/lib/growroom/smartObjects";

// Floating controls shown on the 2D canvas whenever a placed equipment object
// (door, fan, minisplit, dehumidifier, ducting, co2tank) is selected.
// Doors get Hinge (left/right) + Swing (in/out) toggles instead of Rotate —
// rotation is meaningless for a wall-pinned door symbol. Remove deletes it.
// Pure UI — all data changes are delegated to the parent handlers.
export default function SelectedObjectRemove({ object, onRemove, onRotate, onSetSpec }) {
  if (!object) return null;
  const label = smartObjectByType(object.type)?.label || "Equipment";
  const isDoor = object.type === "door";
  const hingeRight = object.spec?.hinge === "right";
  const swingOut = object.spec?.swing === "out";

  return (
    <div
      className="absolute right-3 bottom-16 sm:bottom-3 z-30 flex items-center gap-2"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {isDoor && onSetSpec && (
        <>
          <button
            onClick={() => onSetSpec("hinge", hingeRight ? "left" : "right")}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold leading-none px-3 shadow-lg active:scale-95 transition-transform"
            aria-label="Flip door hinge side"
            title="Flip hinge side"
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            <span className="leading-none">Hinge</span>
          </button>
          <button
            onClick={() => onSetSpec("swing", swingOut ? "in" : "out")}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold leading-none px-3 shadow-lg active:scale-95 transition-transform"
            aria-label="Toggle door swing direction"
            title="Toggle swing in/out"
          >
            {swingOut ? <LogIn className="w-4 h-4 shrink-0" /> : <LogOut className="w-4 h-4 shrink-0" />}
            <span className="leading-none">{swingOut ? "Swing In" : "Swing Out"}</span>
          </button>
        </>
      )}
      {!isDoor && onRotate && (
        <button
          onClick={onRotate}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
          aria-label={`Rotate ${label}`}
          title={`Rotate ${label}`}
        >
          <RotateCw className="w-4 h-4 shrink-0" />
        </button>
      )}
      <button
        onClick={onRemove}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold leading-none px-4 shadow-lg active:scale-95 transition-transform"
        aria-label={`Remove ${label}`}
        title={`Remove ${label}`}
      >
        <Trash2 className="w-4 h-4 shrink-0" />
        <span className="leading-none">Remove</span>
      </button>
    </div>
  );
}