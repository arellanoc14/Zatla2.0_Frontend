import React from "react";
import { Plus, Minus, Maximize2 } from "lucide-react";

// Floating zoom controls anchored to the bottom-right of the 3D viewer.
// Zoom in / zoom out / reset view — moved out of the navbar for quick access.
export default function Zoom3DControls({ onZoomIn, onZoomOut, onResetView }) {
  return (
    <div className="absolute bottom-4 left-4 z-20 hidden md:flex flex-col gap-1 bg-card/90 backdrop-blur border rounded-xl shadow-lg p-1">
      <button
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-accent text-foreground transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-accent text-foreground transition-colors"
      >
        <Minus className="w-4 h-4" />
      </button>
      <div className="h-px bg-border mx-1" />
      <button
        onClick={onResetView}
        aria-label="Reset view"
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
}