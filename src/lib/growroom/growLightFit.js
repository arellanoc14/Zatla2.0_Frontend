// Compute fit-to-bench grow-light fixture placements (display-only, derived from
// each bench's footprint + transform at render time — never persisted).
//
// Each fixture spans the FULL bench width and a 1/count slice of the bench length,
// so the fixtures together blanket the bench top with no gaps/overhang. Count = 1
// fixture per 4ft of bench length (4x8/5x8 → 2, 4x4/5x4 → 1). Fixtures tile along
// the bench's LONG axis (local Z) and follow the bench heading (rotY).
//
// benchRect gives r.w = bench WIDTH, r.h = bench LENGTH. cx2/cz2 = bench center in
// the room group's local frame. Returns { benchW, segLen, topY, placements }.
// Optional `y` overrides the fixture height (used to stack the SAME layout per
// tier on double/triple-tier benches — X/Z, count, spacing and scale unchanged).
// Optional `widthScale` (display-only) narrows/widens the fixture width so the
// light layout matches the visible rack frame width (tier racks render narrower
// than the true bench width). Never touches footprint data or placement.
// `r` is the bench's axis-aligned FOOTPRINT in room space (benchRect: x/y/w/h, with
// w/h already swapped for a 90°/270° bench), (cx2, cz2) its centre. The bench's
// LENGTH is the longer side of that footprint and runs along world Z when r.h is
// the longer side, along world X otherwise. Fixtures are spaced along THAT axis.
//
// (Bug fixed: the offsets used to be rotated by `rotY`, which the 3D view sets to
// the bench angle + 90° for the bench models. That pushed the fixtures of an
// un-rotated bench apart ACROSS its width — half a fixture sideways over the
// aisle — and used the width as the length on a 90° bench.)
//
// 4×8 → 2 fixtures, 4×4 → 1 (one per 4 ft of length), centred in equal slices.
// `rotY` is unused for position now; each fixture's rotation is set so the
// fitted model's length axis (local X, see fitModelToFootprint) runs along the bench.
export function growLightPlacements(r, cx2, cz2, rotY, y, widthScale = 1) {
  const alongZ = r.h >= r.w;                  // bench length runs along world Z?
  const benchLen = alongZ ? r.h : r.w;        // true bench length (inches)
  const benchWidth = alongZ ? r.w : r.h;      // true bench width (inches)
  const benchW = benchWidth * widthScale;     // fixture width (visually matched to rack frame)
  const count = Math.max(1, Math.round(benchLen / 48)); // 1 fixture per 4ft
  const segLen = benchLen / count;            // length each fixture covers
  const topY = typeof y === "number" ? y : 44 + 2; // just above the tier's canopy
  // The fitter normalizes every model so its LENGTH runs along local Z
  // (lengthAxis: "z"), so a bench whose length is along world Z needs no turn, and
  // one whose length is along world X needs a quarter turn.
  const fixtureRotY = alongZ ? 0 : Math.PI / 2;
  const placements = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * segLen; // centre of slice i along the length
    placements.push({
      x: alongZ ? cx2 : cx2 + offset,
      y: topY,
      z: alongZ ? cz2 + offset : cz2,
      rotationY: fixtureRotY,
    });
  }
  return { benchW, segLen, topY, placements };
}

// Bench types whose GLB already includes a baked-in grow light → skip separate
// Grow-Light fixtures (no double render). Single-tier benches have no built-in
// light, so all are false → all get grow lights.
export const BENCH_HAS_BUILTIN_LIGHT = { rolling: false, front: false };

// Tier rack GLBs (doubleTierUrl / tripleTierUrl) with baked-in lights → skip
// separate fixtures for that tier count (prevents double-rendering). TUNE if a
// tier model with built-in lights is uploaded.
export const TIER_GLB_HAS_BUILTIN_LIGHT = { 2: false, 3: false };

