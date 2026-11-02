import { deckWidthScale, RENDER_PLANTS_IN_3D } from "./plantLayout";

// Under-canopy fixture placements — derived from each bench's footprint + transform
// at render time (display-only, never persisted). UNLIKE grow lights, these sit LOW
// on the bench DECK between the plant rows. EXACTLY 2 fixtures per bench, each running
// the bench LENGTH (8ft bench → ~8ft fixtures, 4ft bench → ~4ft fixtures), spaced one
// on each side of the centerline, inset from the side edges.
// benchRect: r.w = bench WIDTH, r.h = bench LENGTH. cx2/cz2 = bench center (local
// frame). deckY = bench surface height. Returns { fixtureW, fixtureLen, deckY, placements }.
//
// Plants stand in two columns at ±1/4 of the deck width (see plantLayout.js), so the
// two bars run along the CENTRELINE, between those columns: close to centre, and
// narrow enough to clear the pots. `widthScale` is the visible deck width on tier
// racks (deckWidthScale); `airW` is the legacy wider footprint the Air Circulation
// unit is sized from, kept so that mode looks exactly as before.
//
// With plants NOT drawn (RENDER_PLANTS_IN_3D = false) there is nothing to clear, so the
// bars go back to their ORIGINAL wide spacing: ±26% of the bench width apart, 10 in
// wide, on the full bench width. Tune CANOPY_SIDE_FRACTION to spread them further.
export const CANOPY_SIDE_FRACTION = 0.26;
// Bar cross-section is PINNED (see CANOPY_BAR_THICK_IN + fixtureW): a 4ft and an
// 8ft fixture are the same bar, different length — exactly like the real GPS UCL
// line. Only `fixtureLen` changes with the bench.
//
// Axis handling mirrors growLightPlacements: the bench LENGTH is the LONGER side of
// the footprint rect, never `r.h` (benchRect swaps w/h on a 90°/270° bench), and the
// two bars are offset ACROSS the width in WORLD axes rather than rotated by `rotY`.
export function canopyLightPlacements(r, cx2, cz2, rotY, deckY, widthScale = 1) {
  const plantsShown = RENDER_PLANTS_IN_3D;
  const alongZ = r.h >= r.w;                   // bench length runs along world Z?
  const benchLen = alongZ ? r.h : r.w;         // true bench length (inches) → fixture length
  const benchWidth = alongZ ? r.w : r.h;       // true bench width (inches)
  const benchW = benchWidth * (plantsShown ? widthScale : 1); // visible deck width
  const fixtureLen = benchLen * 0.94;          // ~full length, tiny inset off the ends
  const fixtureW = plantsShown ? Math.min(6, benchW * 0.12) : Math.min(10, benchW * 0.22); // LED-bar strip
  const airW = Math.min(10, benchWidth * 0.22); // legacy width, Air Circulation only
  const sideOffset = benchW * (plantsShown ? 0.075 : CANOPY_SIDE_FRACTION); // from the centreline, each side
  // The fitter normalizes every model so its LENGTH runs along local Z
  // (lengthAxis: "z"), so a bench whose length is along world Z needs no turn.
  const fixtureRotY = alongZ ? 0 : Math.PI / 2;
  const placements = [-1, 1].map((side) => ({
    x: alongZ ? cx2 + side * sideOffset : cx2,
    y: deckY,
    z: alongZ ? cz2 : cz2 + side * sideOffset,
    rotationY: fixtureRotY,
  }));
  return { fixtureW, airW, fixtureLen, benchLen, benchWidth, deckY, placements }; // placements.length === 2 always
}

// Rendered bar thickness (inches). Pinned so every fixture has the same
// cross-section and only its LENGTH tracks the bench (4ft vs 8ft).
export const CANOPY_BAR_THICK_IN = 3;

// Deck surface height (inches) for tier `t` (0-based) of a `tiers`-high rack. Shared
// by the canopy bars and the plants so both sit on the same deck.
const SINGLE_TIER_DECK_Y = 14;  // single-tier only — sits on the bench tray
const CANOPY_DECK_Y = 6;       // multi-tier (DT/TT) tier-1 deck — DO NOT CHANGE
const TT_BOTTOM_CANOPY_LIFT = 8; // TT-only: lift bottom layer clear of the bench
export function deckYForTier(tiers, t, tierVerticalPitchIn) {
  let deckY = tiers === 1 ? SINGLE_TIER_DECK_Y : CANOPY_DECK_Y + t * tierVerticalPitchIn;
  if (tiers === 3 && t === 0) deckY += TT_BOTTOM_CANOPY_LIFT;
  return deckY;
}

