import React, { useState } from "react";
import { Check, X } from "lucide-react";

// Draw Custom Room mode — a full-canvas overlay that captures taps, snaps each
// point to the 1ft facility grid, keeps the outline rectilinear (each new point
// locks onto the previous point's row or column), and shows a live preview.
// Close the shape by tapping the first point (or the Finish button).
// View-only overlay: the room is created by the parent via onComplete(points).
export default function DrawRoomOverlay({ viewport, onComplete, onCancel }) {
  const [points, setPoints] = useState([]); // facility inches, snapped
  const [cursor, setCursor] = useState(null);
  const { pixelsPerInch: ppi, panX, panY } = viewport;

  const toScreen = (p) => ({ x: p.x * ppi + panX, y: p.y * ppi + panY });
  const toFacility = (e, el) => {
    const rect = el.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return { x: (cx - rect.left - panX) / ppi, y: (cy - rect.top - panY) / ppi };
  };
  const snap = (p) => ({ x: Math.round(p.x / 12) * 12, y: Math.round(p.y / 12) * 12 });
  // Rectilinear constraint: force the candidate onto the previous point's row
  // or column, whichever the tap is closer to.
  const constrain = (p, prev) => {
    if (!prev) return p;
    return Math.abs(p.x - prev.x) >= Math.abs(p.y - prev.y)
      ? { x: p.x, y: prev.y }
      : { x: prev.x, y: p.y };
  };

  const handleClick = (e) => {
    const p = constrain(snap(toFacility(e, e.currentTarget)), points[points.length - 1]);
    if (points.length >= 3) {
      const f = toScreen(points[0]);
      const s = toScreen(p);
      if (Math.hypot(f.x - s.x, f.y - s.y) < 14) { onComplete(points); return; }
    }
    const last = points[points.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    setPoints((l) => [...l, p]);
  };
  const handleMove = (e) =>
    setCursor(constrain(snap(toFacility(e, e.currentTarget)), points[points.length - 1]));

  const screenPts = points.map(toScreen);
  const cursorPt = cursor ? toScreen(cursor) : null;
  const canFinish = points.length >= 3;

  return (
    <div
      className="absolute inset-0 z-40"
      style={{ cursor: "crosshair" }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={handleClick}
      onMouseMove={handleMove}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Live outline */}
        {screenPts.length > 0 && (
          <polyline
            points={[...screenPts, ...(cursorPt ? [cursorPt] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(22,163,74,0.08)"
            stroke="#16a34a"
            strokeWidth="2.5"
            strokeDasharray="8 5"
          />
        )}
        {/* Closing hint back to the first point */}
        {canFinish && screenPts.length > 0 && cursorPt && (
          <line
            x1={cursorPt.x} y1={cursorPt.y} x2={screenPts[0].x} y2={screenPts[0].y}
            stroke="rgba(22,163,74,0.35)" strokeWidth="1.5" strokeDasharray="3 4"
          />
        )}
        {screenPts.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={i === 0 && canFinish ? 8 : 5}
            fill={i === 0 && canFinish ? "#16a34a" : "#ffffff"}
            stroke="#16a34a"
            strokeWidth="2"
          />
        ))}
      </svg>

      {/* Instruction banner + actions */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/80 backdrop-blur px-4 py-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-semibold text-white whitespace-nowrap">
          {points.length === 0
            ? "Tap corners on the grid to outline the room"
            : canFinish
              ? "Tap the first point (or Finish) to close the shape"
              : `${points.length} corner${points.length === 1 ? "" : "s"} — keep going`}
        </span>
        <button
          type="button"
          disabled={!canFinish}
          onClick={() => onComplete(points)}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 disabled:opacity-40"
        >
          <Check className="w-3.5 h-3.5" /> Finish
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white"
          aria-label="Cancel drawing"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}