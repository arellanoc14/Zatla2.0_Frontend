// Pure geometry helpers for the 3D studio (Walkthrough3D). Extracted to keep the
// scene component under the file-size limit. None of these touch THREE or scene
// state — they operate purely on plain {x,y}/{w,h} numbers in room-local inches.

// Proximity test for fan/AC GLB placement: is the object's footprint (centered at
// room-local cx/cz, size {w,h}) within ~6" of any wall of a roomW×roomL room?
// Mirrors the drag-time WALL_SNAP_NEAR so a free-placed fan/AC renders where it was
// dropped, and a near-wall one snaps flush.
export function isNearWall(cxp, czp, size, roomWidth, roomLength) {
  const s = size || { w: 12, h: 12 };
  const edge = Math.min(
    cxp - s.w / 2,                       // left
    roomWidth - (cxp + s.w / 2),         // right
    czp - s.h / 2,                       // top
    roomLength - (czp + s.h / 2)         // bottom
  );
  return edge <= 6;
}

// Distance (inches) at which a fan/AC's nearest edge "grabs" a wall.
export const WALL_SNAP_NEAR = 6;

// PROXIMITY wall snap for fan/AC only. If the dragged footprint's nearest edge is
// within WALL_SNAP_NEAR of a wall, pin that perpendicular axis flush to the wall
// and clamp the along-wall axis within the span — returns { snapped:true }.
// Otherwise the object stays where it is (free move) — returns { snapped:false },
// and the caller clamps it inside the room like any other equipment.
// Pass alwaysSnap=true (controller — door-like) to ALWAYS pin to the nearest
// wall regardless of distance, instead of the ~6" proximity grab.
export function snapToWall(pos, ctx, alwaysSnap = false) {
  const W = ctx.roomW || 0, L = ctx.roomL || 0;
  const s = ctx.size || { w: 12, h: 12 };
  let cxp = pos.x + s.w / 2;   // dragged center (room-local)
  let cyp = pos.y + s.h / 2;
  const edge = { top: cyp - s.h / 2, bottom: L - (cyp + s.h / 2), left: cxp - s.w / 2, right: W - (cxp + s.w / 2) };
  const wall = Object.keys(edge).reduce((a, b) => (edge[a] <= edge[b] ? a : b));
  if (!alwaysSnap && edge[wall] > WALL_SNAP_NEAR) return { snapped: false, pos };
  if (wall === "top") cyp = s.h / 2;
  else if (wall === "bottom") cyp = L - s.h / 2;
  else if (wall === "left") cxp = s.w / 2;
  else if (wall === "right") cxp = W - s.w / 2;
  cxp = Math.min(Math.max(cxp, s.w / 2), Math.max(s.w / 2, W - s.w / 2));
  cyp = Math.min(Math.max(cyp, s.h / 2), Math.max(s.h / 2, L - s.h / 2));
  return { snapped: true, wall, pos: { x: cxp - s.w / 2, y: cyp - s.h / 2 } };
}

// Clamp any equipment's room-local top-left pos fully inside the room walls
// (footprint can't cross out). Used for free movement of every type.
export function clampPosToRoom(pos, ctx) {
  const W = ctx.roomW || 0, L = ctx.roomL || 0;
  const s = ctx.size || { w: 12, h: 12 };
  const x = Math.min(Math.max(pos.x, 0), Math.max(0, W - s.w));
  const y = Math.min(Math.max(pos.y, 0), Math.max(0, L - s.h));
  return { x, y };
}

// The wall inset every 3D containment uses — half the 12" wall thickness. Matches
// the build path so a dragged object seats exactly where the rebuilt one renders.
export const HALF_WALL = 6;

// Given a candidate room-local pos and the object's REAL room-axis-aligned bounding
// box edges (minX/maxX/minZ/maxZ, already un-rotated into 0,0-origin room space by
// the caller), push each edge back inside the W×L room walls with a HALF_WALL inset.
// Rotation-aware because the bbox was measured in world space. min edge wins when
// the object is larger than the room, so it pins to the near wall instead of
// fighting back out. Returns the corrected pos { x, y }.
export function containBoxInRoom(pos, edges, roomW, roomL) {
  const W = roomW || 0, L = roomL || 0;
  const { minX, maxX, minZ, maxZ } = edges;
  let dx = 0, dz = 0;
  if (minX < HALF_WALL)            dx = HALF_WALL - minX;
  else if (maxX > W - HALF_WALL)   dx = (W - HALF_WALL) - maxX;
  if (minZ < HALF_WALL)            dz = HALF_WALL - minZ;
  else if (maxZ > L - HALF_WALL)   dz = (L - HALF_WALL) - maxZ;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  return { x: pos.x + dx, y: pos.y + dz };
}