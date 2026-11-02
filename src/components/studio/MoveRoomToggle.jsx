import React from "react";
import { Move, Lock } from "lucide-react";

// Explicit "Move" toggle (3D only, shown while a room is selected). When ON, a
// one-finger drag moves the room and the camera's one-finger orbit is disabled;
// when OFF, one finger orbits the camera and the room is locked. Big mobile touch
// target (≥48px). Placed by the parent so it clears the other 3D control clusters.
export default function MoveRoomToggle({ active, onToggle }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`inline-flex items-center gap-2 h-12 px-4 rounded-full text-sm font-semibold shadow-lg ring-2 active:scale-95 transition-all touch-target ${
        active
          ? "bg-primary text-primary-foreground ring-white/70"
          : "bg-card/95 backdrop-blur text-foreground ring-border"
      }`}
      aria-pressed={active}
      aria-label={active ? "Moving room — tap to lock" : "Move room"}
    >
      {active ? <Move className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
      <span className="leading-none">{active ? "Moving — tap to lock" : "Move"}</span>
    </button>
  );
}