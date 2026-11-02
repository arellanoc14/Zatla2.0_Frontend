// Merge two adjacent rooms into ONE room whose outline is the union of both
// footprints (rect, L, T, …), and create custom-drawn polygon rooms.
//
// A merged/odd-shaped room stores an optional `polygon` — {x,y} points in
// ROOM-LOCAL inches (relative to `offset`, which stays the bounding-box
// origin). `room.widthIn/lengthIn` remain the polygon's bounding box so every
// existing consumer (stats, estimates, facility layout, 3D framing) keeps
// working; rooms without `polygon` behave exactly as before.
//
// Per the product decision: merging KEEPS each zone's benches exactly where
// they were — contents are only re-homed into the merged room's local space,
// never re-laid-out.

import { unionOutline, rectToPolygon, polygonBBox, polygonArea } from "./polygon";
// How far apart (inches) two rooms may sit and still count as sharing a wall.
// Rooms placed by hand are almost never at EXACTLY zero gap, so the second room
// is nudged flush against the first before the union is computed.
const SNAP_TOL = 30;
import { roomFloorRect } from "./facility";
import { DEFAULT_SETTINGS } from "./catalog";

const normRot = (room) => ((Math.round((room?.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360;

// A room's outline polygon in FACILITY inches (offset applied).
export function roomOutlineFacility(room) {
  const off = room.offset || { x: 0, y: 0 };
  if (Array.isArray(room.polygon) && room.polygon.length >= 3) {
    return room.polygon.map((p) => ({ x: p.x + (off.x || 0), y: p.y + (off.y || 0) }));
  }
  return rectToPolygon(roomFloorRect(room));
}

// Nudge roomB flush against roomA when they're within SNAP_TOL of touching, so
// a hand-placed room with a small gap (or slight overlap) still merges. Also
// squares up near-flush perpendicular edges so the merge doesn't leave a 2"
// sliver notch. Returns a shifted COPY of roomB (its offset moves, so all of
// its benches/lights/equipment travel with it).
function snapRoomB(roomA, roomB) {
  const A = polygonBBox(roomOutlineFacility(roomA));
  const B = polygonBBox(roomOutlineFacility(roomB));
  let dx = 0, dy = 0;

  const overlapX = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const overlapY = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);

  // Side-by-side (vertical overlap) → close the horizontal gap.
  if (overlapY > 1 && overlapX < 1) {
    dx = B.x > A.x ? A.x + A.w - B.x : A.x - (B.x + B.w);
    // Square up top/bottom edges that are nearly level.
    const dTop = A.y - B.y;
    const dBot = (A.y + A.h) - (B.y + B.h);
    if (Math.abs(dTop) <= SNAP_TOL) dy = dTop;
    else if (Math.abs(dBot) <= SNAP_TOL) dy = dBot;
  // Stacked (horizontal overlap) → close the vertical gap.
  } else if (overlapX > 1 && overlapY < 1) {
    dy = B.y > A.y ? A.y + A.h - B.y : A.y - (B.y + B.h);
    const dLeft = A.x - B.x;
    const dRight = (A.x + A.w) - (B.x + B.w);
    if (Math.abs(dLeft) <= SNAP_TOL) dx = dLeft;
    else if (Math.abs(dRight) <= SNAP_TOL) dx = dRight;
  }

  if (Math.abs(dx) > SNAP_TOL || Math.abs(dy) > SNAP_TOL) return roomB; // too far — leave it
  if (dx === 0 && dy === 0) return roomB;
  const off = roomB.offset || { x: 0, y: 0 };
  return { ...roomB, offset: { x: (off.x || 0) + dx, y: (off.y || 0) + dy } };
}

// Validate a merge and compute the union outline.
// Returns { ok, reason? } or { ok: true, outline, roomB } — roomB is the
// gap-snapped copy the merge must actually use.
export function canMergeRooms(roomA, roomB) {
  if (!roomA || !roomB) return { ok: false, reason: "Pick two rooms to merge." };
  if (normRot(roomA) !== 0 || normRot(roomB) !== 0) {
    return { ok: false, reason: "Rotate both rooms back to 0° before merging." };
  }
  const snapped = snapRoomB(roomA, roomB);
  const outline = unionOutline(roomOutlineFacility(roomA), roomOutlineFacility(snapped));
  if (!outline) {
    return { ok: false, reason: "These rooms don't share a wall — move them side by side (or one above the other) so their walls line up, then merge." };
  }
  return { ok: true, outline, roomB: snapped };
}

// Merge roomB into roomA. Returns the merged room (keeps roomA's id) or null.
// Benches/lights/doors/objects from BOTH rooms are preserved in place —
// shifted from each source room's local space into the merged room's local
// space (facility positions are unchanged).
export function mergeRooms(roomA, rawRoomB) {
  const check = canMergeRooms(roomA, rawRoomB);
  if (!check.ok) return null;
  // Use the gap-snapped roomB so its contents shift with it.
  const roomB = check.roomB;
  const outline = check.outline;
  const bbox = polygonBBox(outline);
  const origin = { x: bbox.x, y: bbox.y };
  const polygon = outline.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));

  const shiftItems = (room) => {
    const off = room.offset || { x: 0, y: 0 };
    const dx = (off.x || 0) - origin.x;
    const dy = (off.y || 0) - origin.y;
    const shift = (arr) => (arr || []).map((it) => ({
      ...it,
      pos: { ...(it.pos || {}), x: (it.pos?.x || 0) + dx, y: (it.pos?.y || 0) + dy },
    }));
    return {
      benches: shift(room.benches),
      lights: shift(room.lights),
      doors: shift(room.doors),
      objects: shift(room.objects),
    };
  };
  const a = shiftItems(roomA);
  const b = shiftItems(roomB);

  const merged = {
    ...roomA,
    name: [roomA.name, roomB.name].filter(Boolean).join(" + ") || "Merged Room",
    offset: origin,
    rotationDeg: 0,
    room: {
      widthIn: bbox.w,
      lengthIn: bbox.h,
      ceilingIn: Math.max(roomA.room?.ceilingIn || 144, roomB.room?.ceilingIn || 144),
    },
    settings: roomA.settings || { ...DEFAULT_SETTINGS },
    benches: [...a.benches, ...b.benches],
    lights: [...a.lights, ...b.lights],
    doors: [...a.doors, ...b.doors],
    objects: [...a.objects, ...b.objects],
    initialized: true,
  };
  // A 4-corner rectilinear loop IS a plain rectangle — no polygon needed, the
  // merged room behaves exactly like a normal rect room.
  if (polygon.length > 4) merged.polygon = polygon;
  else delete merged.polygon;
  return merged;
}

// Build a new room from a user-drawn outline (points in FACILITY inches).
// Points are snapped to the 1ft grid; a diagonal closing segment gets its
// missing corner inserted so the outline stays rectilinear. The room starts
// with NO benches — the user places rows or runs the shape-aware auto-fill.
export function makePolygonRoom(rawPoints, existingCount = 0) {
  const pts = [];
  (rawPoints || []).forEach((p) => {
    const q = { x: Math.round(p.x / 12) * 12, y: Math.round(p.y / 12) * 12 };
    const last = pts[pts.length - 1];
    if (last && last.x === q.x && last.y === q.y) return;
    pts.push(q);
  });
  if (pts.length > 1) {
    const f = pts[0], l = pts[pts.length - 1];
    if (f.x === l.x && f.y === l.y) pts.pop(); // drop a duplicated closing point
  }
  if (pts.length < 3) return null;
  // Rectilinear closure: if last→first is diagonal, insert the missing corner.
  const f = pts[0], l = pts[pts.length - 1];
  if (f.x !== l.x && f.y !== l.y) pts.push({ x: f.x, y: l.y });
  if (polygonArea(pts) < 24 * 24) return null; // degenerate outline

  const bbox = polygonBBox(pts);
  const polygon = pts.map((p) => ({ x: p.x - bbox.x, y: p.y - bbox.y }));
  const room = {
    id: `room_${Date.now().toString(36)}`,
    name: `Custom Room ${existingCount + 1}`,
    offset: { x: bbox.x, y: bbox.y },
    rotationDeg: 0,
    room: { widthIn: bbox.w, lengthIn: bbox.h, ceilingIn: 144 },
    settings: { ...DEFAULT_SETTINGS },
    benches: [],
    lights: [],
    doors: [],
    objects: [],
    initialized: true,
    lightModel: "phoenix",
    canopyMode: "canopy",
  };
  // A 4-corner outline is a plain rectangle — no polygon field needed.
  if (polygon.length > 4) room.polygon = polygon;
  return room;
}