// Cultivation clearance computations. All inches. Pure.
import { CART_MIN_IN } from "./catalog";

// Bench rect (axis-aligned, rotation 0/180 treated same for footprint w/h swap on 90/270)
export function benchRect(b) {
  const rot = ((b.rotationDeg || 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w = swap ? b.lengthIn : b.widthIn;
  const h = swap ? b.widthIn : b.lengthIn;
  return { x: b.pos.x, y: b.pos.y, w, h };
}

export function rectsOverlap(a, c, gap = 0) {
  return (
    a.x < c.x + c.w + gap &&
    a.x + a.w + gap > c.x &&
    a.y < c.y + c.h + gap &&
    a.y + a.h + gap > c.y
  );
}

// All clearances computed relative to room bounds [0..lengthIn] x [0..widthIn]
// Note: room.lengthIn maps to Y axis (along length), widthIn maps to X.
export function computeClearances(room, benches, settings) {
  const results = [];
  if (!benches.length) return results;
  const rects = benches.map(benchRect);

  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));

  // Front aisle: from top wall (y=0) to first bench
  results.push(flag("Front aisle", minY, settings.frontIn, 24));
  // Back aisle: from last bench to bottom wall
  results.push(flag("Back aisle", room.lengthIn - maxY, settings.backIn, null));
  // Left wall clearance
  results.push(flag("Left wall", minX, settings.wallIn, null));
  // Right wall clearance
  results.push(flag("Right wall", room.widthIn - maxX, settings.wallIn, null));

  // Center aisle: the largest gap between two adjacent bench columns.
  // Sort distinct column edges and scan neighboring columns so we measure the
  // real aisle between banks (not the full span across every column in between).
  const cols = [...new Set(rects.map((r) => Math.round(r.x)))].sort((a, b) => a - b);
  if (cols.length >= 2) {
    let bestGap = 0;
    let bestCenter = null;
    for (let i = 0; i < cols.length - 1; i++) {
      const leftCol = rects.filter((r) => Math.round(r.x) === cols[i]);
      const rightCol = rects.filter((r) => Math.round(r.x) === cols[i + 1]);
      const leftEdge = Math.max(...leftCol.map((r) => r.x + r.w));
      const rightEdge = Math.min(...rightCol.map((r) => r.x));
      const gap = rightEdge - leftEdge;
      if (gap > bestGap) {
        bestGap = gap;
        bestCenter = (leftEdge + rightEdge) / 2;
      }
    }
    if (bestGap > 0.5) {
      const c = flag("Center aisle", bestGap, settings.centerIn, CART_MIN_IN);
      c.center = bestCenter;
      results.push(c);
    }
  }

  return results;
}

function flag(label, value, min, warnBelow) {
  let status = "pass";
  if (warnBelow != null && value < warnBelow) status = "fail";
  else if (min != null && value < min - 0.5) status = "warn";
  return { label, value: Math.max(0, Math.round(value)), status };
}

// Collision check for a candidate bench vs others & walls
export function isValidPlacement(candidate, others, room, gap = 0) {
  const c = benchRect(candidate);
  if (c.x < -0.5 || c.y < -0.5 || c.x + c.w > room.widthIn + 0.5 || c.y + c.h > room.lengthIn + 0.5) {
    return false;
  }
  for (const o of others) {
    if (rectsOverlap(c, benchRect(o), gap)) return false;
  }
  return true;
}

export function lightCoveragePct(benches, lights) {
  const benchArea = benches.reduce((s, b) => s + benchRect(b).w * benchRect(b).h, 0);
  if (!benchArea) return 0;
  const lightArea = lights.reduce((s, l) => s + ((l.footprintIn?.w || 0) * (l.footprintIn?.h || 0)), 0);
  return Math.min(100, Math.round((lightArea / benchArea) * 100));
}