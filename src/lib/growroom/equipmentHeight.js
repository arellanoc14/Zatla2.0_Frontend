// Equipment vertical-height (pos.z) helpers — height ABOVE the floor in inches,
// where 0 = sitting on the floor and the value is the Y of the object's BOTTOM.
// Equipment only. Benches/lights/auto-layout never use this.
//
// The stored field is obj.pos.z (inches). When absent, each type falls back to
// its natural height (the same value the 3D scene currently uses):
//   • fan        → 5.5 ft mount (wall-snapped fans hang mid-wall)
//   • minisplit  → 8 ft mount   (wall-snapped AC sits high)
//   • floor types (dehumidifier, co2tank, door) → 0 (on the floor)
//   • ducting    → near the ceiling (handled by its own mount math; here we just
//                  default to a high value so the slider starts sensible)

import { WALL_HEIGHT_MULT } from "./walls";
import { smartObjectSize } from "./smartObjects";

// Mirrors the 3D render's ~6" proximity wall-snap rule: a fan/AC counts as
// wall-MOUNTED (default at mount height) only when its footprint edge sits
// within this distance of a room wall; otherwise it rests on the floor.
const WALL_SNAP_IN = 6;
function isNearAnyWall(obj, room) {
  if (!room?.widthIn || !room?.lengthIn) return true; // unknown room → keep legacy mount default
  const s = smartObjectSize(obj);
  const x = obj?.pos?.x || 0, y = obj?.pos?.y || 0;
  const gaps = [x, y, room.widthIn - (x + s.w), room.lengthIn - (y + s.h)];
  return Math.min(...gaps) <= WALL_SNAP_IN;
}

const FT = 12;

// Approximate VERTICAL extent (inches) of each equipment type's 3D mesh. Used to
// clamp height so the object's TOP never crosses the ceiling. Conservative values
// matching the procedural/GLB meshes so nothing pokes through the room.
const TYPE_HEIGHT_IN = {
  fan: 36,
  // AC is rendered at AC_SCALE = 4 in the 3D scene (Walkthrough3D), so its real
  // vertical extent is ~4× the unscaled ~12" body. Use the scaled height here so
  // the ceiling clamp accounts for the true model size and the top never pokes out.
  minisplit: 48,
  dehumidifier: 22,
  co2tank: 48,
  ducting: 24,
  door: 80,
};

// Vertical extent (inches) of the object — how tall it stands. Falls back to the
// footprint depth for unknown types.
export function getObjectHeightIn(obj) {
  if (!obj) return 12;
  // Ducting's real vertical extent is its diameter, which can exceed the default.
  if (obj.type === "ducting") return obj.spec?.diameterIn || TYPE_HEIGHT_IN.ducting;
  return TYPE_HEIGHT_IN[obj.type] ?? 12;
}

// The natural default Y (bottom height, inches) for a type when pos.z is absent —
// the same height the scene used before height control existed.
export function naturalHeightY(obj, ceilingIn = 144, room = null) {
  if (!obj) return 0;
  switch (obj.type) {
    case "fan": {
      // Always begin at max height (flush under the ceiling) — regardless of
      // wall proximity. The user can lower it with the height slider.
      const objH = TYPE_HEIGHT_IN.fan;
      const wallTop = (ceilingIn || 144) * (WALL_HEIGHT_MULT ?? 1);
      return Math.max(0, wallTop - objH);
    }
    case "minisplit":
      return isNearAnyWall(obj, room) ? 8 * FT : 0; // 8 ft
    case "controller":
      return isNearAnyWall(obj, room) ? 5 * FT : 0; // 5 ft
    case "ducting": {
      // Hang near the wall top but never poke above it: the mesh is center-anchored,
      // so its TOP = mountY + dia/2 must stay ≤ wall top (ceilingIn). Matches the
      // build path's mountY = wallTop − dia/2 − 2.
      const dia = obj.spec?.diameterIn || 24;
      return Math.max(0, ceilingIn - dia / 2 - 2);
    }
    default:
      return 0; // floor types
  }
}

// HARD clamp a height Y to [0, ceiling − objectHeight] so the object stays fully
// inside the room vertically — its bottom never below the floor, its top never
// above the ceiling.
export function clampHeightY(y, obj, ceilingIn = 144) {
  const objH = getObjectHeightIn(obj);
  // Clamp against the TRUE wall top (walls are built at ceilingIn * WALL_HEIGHT_MULT),
  // not raw ceilingIn — otherwise objects poke above the visible wall when mult < 1.
  const wallTop = (ceilingIn || 144) * (WALL_HEIGHT_MULT ?? 1);
  const maxY = Math.max(0, wallTop - objH);
  if (!Number.isFinite(y)) return 0;
  return Math.min(Math.max(y, 0), maxY);
}

// The current effective height Y for an object: stored pos.z if present, else the
// natural default.
export function effectiveHeightY(obj, ceilingIn = 144, room = null) {
  const z = obj?.pos?.z;
  if (typeof z === "number" && Number.isFinite(z)) return clampHeightY(z, obj, ceilingIn);
  // Always clamp the natural default too — otherwise default-height objects skip the
  // clamp and their TOP crosses the ceiling.
  return clampHeightY(naturalHeightY(obj, ceilingIn, room), obj, ceilingIn);
}