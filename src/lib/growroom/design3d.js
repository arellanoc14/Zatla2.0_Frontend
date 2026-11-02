// Pure helpers behind the 3D view's Design / Results panels (View3DOverlay,
// Design3DPanel, Results3DPanel): which layout the screen gets, the numbers
// the Results panel shows, and the room a "size by benches" entry implies.
// DISPLAY ONLY except roomForBenches, whose rectangle the studio lays out
// through the same autoLayoutByRoom as every other room control. Inches in,
// like the rest of lib/growroom.
//
// Ported from the GrowStudios 3D panels and cut down to what ZATLA sells: the
// ZATLA Grow Light, the under-canopy light (UCL) and the controller. Bench
// types other than rolling, V-Track, mixed benches, side-to-side rows and the
// per-model light datasheets are not part of ZATLA, so they are not here.
import { computeStats } from "./autolayout";
import { computeClearances, benchRect } from "./clearances";
import { aisleOf, MIN_SLIDE_IN } from "./mobileAisle";
import { uclPlacements, isUclMode } from "./canopyLightFit";
import { PRODUCT } from "@/lib/product";

// Screen → layout. "desktop": docked Design panel left, Results right, 3D in
// between. "side": one tabbed panel docked left (phones held sideways, small
// windows). "sheet": the 3D on top with a tabbed bottom sheet (phones held
// upright). Decided from the window, not the user agent.
export const DESKTOP_MIN_W = 1024;
export const DESKTOP_MIN_H = 560;
export const SIDE_MIN_W = 560;
export function view3dLayout(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return "desktop";
  if (w >= DESKTOP_MIN_W && h >= DESKTOP_MIN_H) return "desktop";
  if (w > h && w >= SIDE_MIN_W) return "side";
  return "sheet";
}

const round1 = (v) => Math.round(v * 10) / 10;

// 40 → `40'`, 40.5 → `40.5'`.
export const fmtFeet = (ft) => `${round1(Number(ft) || 0)}'`;

// One stepper / slider step, clamped and kept free of float drift.
export function stepValue(value, delta, min = -Infinity, max = Infinity) {
  const v = Math.round(((Number(value) || 0) + delta) * 100) / 100;
  return Math.min(max, Math.max(min, v));
}

// ZATLA Grow Light figures, from the product sheet (lib/product.js) — the
// fixture's rated draw. BTU/hr = W × 3.412; one ton of cooling = 12,000 BTU/hr.
export const GROW_LIGHT_WATTS = 1000;
const BTU_PER_W = 3.412;
const BTU_PER_TON = 12000;

// Grow lights on one bench: one fixture per 4 ft of bench length (at least
// one), on every tier — the same rule the 3D places them by and the cart counts
// them by (lib/cart.js designLightCount).
export function growLightsOnBench(b) {
  if (!b || !b.pos) return 0;
  const r = benchRect(b);
  const len = Math.max(r.w, r.h);
  if (!(len > 0)) return 0;
  const tiers = Math.max(1, Math.min(3, Math.round(b.tiers || 1)));
  return Math.max(1, Math.round(len / 48)) * tiers;
}

// UCL units on one bench: the same placements the 3D draws (uclPlacements —
// two rows per deck, whole 4 ft units end to end), on every tier.
export function uclsOnBench(b) {
  if (!b || !b.pos) return 0;
  const r = benchRect(b);
  const tiers = Math.max(1, Math.min(3, Math.round(b.tiers || 1)));
  return uclPlacements(r, 0, 0, 0, 0).placements.length * tiers;
}

// The active room's stored per-room display settings (light model, UCL mode).
function activeRoomEntry(doc) {
  return (doc?.rooms || []).find((r) => r.id === doc?.activeRoomId) || null;
}
export const roomLightModel = (doc) => activeRoomEntry(doc)?.lightModel || doc?.lightModel || "phoenix";
export const roomCanopyMode = (doc) => activeRoomEntry(doc)?.canopyMode || doc?.canopyMode || "canopy";

// The room a "size by benches" entry implies: `qty` bench columns of
// `benchWidthFt`, `lengthFt` long, with the room's own clearances around them.
// It reserves EXACTLY what autoLayoutByRoom subtracts (both walls and the
// centre aisle across, front and back along), so feeding the result back into
// that engine lays out the same columns. Runs snap down to whole 2 ft
// sub-modules, the engine's packing step. ZATLA's engine always lays out two
// banks, so fewer than 2 columns has no room. → { widthIn, lengthIn } or null.
// The biggest a room can be made in the designer: length, width and ceiling
// height are each capped at this many feet.
export const MAX_ROOM_DIM_FT = 50;

