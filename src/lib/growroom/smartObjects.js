// Smart equipment object catalog — per-room objects placed in the 2D view.
//
// Each placed object stores: { id, type, pos:{x,y}, rotationDeg, mount, spec }.
// `mount` is one of: wall | floor | ceiling. `spec` holds the type's smart
// values (editable later). This is DATA + 2D placement only — no 3D, no calcs.
// Objects live per-room (rooms[].objects), mirroring how benches work.

import { DoorOpen, Snowflake, Droplets, Fan, Wind, Cylinder, Cpu } from "lucide-react";
import { nearestPolygonWall, fitRectInPolygon } from "./polygon";

// 6 cannabis-facility equipment types with default footprint (inches) + specs.
export const SMART_OBJECTS = [
  {
    type: "door",
    label: "Door",
    group: "Structure",
    mount: "wall",
    icon: DoorOpen,
    sizeIn: { w: 72, h: 6 },
    // hinge: which jamb the leaf hangs on (left|right); swing: in|out of the room.
    spec: { widthIn: 72, hinge: "left", swing: "in" },
  },
  {
    type: "minisplit",
    label: "HVAC",
    group: "Climate",
    mount: "wall",
    icon: Snowflake,
    sizeIn: { w: 42, h: 12 },
    spec: { coolingBtu: 24000, powerKw: 2.5 },
  },
  {
    type: "dehumidifier",
    label: "Dehumidifier",
    group: "Climate",
    mount: "floor",
    icon: Droplets,
    // Horizontal Quest-style unit footprint (~0.9m wide × 0.6m deep).
    sizeIn: { w: 35, h: 24 },
    spec: { brand: "", pintsPerDay: 70, powerW: 700, quantity: 1 },
  },
  {
    type: "fan",
    label: "Oscillating Fan",
    group: "Air",
    mount: "wall",
    icon: Fan,
    sizeIn: { w: 48, h: 48 },
    // Newly placed fans face BACK-to-front: the fan's back points at the front of
    // the room (heading 180).
    defaultRotationDeg: 180,
    spec: { cfm: 2000, powerW: 120 },
  },
  {
    type: "ducting",
    label: "Ducting Run",
    group: "Air",
    mount: "ceiling",
    icon: Wind,
    // 8 ft long — runs vertically down the aisle (along room length), so width is
    // the duct diameter and height is the run length.
    sizeIn: { w: 24, h: 96 },
    // Multi-component HVAC run: galvanized duct + inline extraction fan + optional
    // carbon filter. fanWatts feeds the equipment power rollup as its own additive
    // line (separate extraction fan, NOT the oscillating fan object).
    spec: { lengthIn: 96, diameterIn: 24, fanCfm: 400, fanWatts: 250, carbonFilter: true },
  },
  {
    type: "co2tank",
    label: "CO₂ Tank",
    group: "Climate",
    mount: "floor",
    icon: Cylinder,
    sizeIn: { w: 24, h: 24 },
    // Compressed CO₂ supply cylinder. `enriched` is the EXISTING yield hook (keeps
    // the room's CO₂ factor at Enriched 1.0) — do not rename/remove. The rest are
    // display/target + model fields: tank size scales the 3D model, ppmTarget is a
    // display target only (no new yield math), solenoidActive animates the LED.
    spec: {
      enriched: true,
      tankSizeLb: 20,
      tankPsi: 800,
      outputPsi: 20,
      ppmTarget: 1200,
      solenoidActive: true,
      safetyCap: false,
    },
  },
  {
    type: "controller",
    label: "Controller",
    group: "Climate",
    mount: "wall",
    icon: Cpu,
    // Wall-mounted environmental controller panel.
    sizeIn: { w: 16, h: 4 },
    spec: { brand: "", powerW: 30 },
  },
];

export function smartObjectByType(type) {
  return SMART_OBJECTS.find((o) => o.type === type) || null;
}

// Clamp a placed object's top-left pos so its ENTIRE footprint stays inside the
// room walls (room-local inches), accounting for its rotation. The canvas rotates
// non-door objects about their center, so we clamp using the rotation-aware
// bounding box: a rotated unit can never stick out past any wall. Doors are
// wall-pinned by design and are NOT clamped here. Pure function — returns a new
// {x,y}; never mutates data.
export function clampObjectToRoom(obj, room) {
  const W = room?.widthIn || 0, L = room?.lengthIn || 0;
  const s = smartObjectSize(obj);
  // Rotation-aware bounding box (about the object's center).
  const rad = ((obj?.rotationDeg || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad)), si = Math.abs(Math.sin(rad));
  const bbW = s.w * c + s.h * si;
  const bbH = s.w * si + s.h * c;
  // Coerce a possibly non-finite (NaN/Infinity) coordinate to the room center, so a
  // degenerate raycast/upstream value can never defeat the clamp below.
  const safe = (v, dim) => (Number.isFinite(v) ? v : dim / 2);
  // Center must stay within [bb/2, dim - bb/2] so the box never crosses a wall.
  const cx0 = safe((obj?.pos?.x || 0) + s.w / 2, W);
  const cy0 = safe((obj?.pos?.y || 0) + s.h / 2, L);
  // Hard clamp: always returns a value inside [half, dim - half] (or the room
  // center when the footprint is larger than the room). Guaranteed finite + inside.
  const clamp = (v, half, dim) => {
    if (!Number.isFinite(v)) return dim / 2;
    if (half * 2 > dim) return dim / 2; // bigger than the room → center it
    return Math.min(Math.max(v, half), dim - half);
  };
  const cx = clamp(cx0, bbW / 2, W);
  const cy = clamp(cy0, bbH / 2, L);
  const pos = { x: cx - s.w / 2, y: cy - s.h / 2 };
  // Odd-shaped (merged / drawn) rooms: the bounding box isn't the room, so pull
  // the footprint out of any notch/cutout and fully inside the real outline.
  const poly = room?.polygon;
  if (Array.isArray(poly) && poly.length >= 3) {
    const fit = fitRectInPolygon({ x: cx - bbW / 2, y: cy - bbH / 2, w: bbW, h: bbH }, poly);
    return { x: fit.x + (bbW - s.w) / 2, y: fit.y + (bbH - s.h) / 2 };
  }
  return pos;
}

