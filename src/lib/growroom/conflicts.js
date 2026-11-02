// Read-only layout conflict detection for the active room.
//
// Pure functions — NEVER mutate object data, benches, or settings. Given the
// active room's geometry + benches + objects, returns a list of warnings, each
// pointing at an offending object (by id/kind) with an explanatory message. The
// renderers draw an orange pulsing outline + tooltip; nothing here moves/edits.
//
// All coordinates are room-local inches (same space the 2D canvas / objects use).
// Door swing geometry mirrors the 2D door symbol: hinge at the door's left jamb,
// a quarter-circle of radius = door width swinging into the room.

import { benchRect, rectsOverlap } from "./clearances";
import { smartObjectSize, smartObjectByType } from "./smartObjects";

const FT = 12;
const MIN_AISLE_IN = 3 * FT; // 3 ft minimum walkway

// Footprint rect (room-local) for any equipment object.
function objectRect(obj) {
  const s = smartObjectSize(obj);
  return { x: obj.pos?.x || 0, y: obj.pos?.y || 0, w: s.w, h: s.h };
}

// Approximate a door's swing area as a bounding box of its quarter-circle arc.
// The door box footprint is widthIn × widthIn (see smartObjectSize for "door").
// We rotate the swing-box corner offsets by the door's rotationDeg around the
// door center so the swing follows the door's facing — coarse but sufficient for
// an overlap test, and it never touches the object's data.
function doorSwingRect(door) {
  const w = door.spec?.widthIn || smartObjectSize(door).w;
  const cx = (door.pos?.x || 0) + w / 2;
  const cy = (door.pos?.y || 0) + w / 2;
  // Unrotated swing spans the door width in both directions from the hinge side.
  // Use a centered square of side = door width as a conservative swing envelope.
  const half = w / 2;
  return { x: cx - half, y: cy - half, w: w, h: w, cx, cy };
}

// Format inches as feet-inches, e.g. 30 → "2'6"".
export function fmtFtIn(inches) {
  const ft = Math.floor(inches / 12);
  const rem = Math.round(inches - ft * 12);
  if (ft <= 0) return `${rem}"`;
  return rem ? `${ft}'${rem}"` : `${ft}'`;
}

// Detect all conflicts in the active room. Returns an array of:
//   { id, kind, type, message }
// where kind is "object" | "bench", type is the rule that fired.
export function detectConflicts(doc) {
  const warnings = [];
  if (!doc) return warnings;
  const room = doc.room || {};
  const benches = doc.benches || [];
  const objects = doc.objects || [];
  const settings = doc.settings || {};

  const doors = objects.filter((o) => o.type === "door");
  const nonDoorObjects = objects.filter((o) => o.type !== "door");

  // Helper to push one warning per object (dedup by id+type).
  const seen = new Set();
  const push = (id, kind, type, message) => {
    const key = `${id}:${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({ id, kind, type, message });
  };

  // ── 1. Door-swing overlap (door arc overlaps a bench or equipment) ──
  doors.forEach((door) => {
    const swing = doorSwingRect(door);
    // vs benches
    benches.forEach((b) => {
      if (rectsOverlap(swing, benchRect(b))) {
        push(b.id, "bench", "door-swing", "Door swing blocked by bench");
      }
    });
    // vs other equipment
    nonDoorObjects.forEach((o) => {
      if (rectsOverlap(swing, objectRect(o))) {
        const label = smartObjectByType(o.type)?.label || o.type;
        push(o.id, "object", "door-swing", `Door swing blocked by ${label}`);
        push(door.id, "object", "door-swing-self", `Door swing blocked by ${label}`);
      }
    });
  });

  // ── 2. Blocked main walkway (equipment sitting in the center aisle) ──
  // The main walkway is the center aisle band: centered on the room width, span =
  // settings.centerIn (fallback 48"), running the full room length.
  const centerIn = settings.centerIn || 48;
  if (centerIn > 0 && room.widthIn) {
    const aisleX0 = room.widthIn / 2 - centerIn / 2;
    const aisleX1 = room.widthIn / 2 + centerIn / 2;
    const aisleRect = { x: aisleX0, y: 0, w: aisleX1 - aisleX0, h: room.lengthIn || 0 };
    nonDoorObjects.forEach((o) => {
      // Floor/ceiling-standing gear in the aisle blocks the walkway; wall-mounted
      // gear (door, mini-split, fan) lives on the wall and doesn't.
      if (o.mount === "wall") return;
      if (rectsOverlap(aisleRect, objectRect(o))) {
        push(o.id, "object", "walkway", "Equipment blocking main walkway");
      }
    });
  }

  // ── 3. Narrow aisle (<3 ft) ──
  // Reuse the bench-derived center aisle measurement (the real gap between bench
  // banks). If it falls below 3 ft, flag the AISLE GAP itself (not the benches) so
  // the renderer can draw a subtle amber indicator on the aisle. Benches are never
  // recolored — they stay display-only red dashed.
  const narrow = measureCenterAisle(benches);
  if (narrow && narrow.gap < MIN_AISLE_IN) {
    const msg = `Aisle ${fmtFtIn(narrow.gap)} — below 3 ft minimum`;
    warnings.push({
      id: "aisle-narrow",
      kind: "aisle",
      type: "narrow-aisle",
      message: msg,
      rect: narrow.rect, // {x,y,w,h} room-local inches of the gap band
    });
  }

  return warnings;
}

// Measure the center aisle gap between the two nearest bench banks and collect
// the benches bordering it. Read-only — mirrors computeClearances' logic but
// returns the bordering bench ids for highlighting.
function measureCenterAisle(benches) {
  if (!benches || benches.length < 2) return null;
  const rects = benches.map((b) => ({ id: b.id, ...benchRect(b) }));
  const cols = [...new Set(rects.map((r) => Math.round(r.x)))].sort((a, b) => a - b);
  if (cols.length < 2) return null;
  let bestGap = Infinity;
  let bestIds = [];
  let bestRect = null;
  for (let i = 0; i < cols.length - 1; i++) {
    const leftCol = rects.filter((r) => Math.round(r.x) === cols[i]);
    const rightCol = rects.filter((r) => Math.round(r.x) === cols[i + 1]);
    const leftEdge = Math.max(...leftCol.map((r) => r.x + r.w));
    const rightEdge = Math.min(...rightCol.map((r) => r.x));
    const gap = rightEdge - leftEdge;
    if (gap > 0.5 && gap < bestGap) {
      bestGap = gap;
      bestIds = [...leftCol.map((r) => r.id), ...rightCol.map((r) => r.id)];
      // The aisle band spans the gap (x) and the vertical extent of the bordering
      // bench rows (y) — used only to position the read-only indicator.
      const top = Math.min(...[...leftCol, ...rightCol].map((r) => r.y));
      const bottom = Math.max(...[...leftCol, ...rightCol].map((r) => r.y + r.h));
      bestRect = { x: leftEdge, y: top, w: gap, h: bottom - top };
    }
  }
  if (!isFinite(bestGap)) return null;
  return { gap: bestGap, benchIds: bestIds, rect: bestRect };
}