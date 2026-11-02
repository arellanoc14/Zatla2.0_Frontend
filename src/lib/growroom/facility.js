// Facility / multi-room helpers for the 2D floor view.
//
// The studio edits the ACTIVE room through the flat top-level doc fields
// (room, settings, benches, lights, doors). doc.rooms[] holds every room with
// its own offset + geometry; doc.activeRoomId points at the one being edited.
// These helpers move data between the flat working fields and doc.rooms[],
// without ever touching each room's internal bench-layout logic — only the
// room's offset/placement on the facility floor is new.

import { DEFAULT_SETTINGS } from "./catalog";
import { autoLayoutByRoom } from "./autolayout";
import { makeSmartObject, smartObjectSize } from "./smartObjects";
import { pointInPolygon } from "./polygon";

// Build a door placed flush at the FRONT wall (top edge, y=0), centered across
// the room width. Used to give every new room a default entry door.
function makeFrontDoor(roomGeom) {
  const door = makeSmartObject("door", { x: 0, y: 0 });
  if (!door) return null;
  const s = smartObjectSize(door);
  door.pos = { x: Math.round((roomGeom.widthIn - s.w) / 2), y: 0 };
  return door;
}

const GRID = 12; // 1 ft snap grid, matches usePlanInteraction

export const FACILITY_GRID = GRID;

// Snap an inch value to the 1ft grid.
export function snapToGrid(v) {
  return Math.round(v / GRID) * GRID;
}

// The flat working fields packed into a room-shaped object (geometry only).
// NOTE: rotationDeg is intentionally OMITTED here — the active room's rotation is
// committed directly into rooms[].rotationDeg by the rotate action (snapped to a
// clean 90° step), so it must NOT be re-derived from the flat field, which lags
// during the spin animation and can clobber the just-committed angle back to 0.
export function activeRoomGeometry(d) {
  return {
    room: d.room,
    settings: d.settings,
    benches: d.benches || [],
    lights: d.lights || [],
    doors: d.doors || [],
    objects: d.objects || [],
  };
}

// Write the flat working fields back into the matching entry of doc.rooms[],
// preserving id / name / offset, the room's committed rotationDeg, and every
// other room. Returns a new rooms array. rotationDeg is preserved from the
// existing room entry (set by the rotate action), never overwritten from the
// transient flat field.
export function commitActiveRoom(d) {
  const rooms = Array.isArray(d.rooms) ? d.rooms : [];
  if (rooms.length === 0) return rooms;
  const activeId = d.activeRoomId;
  // Only mirror the flat working fields into the slot that genuinely matches the
  // active room id. If there's no valid active room (null/undefined or not in
  // rooms[]), the flat fields don't reliably belong to any room — return rooms
  // UNCHANGED. NEVER fall back to writing into rooms[0]: that's exactly what
  // smeared one room's dims onto another and "resized" rooms on switch/add.
  if (!activeId || !rooms.some((r) => r.id === activeId)) return rooms;
  return rooms.map((r) =>
    r.id === activeId ? { ...r, ...activeRoomGeometry(d) } : r
  );
}