// ── Shared tier module system ───────────────────────────────────────────────
// A tiered rack is a stack of single-tier modules: the rack GLB target height
// AND the grow-light Y levels both derive from the SAME vertical pitch, so a
// light layer always sits cleanly inside its tier's frame. TUNE together.
export const SINGLE_TIER_RACK_HEIGHT_IN = 54; // one rack module's height
export const TIER_VERTICAL_PITCH_IN = 54;     // vertical step per stacked module
// Fixture bottoms, measured against the ZATLA bench models at their fitted
// heights (rolling 54in, DT 108in, TT 162in) so no fixture ever sits inside a
// rail or a deck frame:
//   rolling  top rail 52.7–54in        → fixture bottom 56 (frame ~3in above the rails)
//   DT       deck 2 frame 54–60, top rail 106–108
//                                      → tier 1: 52 (tops out at 58, under the
//                                        tray), tier 2: 109 (1in above the rail)
//   TT       deck 2 frame 58–62, deck 3 110–114, top rail 160–162
//                                      → 51 / 103 / 163
// The fixture height is 6in (roomLights targetH). TUNE against the harness if
// a bench model is re-exported.
// Single tier: 3in above the bench's top rails (52.7–54in), so nothing of the
// bench shows through the fixture. The light animation closes the distance to
// the tray instead (roomEmission reaches halfway down the gap).
// 56: the fixture's underside is 2in above the 54in rail top, which puts the
// visible frame rails (0.8in up inside the fixture) about 3in above the bench.
const SINGLE_TIER_LIGHT_Y = 56;
const RAIL_CLEAR_IN = 1; // the gap between a fixture and the rail / deck it sits by
const FIXTURE_H_IN = 6;
const DT_DECK2_BOTTOM = 54, DT_TOP_RAIL = 108;
const TT_DECK2_BOTTOM = 58, TT_DECK3_BOTTOM = 110, TT_TOP_RAIL = 162;

// Room ceiling by tier count: single tier keeps the room's own ceiling (12ft
// default), a double-tier room is 16ft, a triple-tier room 20ft. The studio
// writes this into room.ceilingIn when the tiers change, and the 3D scene
// also enforces it as a floor so older saved rooms draw tall enough.
export const TIER_CEILING_IN = { 1: 144, 2: 192, 3: 240 };
export function ceilingForTiers(tiers, currentIn = 144) {
  const t = Math.max(1, Math.min(3, Math.round(tiers || 1)));
  return t === 1 ? (currentIn || 144) : TIER_CEILING_IN[t];
}
export function minCeilingForTiers(tiers) {
  const t = Math.max(1, Math.min(3, Math.round(tiers || 1)));
  return t === 1 ? 0 : TIER_CEILING_IN[t];
}

// Total rack GLB target height for a given tier count (stacked modules).
export function getTierRackTargetH(tiers) {
  const t = Math.max(1, Math.min(3, Math.round(tiers || 1)));
  return SINGLE_TIER_RACK_HEIGHT_IN + (t - 1) * TIER_VERTICAL_PITCH_IN;
}

// Vertical Y (inches, fixture bottom) for each tier's light layer. The SAME
// single-tier layout renders once per level — only Y changes, stepping by the
// same TIER_VERTICAL_PITCH_IN the rack height uses.
export const TIER_LIGHT_Y_LEVELS = {
  1: [SINGLE_TIER_LIGHT_Y],
  // Double tier: the bottom light rides up into the deck-2 rail band (its top at
  // 58in, just under the 58–60in tray); the top light sits 1in above the top
  // rail — as low as it goes without the rail showing through it.
  2: [DT_DECK2_BOTTOM + 4 - FIXTURE_H_IN, DT_TOP_RAIL + 1],
  3: [TT_DECK2_BOTTOM - RAIL_CLEAR_IN - FIXTURE_H_IN, TT_DECK3_BOTTOM - RAIL_CLEAR_IN - FIXTURE_H_IN, TT_TOP_RAIL + RAIL_CLEAR_IN],
};

// Fixture width per light layer, as a fraction of the bench width. The top
// layer of every rack sits above the rails, so it spans the full bench width;
// the layers under a deck hang between the rack posts, so they come in a
// little to clear them. Display-only.
export const TIER_LIGHT_WIDTH_SCALES = {
  1: [1],
  2: [0.92, 1],
  3: [0.92, 0.92, 1],
};
export function getTierLightWidthScales(tiers) {
  return TIER_LIGHT_WIDTH_SCALES[Math.max(1, Math.min(3, Math.round(tiers || 1)))] || TIER_LIGHT_WIDTH_SCALES[1];
}

export function getTierLightYLevels(tiers) {
  return TIER_LIGHT_Y_LEVELS[Math.max(1, Math.min(3, Math.round(tiers || 1)))] || TIER_LIGHT_Y_LEVELS[1];
}