// ── ZATLA under-canopy light (UCL) ─────────────────────────────────────────
// Per-room canopy modes (room.canopyMode), 3D display only:
//   "canopy"      ZATLA UCL bars on the bench deck (the default — the same key
//                 older rooms already saved, so they keep rendering)
//   "canopyStand" the same UCL on its A-frame stands (model slot uclStandUrl —
//                 that .glb carries the bar AND its two stands)
//   "none"        no under-canopy lights
//   "air"         the Air Circulation .glb, when one is in the library
// Both UCL modes are the same fixture, so power and counts treat them alike.
export const UCL_MODES = ["canopy", "canopyStand"];
export const CANOPY_MODE_KEYS = ["canopy", "canopyStand", "none", "air"];
export const isUclMode = (mode) => UCL_MODES.includes(mode || "canopy");

// One UCL unit, in inches. ASSUMPTION: the ZATLA UCL is a 4ft fixture — the
// model's own proportions at 48in give the cross-sections below (bar 0.293 x
// 0.246 x 2.684 model units; stand version 0.621 x 0.752 x 2.684). If the real
// product is another length, change UCL_UNIT_LEN_IN: the counts per bench
// follow it and the cross-section keeps the model's proportions.
export const UCL_UNIT_LEN_IN = 48;
const UCL_MODEL_LEN = 2.684;
const UCL_INCH = UCL_UNIT_LEN_IN / UCL_MODEL_LEN;
export const UCL_BAR = { w: 0.293 * UCL_INCH, h: 0.246 * UCL_INCH };      // ~5.2 x 4.4in
export const UCL_STAND = { w: 0.621 * UCL_INCH, h: 0.752 * UCL_INCH };    // ~11.1 x 13.4in

// UCL placements for one bench deck: the SAME two rows canopyLightPlacements
// gives (one each side of the centreline, along the bench length), each row
// built from whole units laid end to end instead of one bar stretched down the
// bench — so the end caps (and the stands' legs) stay real. Units per row is the
// nearest whole number of 4ft units that fits the usable 94% span (a 4ft bench
// gets 1, an 8ft bench 2); each unit is sized to its share of that span, so a row
// always runs the bench end to end.
export function uclPlacements(r, cx2, cz2, rotY, deckY, widthScale = 1) {
  const base = canopyLightPlacements(r, cx2, cz2, rotY, deckY, widthScale);
  const span = base.fixtureLen;
  const perRow = Math.max(1, Math.round(span / UCL_UNIT_LEN_IN));
  const unitLen = span / perRow;
  const alongZ = r.h >= r.w;
  const placements = [];
  base.placements.forEach((row) => {
    for (let i = 0; i < perRow; i++) {
      const off = (i + 0.5) * unitLen - span / 2;
      placements.push({ ...row, x: alongZ ? row.x : row.x + off, z: alongZ ? row.z + off : row.z });
    }
  });
  return { unitLen, perRow, placements };
}

// Single-tier benches have no built-in under-canopy LED → all get fixtures.
export const BENCH_HAS_BUILTIN_CANOPY = { rolling: false, front: false };

