// Plant layout rule — the single source of truth for how many plants sit on a
// bench and where. Pure, no three.js. All inches.
//
// 6 plants per bench deck, in an evenly spaced 2 × 3 grid: 2 across the width,
// 3 along the length, each plant at the CENTRE of an equal cell. That gives the
// same gap between neighbouring plants as from a plant to the bench edge, and
// the grid is symmetric about the bench centre on both axes.
//
//  - A bench longer than 8 ft repeats the 2 × 3 block once per 8 ft, so the
//    spacing stays even (a 16 ft run = 12 plants).
//  - Tiered racks get one block per tier, on that tier's deck.

// Master switch for DRAWING plants in the 3D view. Off while we rule plants out as a
// cause of lag. The layout, the plant counts and the stats still work with it off;
// set to true to bring the plants back (nothing else needs to change).
export const RENDER_PLANTS_IN_3D = false;

export const PLANTS_PER_BENCH = 6;
export const PLANT_COLS = 2; // across the bench width
export const PLANT_ROWS = 3; // along the bench length
export const BLOCK_LENGTH_IN = 96; // one 2 × 3 block per 8 ft of bench

// Rendered plant size: target height, and the share of the smaller grid cell the
// plant's width may fill (the rest is the gap between neighbours).
export const PLANT_HEIGHT_IN = 28;
export const PLANT_FILL = 0.75;

// Triangle budget for ALL plants in the scene. Plants are the one thing in the 3D
// view whose cost scales with the layout (6 per bench deck), so the detail level is
// chosen from the plant count: the richest model that still fits the budget.
// Measured (scripts/perf): at 800k, plants were 69% of a small layout's triangles and
// 50% of its frame time. 300k keeps them near a fifth of the 1.5M scene goal.
export const PLANT_TRI_BUDGET = 300_000;
export const PLANT_TRI_BUDGET_MOBILE = 100_000;

// Index of the richest level of detail whose total triangles (tris × count) fit the
// budget; the lightest level when none does. `trisList` is ordered richest → lightest.
export function pickPlantLod(count, trisList, budget = PLANT_TRI_BUDGET) {
  for (let i = 0; i < trisList.length; i += 1) {
    if (trisList[i] * count <= budget) return i;
  }
  return trisList.length - 1;
}

// Tier racks render narrower than the true bench footprint (the rack frame is
// ~72% of it — same factor the grow-light fixtures use), so plants and the
// under-canopy bars are laid out across that visible deck width.
export const DECK_WIDTH_SCALE_BY_TIER = { 1: 1, 2: 0.72, 3: 0.72 };

const clampTiers = (tiers) => Math.max(1, Math.min(3, Math.round(tiers || 1)));

export function deckWidthScale(tiers) {
  return DECK_WIDTH_SCALE_BY_TIER[clampTiers(tiers)] || 1;
}

export function blocksFor(benchLengthIn) {
  return Math.max(1, Math.round((benchLengthIn || 0) / BLOCK_LENGTH_IN));
}

// Plants on ONE deck level of a bench of the given length.
export function plantsPerDeck(benchLengthIn) {
  return PLANTS_PER_BENCH * blocksFor(benchLengthIn);
}

// Plants on a whole bench (one block per tier).
export function plantsForBench(benchLengthIn, tiers) {
  return plantsPerDeck(benchLengthIn) * clampTiers(tiers);
}

// Local grid for one deck: x across the width, z along the length, both relative
// to the bench centre and BEFORE bench rotation.
export function plantGrid(benchW, benchL) {
  const blocks = blocksFor(benchL);
  const blockL = benchL / blocks;
  const cellW = benchW / PLANT_COLS;
  const cellL = blockL / PLANT_ROWS;
  const points = [];
  for (let b = 0; b < blocks; b += 1) {
    const zc = (b - (blocks - 1) / 2) * blockL;
    for (let i = 0; i < PLANT_COLS; i += 1) {
      for (let j = 0; j < PLANT_ROWS; j += 1) {
        points.push({
          x: (i + 0.5) * cellW - benchW / 2,
          z: zc + (j + 0.5) * cellL - blockL / 2,
        });
      }
    }
  }
  return { points, cellW, cellL };
}

// Small deterministic yaw (±maxDeg) from the plant's position, so plants don't
// look cloned but a rebuild always produces the same scene.
export function plantYawJitter(x, z, maxDeg = 15) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  const f = s - Math.floor(s);
  return ((f - 0.5) * 2 * maxDeg * Math.PI) / 180;
}