// Build a fresh placed object of the given type at a position (room-local inches).
export function makeSmartObject(type, pos) {
  const def = smartObjectByType(type);
  if (!def) return null;
  return {
    id: `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: def.type,
    pos: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
    rotationDeg: def.defaultRotationDeg ?? 0,
    mount: def.mount,
    // Deep-copy the default spec so each object owns its editable values.
    spec: { ...def.spec },
  };
}

// The wall line a door belongs to: { side, coord }. `side` is which way the room
// interior lies (top/bottom/left/right) and `coord` is that wall's constant
// room-local coordinate. Merged / drawn rooms use their real polygon edges, so a
// door lands on an actual wall instead of the bounding box.
export function doorWallLine(obj, room) {
  const W = room?.widthIn || 0, L = room?.lengthIn || 0;
  const s = smartObjectSize(obj);
  const dcx = (obj.pos?.x || 0) + s.w / 2;
  const dcy = (obj.pos?.y || 0) + s.h / 2;
  const poly = room?.polygon;
  if (Array.isArray(poly) && poly.length >= 3) {
    const near = nearestPolygonWall(poly, dcx, dcy);
    if (near) return { side: near.side, coord: near.coord };
  }
  const dists = { top: dcy, bottom: L - dcy, left: dcx, right: W - dcx };
  const side = Object.keys(dists).reduce((a, b) => (dists[a] <= dists[b] ? a : b));
  const coord = side === "top" ? 0 : side === "bottom" ? L : side === "left" ? 0 : W;
  return { side, coord };
}

// Which room wall a door is snapped to, by nearest edge to the door's center.
// Mirrors the renderer's wall pick so hit-area + drawing always agree.
export function doorNearestWall(obj, room) {
  return doorWallLine(obj, room).side;
}

// The door's RENDERED footprint box (room-local inches) — its sill pinned flush to
// the nearest wall, exactly where drawDoor draws it. Used so the selection/grab
// hit area follows the door onto the wall instead of staying at the spawn/center.
export function doorRenderedRect(obj, room) {
  const s = smartObjectSize(obj);
  const { side, coord } = doorWallLine(obj, room);
  // Center along the wall tracks the door; perpendicular center sits half a
  // box-depth inside the wall line (matching the renderer's wallPx pin).
  let cx = (obj.pos?.x || 0) + s.w / 2;
  let cy = (obj.pos?.y || 0) + s.h / 2;
  if (side === "top") cy = coord + s.h / 2;
  else if (side === "bottom") cy = coord - s.h / 2;
  else if (side === "left") cx = coord + s.w / 2;
  else if (side === "right") cx = coord - s.w / 2;
  return { x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h };
}

// The door's full VISUAL/tap bounds (room-local inches): the sill box PLUS the
// swing leaf + quarter-circle arc, which extend one door-width INTO the room off
// the wall. Selection hit-tests this so tapping the visible swing (not just the
// thin sill) reliably grabs the door. Mirrors drawDoor's geometry.
export function doorSwingRect(obj, room) {
  const base = doorRenderedRect(obj, room);
  const s = smartObjectSize(obj);
  const wall = doorNearestWall(obj, room);
  const swing = s.w; // leaf length + arc radius = door width, projected inward
  const swingOut = obj?.spec?.swing === "out";
  const sign = swingOut ? -1 : 1;
  if (wall === "top")    return { x: base.x, y: swingOut ? base.y - swing : base.y, w: base.w, h: base.h + swing };
  if (wall === "bottom") return { x: base.x, y: swingOut ? base.y : base.y - swing, w: base.w, h: base.h + swing };
  if (wall === "left")   return { x: swingOut ? base.x - swing : base.x, y: base.y, w: base.w + swing, h: base.h };
  /* right */            return { x: swingOut ? base.x : base.x - swing, y: base.y, w: base.w + swing, h: base.h };
}

// The on-canvas footprint (inches) for a placed object — falls back to the
// catalog default. Ducting honors its spec lengthIn so a run reads as a line.
export function smartObjectSize(obj) {
  const def = smartObjectByType(obj?.type);
  const base = def?.sizeIn || { w: 12, h: 12 };
  if (obj?.type === "ducting" && obj?.spec?.lengthIn) {
    return { w: obj.spec.lengthIn, h: obj.spec.diameterIn || base.h };
  }
  // Door scales to its actual opening width; depth tracks the swing so the symbol
  // (and its hit-area) read to scale with the door's dimensions.
  if (obj?.type === "door" && obj?.spec?.widthIn) {
    return { w: obj.spec.widthIn, h: obj.spec.widthIn };
  }
  return { ...base };
}