export function roomForBenches({ qty, lengthFt } = {}, benchWidthFt, settings = {}) {
  const columns = Math.max(0, parseInt(qty, 10) || 0);
  const runIn = Math.floor(((parseFloat(lengthFt) || 0) * 12) / 24) * 24;
  if (columns < 2 || runIn < 48) return null;
  const n = (v) => Math.max(0, Number(v) || 0);
  return {
    widthIn: columns * benchWidthFt * 12 + 2 * n(settings.wallIn) + n(settings.centerIn),
    lengthIn: runIn + n(settings.frontIn) + n(settings.backIn),
  };
}

// The room's current bench setup in the same terms: column count and run.
export function benchColumnsOf(benches) {
  const list = (benches || []).filter((b) => b && b.pos && b.lengthIn > 0);
  if (!list.length) return { qty: 0, lengthFt: 0 };
  const runByX = new Map();
  list.forEach((b) => {
    const key = Math.round(b.pos.x);
    runByX.set(key, (runByX.get(key) || 0) + b.lengthIn);
  });
  const runIn = Math.max(...runByX.values());
  return { qty: runByX.size, lengthFt: Math.round((runIn / 12) * 100) / 100 };
}

// The numbers the Results panel shows for the ACTIVE room (the flat doc
// fields), or null when there is no room. Every figure comes from a function
// the rest of the app already uses — computeStats for areas, aisleOf for rows
// and the real aisle, computeClearances for what is actually left at the
// walls — so a value here always matches the scene.
export function roomResults(doc) {
  const room = doc?.room;
  if (!room) return null;
  const benches = doc.benches || [];
  const settings = doc.settings || {};
  const stats = computeStats(room, benches);
  const a = aisleOf(benches, room, settings);
  const columns = a ? a.columns : [];
  const byId = new Map(benches.map((b) => [b.id, b]));
  const rowLenIn = columns.reduce(
    (m, c) => Math.max(m, c.ids.reduce((s, id) => s + (Number(byId.get(id)?.lengthIn) || 0), 0)),
    0
  );
  const tiers = benches.reduce((m, b) => Math.max(m, Math.max(1, Math.round(b.tiers || 1))), 1);
  const clear = Object.fromEntries(computeClearances(room, benches, settings).map((c) => [c.label, c]));

  const growOn = roomLightModel(doc) !== "none";
  const growLights = growOn ? benches.reduce((n, b) => n + growLightsOnBench(b), 0) : 0;
  const watts = growLights * GROW_LIGHT_WATTS;
  const btu = watts * BTU_PER_W;
  const canopyMode = roomCanopyMode(doc);
  const uclOn = isUclMode(canopyMode);
  const ucls = uclOn ? benches.reduce((n, b) => n + uclsOnBench(b), 0) : 0;
  const controllers = (doc.objects || []).filter((o) => o?.type === "controller").length;

  return {
    widthFt: room.widthIn / 12,
    lengthFt: room.lengthIn / 12,
    ceilingFt: (room.ceilingIn || 144) / 12,
    floorSqft: stats.totalAreaSqft,
    canopySqft: stats.plantingAreaSqft,
    tiers,
    utilizationPct: stats.efficiency,
    rows: columns.length,
    rowLengthFt: round1(rowLenIn / 12),
    sections: benches.length,
    benchWidthFt: stats.benchWidthFt,
    aisle: a && a.excess >= MIN_SLIDE_IN ? { widthIn: a.hi - a.lo } : null,
    clearances: {
      center: clear["Center aisle"] || null,
      front: clear["Front aisle"] || null,
      back: clear["Back aisle"] || null,
      left: clear["Left wall"] || null,
      right: clear["Right wall"] || null,
    },
    growLight: {
      on: growOn,
      count: growLights,
      watts,
      btu,
      tons: btu / BTU_PER_TON,
      unitPrice: PRODUCT.price,
      total: growLights * PRODUCT.price,
    },
    ucl: { on: uclOn, mode: canopyMode, count: ucls },
    controllers,
  };
}
