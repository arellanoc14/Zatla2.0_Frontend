// Room-boundary containment engine. All inches. Pure functions.
//
// Guarantees every object's footprint stays fully inside the room envelope with a
// minimum wall clearance. Used by the 3D viewer to clamp geometry before building
// so nothing clips through the perimeter walls, ceiling, or floor.
//
// Room axes: room.widthIn -> X, room.lengthIn -> Z (length).

import { benchRect } from "./clearances";

// Minimum clearance kept between any rack and the walls (12in), capped so it never
// exceeds a quarter of the room dimension on very small rooms.
const MIN_WALL_IN = 12;

// Clamp a value into [lo, hi]; if the object is wider than the available band,
// center it so it overflows symmetrically (still the most contained option).
function clampPos(pos, size, lo, hi) {
  const max = hi - size;
  if (max < lo) return (lo + max) / 2; // larger than band → center it
  return Math.min(Math.max(pos, lo), max);
}

// Clamp an axis-aligned rect {x,y,w,h} inside the room with wall clearance.
// Returns the clamped top-left {x, y}.
function clampRect(x, y, w, h, room, clearance) {
  const cw = Math.min(clearance, room.widthIn / 4, room.lengthIn / 4);
  return {
    x: clampPos(x, w, cw, room.widthIn - cw),
    y: clampPos(y, h, cw, room.lengthIn - cw),
  };
}

// Clamp every bench so its full footprint (and therefore its base rails, casters,
// tracks and fascia — which are all built inside the footprint) stays in-room.
//
// There used to be a hardcoded 6" VISUAL_INSET added on top of the configured
// wall clearance, so bench legs could never visually clip the perimeter in 3D.
// It was removed because it did not stay cosmetic: the auto-layout places the
// first column at x = wallIn, containment then pushed it to wallIn + 6, and the
// 3D dimension labels — which measure the ACTUAL gap between wall and bench —
// correctly reported 0' 6" for a room configured with a 0" wall aisle. A silent
// 6" shift is a real bench-position error on a drawing someone builds from, so
// the configured clearance is now honoured exactly: 0 means 0.
//
// If bench geometry ever visibly intersects a wall, thicken the wall inward in
// the 3D scene — do not reintroduce an offset here, or the layout and its own
// labels will disagree again.
export function containBenches(benches = [], room, wallIn = MIN_WALL_IN) {
  const clearance = Math.max(0, wallIn || 0);
  return benches.map((b) => {
    const r = benchRect(b);
    const { x, y } = clampRect(r.x, r.y, r.w, r.h, room, clearance);
    if (x === r.x && y === r.y) return b;
    // benchRect may swap w/h for 90/270 rotation; translate the rect origin back
    // onto the bench pos (pos is the un-rotated top-left, same origin as rect).
    return { ...b, pos: { x, y } };
  });
}

// Lights hang above benches; keep their footprint inside the room too (no wall
// clearance needed for ceiling fixtures, just the envelope).
export function containLights(lights = [], room) {
  return lights.map((l) => {
    const w = l.footprintIn.w, h = l.footprintIn.h;
    const { x, y } = clampRect(l.pos.x, l.pos.y, w, h, room, 0);
    if (x === l.pos.x && y === l.pos.y) return l;
    return { ...l, pos: { x, y } };
  });
}

// Equipment boxes clamped fully inside the room envelope.
export function containEquipment(equipment = [], room) {
  return equipment.map((e) => {
    const w = e.sizeIn.w, h = e.sizeIn.h;
    const { x, y } = clampRect(e.pos.x, e.pos.y, w, h, room, 0);
    if (x === e.pos.x && y === e.pos.y) return e;
    return { ...e, pos: { x, y } };
  });
}

// Produce a fully-contained copy of the doc for rendering. Does NOT mutate the
// source doc — purely a render-time safety pass.
export function containDoc(doc) {
  const room = doc.room;
  const wallIn = doc.settings?.wallIn ?? MIN_WALL_IN;
  return {
    ...doc,
    benches: containBenches(doc.benches, room, wallIn),
    lights: containLights(doc.lights, room),
    equipment: containEquipment(doc.equipment, room),
  };
}