// Render the per-bench canopy layer for a room, honoring the room's canopyMode:
//   "canopy" (default) → place the canopy light .glb (one layer per tier)
//   "none"             → nothing
//   "air"              → place the Air Circulation .glb instead of the lights
// One placement pass shared by both models (same deck heights per tier), so the
// air-circulation units land exactly where the canopy lights would. Display-only;
// never persisted/selectable. Caller supplies the bench geometry + placeModel.
export function renderCanopyLayer({
  canopyMode, canopyLightUrl, airCirculationUrl, uclStandUrl = null, tierVerticalPitchIn,
  r, cx2, cz2, rotY, tiers, targetGroup, placeModel,
}) {
  if (canopyMode === "none") return;
  const isAir = canopyMode === "air";
  const isStand = canopyMode === "canopyStand";
  const url = isAir ? airCirculationUrl : isStand ? uclStandUrl : canopyLightUrl;
  if (typeof url !== "string" || url.trim() === "") return;
  // Air Circulation model reads much smaller than the canopy light fixtures, so
  // scale its rendered size 5× (display-only; placements/deck heights unchanged).
  const AIR_SCALE = 5;
  for (let t = 0; t < tiers; t++) {
    const deckY = deckYForTier(tiers, t, tierVerticalPitchIn);
    const { airW, fixtureLen } = canopyLightPlacements(r, cx2, cz2, rotY, deckY, deckWidthScale(tiers));
    if (isAir) {
      // Air Circulation: ONE unit per bench. Width/height scale up 5×; length runs
      // 40% PAST the bench length, but the EXTRA length is pushed out ONE end only
      // (toward the back/wall side) so the near/aisle end stays flush with the bench
      // instead of poking out both sides. Shift the unit along its length axis by
      // half the added length, rotated by the bench heading.
      const AIR_LENGTH_SCALE = 1.18;
      const airLen = fixtureLen * AIR_LENGTH_SCALE;
      const lengthShift = -(airLen - fixtureLen) / 2; // push extra length toward the other end
      const sx = -Math.sin(rotY) * lengthShift;
      const sz = Math.cos(rotY) * lengthShift;
      const center = [{ x: cx2 + sx, y: deckY, z: cz2 + sz, rotationY: rotY + Math.PI }];
      placeModel(url, airW * AIR_SCALE, airLen, center, deckY, targetGroup, { uniform: false, targetH: 3 * AIR_SCALE });
    } else if (isStand) {
      // UCL on stands: the same rows and units as the bar, a taller, wider model.
      // sitOnBench drops each unit's feet onto the real tray.
      const { unitLen, placements: units } = uclPlacements(r, cx2, cz2, rotY, deckY, deckWidthScale(tiers));
      placeModel(url, UCL_STAND.w, unitLen, units, deckY, targetGroup, { uniform: false, targetH: UCL_STAND.h, lengthAxis: "z", sitOnBench: true });
    } else {
      // ZATLA UCL bars: 2 rows per bench per tier, whole units end to end, at the
      // model's own cross-section. sitOnBench lays each bar on the real tray.
      const { unitLen, placements: units } = uclPlacements(r, cx2, cz2, rotY, deckY, deckWidthScale(tiers));
      placeModel(url, UCL_BAR.w, unitLen, units, deckY, targetGroup, { uniform: false, targetH: UCL_BAR.h, lengthAxis: "z", sitOnBench: true });
    }
  }
}

// Table surface ≈ this fraction up the bench's total fitted height — tune to the
// exact tray height of your bench GLB.
export const BENCH_DECK_FRACTION = 0.62;

// Render EXACTLY 2 canopy-light fixtures on the bench DECK, deriving the deck/table
// height from the ACTUAL fitted bench GLB height (so tall rolling benches get their
// lights on the real table surface, not floating at grow-light height). Display-only;
// never persisted, never selectable. The caller passes the bench geometry + the scene
// helpers (loadGLB, fitModelToFootprint, placeModel) so this stays render-tier-agnostic.
export function renderCanopyLights({
  url, benchUrl, r, cx2, cz2, rotY, fitW, fitL, fitOpts, targetGroup,
  loadGLB, fitModelToFootprint, placeModel, isDisposed,
}) {
  const fixtureThick = 3;
  // Fallback table height derived so the fraction ≈ 31.5" when no bench GLB loads.
  const fallbackH = (0.80 * 39.37) / BENCH_DECK_FRACTION;
  const placeAt = (deckY) => {
    const { fixtureW, fixtureLen, placements } = canopyLightPlacements(r, cx2, cz2, rotY, deckY);
    // Footprint per fixture: narrow strip (fixtureW) × bench length (fixtureLen); thin in Y.
    placeModel(url, fixtureW, fixtureLen, placements, deckY, targetGroup, { uniform: false, targetH: fixtureThick });
  };
  const deckFromHeight = (h) => h * BENCH_DECK_FRACTION + fixtureThick / 2;
  // No bench GLB (scaffold bench) → use the derived fallback table height.
  if (typeof benchUrl !== "string" || benchUrl.trim() === "") {
    placeAt(deckFromHeight(fallbackH));
    return;
  }
  // Measure the fitted bench GLB (already cached from the bench render) so the table
  // height tracks the real model + scale, then place the fixtures on it.
  loadGLB(benchUrl).then((cachedScene) => {
    if (isDisposed?.()) return;
    const tmp = fitModelToFootprint(cachedScene, fitW, fitL, fitOpts);
    const h = tmp.userData?.fittedHeight || fallbackH;
    placeAt(deckFromHeight(h));
  }).catch(() => placeAt(deckFromHeight(fallbackH)));
}