// Normalized room rotation in degrees (0 | 90 | 180 | 270).
export function roomRotation(room) {
  return ((Math.round((room?.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360;
}

// The bounding rect (in facility inches) of a room given its offset + size.
// Honors 90°/270° rotation: at those angles the footprint's width/length swap so
// the rect reflects the room's actual on-floor span. CRITICAL: rotation happens
// about the room's CENTER (matching the 2D canvas + 3D, which both rotate the
// room around its center). So the swapped rect is re-centered on the SAME center
// as the unrotated room (offset + unrotated-dims/2), not re-anchored at the raw
// offset. This keeps the drawn footprint, collision/bounds, thumbnail, and 3D all
// in agreement — benches no longer spill outside the outline after a 90° turn.
export function roomFloorRect(room) {
  const off = room.offset || { x: 0, y: 0 };
  const w = room.room?.widthIn || 0;
  const h = room.room?.lengthIn || 0;
  const swap = roomRotation(room) === 90 || roomRotation(room) === 270;
  const ox = off.x || 0, oy = off.y || 0;
  // Center of the UNROTATED room (the axis everything rotates about).
  const cx = ox + w / 2, cy = oy + h / 2;
  const sw = swap ? h : w;
  const sh = swap ? w : h;
  return {
    x: cx - sw / 2,
    y: cy - sh / 2,
    w: sw,
    h: sh,
  };
}

// Axis-aligned rect overlap test (touching edges is allowed).
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Does a rect overlap a room's ACTUAL footprint? Merged / custom-drawn rooms
// carry an L/T outline, so the notch of an L is genuinely free floor — a new
// room may sit there even though it falls inside the bounding box. Sampled on a
// 1ft grid over the rect, plus the outline's own corners.
export function roomOverlapsRect(room, rect) {
  const box = roomFloorRect(room);
  if (!rectsOverlap(rect, box)) return false;
  const poly = room.polygon;
  if (!Array.isArray(poly) || poly.length < 3) return true;
  const off = room.offset || { x: 0, y: 0 };
  const abs = poly.map((p) => ({ x: p.x + (off.x || 0), y: p.y + (off.y || 0) }));
  if (abs.some((p) => p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h)) return true;
  const STEP = 12;
  const nx = Math.max(1, Math.min(80, Math.floor(rect.w / STEP)));
  const ny = Math.max(1, Math.min(80, Math.floor(rect.h / STEP)));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const pt = {
        x: rect.x + ((i + 0.5) * rect.w) / nx,
        y: rect.y + ((j + 0.5) * rect.h) / ny,
      };
      if (pointInPolygon(pt, abs, false)) return true;
    }
  }
  return false;
}

// The active room's dimensions PLUS its outline polygon (when it's a merged /
// drawn room), so equipment + door placement can respect the real shape instead
// of the bounding box.
export function activeRoomDims(d) {
  const r = (d?.rooms || []).find((x) => x.id === d.activeRoomId);
  const poly = Array.isArray(r?.polygon) && r.polygon.length >= 3 ? r.polygon : null;
  return poly ? { ...d.room, polygon: poly } : d.room;
}

// Do two rooms actually overlap? Polygon-aware in BOTH directions, so a room
// sitting in the notch of a merged L-shaped room isn't flagged as colliding.
export function roomsOverlap(a, b) {
  return roomOverlapsRect(a, roomFloorRect(b)) && roomOverlapsRect(b, roomFloorRect(a));
}

// Does a candidate room rect collide with any other room (excluding itself)?
export function roomCollides(rooms, candidateId, rect) {
  return rooms.some((r) => {
    if (r.id === candidateId) return false;
    return roomOverlapsRect(r, rect);
  });
}

// Would the active room, rotated to `angleDeg` (90° steps), overlap any OTHER
// room on the facility floor? Rotation is about the room's CENTER, so the rotated
// footprint stays centered where the room is now and only its W/L span swaps at
// 90°/270°. Used to BLOCK a rotate tap that would collide.
export function roomRotationCollides(rooms, roomId, angleDeg) {
  const self = rooms.find((r) => r.id === roomId);
  if (!self) return false;
  const cur = roomFloorRect(self);
  const cx = cur.x + cur.w / 2;
  const cy = cur.y + cur.h / 2;
  const w = self.room?.widthIn || 0;
  const h = self.room?.lengthIn || 0;
  const swap = ((Math.round(angleDeg / 90) * 90) % 360 + 360) % 360;
  const span = (swap === 90 || swap === 270) ? { w: h, h: w } : { w, h };
  const candidate = { x: cx - span.w / 2, y: cy - span.h / 2, w: span.w, h: span.h };
  return rooms.some((r) => {
    if (r.id === roomId) return false;
    return rectsOverlap(candidate, roomFloorRect(r));
  });
}

// ── Auto-nudge overlap resolution ──────────────────────────────────────────
// When a moved/added/rotated room ends up overlapping a neighbor by a SMALL
// amount, shift it the minimum distance along the smallest-penetration axis so
// its edge sits flush against the neighbor (no gap, no overlap). Picks the side
// that moves it the least, stays within facility bounds, and never produces a
// new overlap. Large overlaps return null so the caller falls back to block /
// snap-back. Only the room's offset moves — its contents ride along untouched.

// How deep an overlap (in inches) still counts as "small" and auto-snaps flush.
// Beyond this on BOTH axes, treat it as a gross drop and let the caller block.
const MAX_NUDGE_IN = 96; // 8 ft

// Penetration depth of two overlapping rects on each axis.
function penetration(a, b) {
  const px = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const py = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { px, py };
}

// Smallest overlap penetration depth (inches) between the room at `roomId` and
// any OTHER room, using the rotation-aware footprint rects. Returns 0 when the
// room doesn't overlap anything. Used to classify a drop as a tiny overlap
// (auto-nudge candidate) vs a major overlap (block + snap back). Read-only —
// never moves or mutates a room.
export function roomOverlapDepth(rooms, roomId) {
  const self = rooms.find((r) => r.id === roomId);
  if (!self) return 0;
  const rect = roomFloorRect(self);
  let depth = 0;
  rooms.forEach((r) => {
    if (r.id === roomId) return;
    const o = roomFloorRect(r);
    if (!rectsOverlap(rect, o)) return;
    const { px, py } = penetration(rect, o);
    // The shallower axis is how far the room must move to become flush — that's
    // the meaningful "how deep is this overlap" measure for the nudge decision.
    depth = Math.max(depth, Math.min(px, py));
  });
  return depth;
}

// Try to resolve overlaps for the room at `roomId` by nudging its offset flush
// against neighbors. Returns a snapped {x,y} offset, or null if it can't be
// resolved with a small nudge (gross overlap / no valid flush position).
export function resolveRoomOverlap(rooms, roomId, facility) {
  const self = rooms.find((r) => r.id === roomId);
  if (!self) return null;
  const others = rooms.filter((r) => r.id !== roomId);

  let rect = roomFloorRect(self);
  // Facility floor auto-grows in any direction to fit content, so a flush nudge
  // is never rejected for leaving a fixed boundary — the floor expands instead.
  const inBounds = () => true;

  // Nothing to resolve when the room doesn't actually overlap any neighbor. Return
  // null so the caller leaves the room's offset untouched. (Without this, a lone
  // rotated room would get its offset rewritten to the re-centered rect origin —
  // shifting it left/up by (w-h)/2 on a 90°/270° turn.)
  if (!others.some((r) => rectsOverlap(rect, roomFloorRect(r)))) return null;

  // Iteratively push out of the deepest overlap, up to a few passes (resolving
  // one neighbor can introduce contact with another).
  for (let pass = 0; pass < 6; pass++) {
    const hit = others
      .map((r) => ({ r, rect: roomFloorRect(r) }))
      .filter(({ rect: o }) => rectsOverlap(rect, o))
      .sort((a, b) => {
        const pa = penetration(rect, a.rect);
        const pb = penetration(rect, b.rect);
        return Math.min(pb.px, pb.py) - Math.min(pa.px, pa.py);
      })[0];

    if (!hit) break; // no overlaps left — resolved

    const o = hit.rect;
    const { px, py } = penetration(rect, o);

    // Gross drop: deep overlap on BOTH axes → bail to caller's fallback.
    if (Math.min(px, py) > MAX_NUDGE_IN) return null;

    // Candidate flush moves: minimum displacement along whichever axis is the
    // shallower penetration, on the side that moves the room the least.
    // EXACT flush positions — NOT snapped to the grid. Rooms can sit at non-grid
    // offsets/widths, so snapping a flush position re-introduced a fresh sliver of
    // overlap, which made the resolver oscillate and drops get rejected.
    const candidates = [];
    // Horizontal: push left flush or right flush.
    candidates.push({ x: o.x - rect.w, y: rect.y, cost: px, side: "x" });
    candidates.push({ x: o.x + o.w, y: rect.y, cost: px, side: "x" });
    // Vertical: push up flush or down flush.
    candidates.push({ x: rect.x, y: o.y - rect.h, cost: py, side: "y" });
    candidates.push({ x: rect.x, y: o.y + o.h, cost: py, side: "y" });

    // Keep only in-bounds candidates that collide with NO room at all (including
    // the one we just resolved against — the old filter skipped it, so a candidate
    // could be "accepted" while still overlapping it). Pick the cheapest.
    const valid = candidates
      .map((c) => ({ ...c, rect: { x: c.x, y: c.y, w: rect.w, h: rect.h } }))
      .filter((c) => inBounds(c.rect))
      .filter((c) => !others.some((r) => rectsOverlap(c.rect, roomFloorRect(r))))
      .sort((a, b) => Math.abs(a.cost) - Math.abs(b.cost));

    if (valid.length === 0) return null; // nowhere flush fits within bounds
    rect = valid[0].rect;
  }

  // `rect` is a roomFloorRect — the ROTATED footprint, re-centered on the room's
  // center. For a 90°/270° room its origin differs from the stored offset by the
  // (w−h)/2 re-centering, so returning rect.x/y directly would shift a rotated room
  // by that amount on every resolve (the "first room jumps to a random spot" bug).
  // Invert the re-centering to recover the true stored offset: the room center is
  // rect.x + rect.w/2, and offset = center − unrotatedDims/2.
  const w = self.room?.widthIn || 0;
  const h = self.room?.lengthIn || 0;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  // Return the EXACT flush offset — snapping to the grid here could shift the
  // room back into overlap against a non-grid-aligned neighbor.
  return { x: cx - w / 2, y: cy - h / 2 };
}

// Comfortable floor margin (inches) kept around the outermost rooms so there's
// always space to drag a room further out in any direction.
export const FACILITY_PAD = 48; // 4 ft

// Compute the facility footprint as the bounding box of every room's footprint
// (offset + rotated dims) padded on ALL sides. Rooms may sit at negative offsets,
// so the box has its own origin (minX/minY) — the floor grows up/left as well as
// down/right. `origin` is where the floor's top-left corner sits in room-offset
// space; width/length span the whole content + padding.
export function facilityBox(d) {
  const rooms = Array.isArray(d.rooms) ? d.rooms : [];
  if (rooms.length === 0) {
    const stored = d.facility || {};
    return { x: 0, y: 0, widthIn: stored.widthIn || 240, lengthIn: stored.lengthIn || 240 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    const rect = roomFloorRect(r);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  });
  return {
    x: minX - FACILITY_PAD,
    y: minY - FACILITY_PAD,
    widthIn: (maxX - minX) + FACILITY_PAD * 2,
    lengthIn: (maxY - minY) + FACILITY_PAD * 2,
  };
}

// Backward-compatible facility size (width/length) derived from the bounding box.
export function computeFacility(d) {
  const box = facilityBox(d);
  return { widthIn: box.widthIn, lengthIn: box.lengthIn };
}

// TIGHT facility footprint (NO padding) — the true bounding box of every room's
// rotated footprint at its offset. For project-level DISPLAY (e.g. home cards),
// never editor floor sizing. Legacy docs without rooms[] fall back to the flat
// room dims so single-room projects still read correctly.
export function facilityFootprint(d) {
  const rooms = Array.isArray(d.rooms) ? d.rooms : [];
  if (rooms.length === 0) {
    const room = d.room || {};
    return { widthIn: room.widthIn || 0, lengthIn: room.lengthIn || 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    const rect = roomFloorRect(r);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  });
  return { widthIn: maxX - minX, lengthIn: maxY - minY };
}

// Find a non-overlapping position for a new room. Prefer the four sides of the
// currently selected room so Add Room places the new room beside the room the user
// is working on. Fall back to the facility grid only when every adjacent side is occupied.
export function findFreeSlot(rooms, sizeIn, facility, anchorRoomId = null) {
  const anchor = rooms.find((room) => room.id === anchorRoomId);
  if (anchor) {
    const rect = roomFloorRect(anchor);
    const adjacentSlots = [
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x - sizeIn.widthIn, y: rect.y },
      { x: rect.x, y: rect.y - sizeIn.lengthIn },
    ];
    const openSlot = adjacentSlots.find((offset) =>
      !roomCollides(rooms, null, { x: offset.x, y: offset.y, w: sizeIn.widthIn, h: sizeIn.lengthIn })
    );
    if (openSlot) return openSlot;
  }

  const step = GRID * 2; // search every 2ft
  const maxX = Math.max(facility.widthIn, sizeIn.widthIn) + sizeIn.widthIn;
  const maxY = Math.max(facility.lengthIn, sizeIn.lengthIn) + sizeIn.lengthIn;
  for (let y = 0; y <= maxY; y += step) {
    for (let x = 0; x <= maxX; x += step) {
      const rect = { x, y, w: sizeIn.widthIn, h: sizeIn.lengthIn };
      if (!roomCollides(rooms, null, rect)) {
        return { x: snapToGrid(x), y: snapToGrid(y) };
      }
    }
  }
  // Fallback: drop it to the right of everything.
  return { x: snapToGrid(facility.widthIn), y: 0 };
}

// Build a fresh empty room of default size, placed in the first free slot.
export function makeNewRoom(d) {
  const rooms = Array.isArray(d.rooms) ? d.rooms : [];
  const n = rooms.length + 1;
  const size = { widthIn: 240, lengthIn: 240 }; // 20ft × 20ft default
  const facility = computeFacility(d);
  const offset = findFreeSlot(rooms, size, facility, d.activeRoomId);
  const roomGeom = { widthIn: size.widthIn, lengthIn: size.lengthIn, ceilingIn: d.room?.ceilingIn || 144 };
  const settings = { ...DEFAULT_SETTINGS };
  // Lay out benches immediately on creation (default 4ft rolling, single tier) so a
  // brand-new room shows its benches right away — instead of appearing empty until
  // the user happens to click/resize it, which was confusing.
  const { benches } = autoLayoutByRoom(roomGeom, settings, 4, "rolling", 1);
  return {
    id: `room_${Date.now().toString(36)}`,
    name: `Room ${n}`,
    offset,
    room: roomGeom,
    // Always start a new room at the safe default clearances (center aisle 36" =
    // 3ft min, front 36", back 6" flush-allowed, walls flush) so a fresh room has
    // zero conflict warnings out of the box — never inherit the current room's
    // possibly-tightened settings. Fully user-adjustable after creation.
    settings,
    benches,
    lights: [],
    doors: [],
    // Every new room ships with a default entry door centered on the FRONT wall.
    objects: [],
    // Explicit per-room grow-light and canopy defaults so both settings persist
    // independently with this room from its first save.
    lightModel: "phoenix",
    canopyMode: "canopy",
  };
}