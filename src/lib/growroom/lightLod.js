import { DEFAULT_MODELS, GROWLIGHT_LODS } from "./globalModels";
import { pickPlantLod } from "./plantLayout";

// The built-in ZATLA grow light is ~43k triangles. The 3D scene draws one per 4 ft
// of bench, so a big layout would push millions of triangles for fixtures alone.
// Same idea as the plants: pick the richest level of detail whose total fits a
// budget (a handful of fixtures keep the full model). A light uploaded on the Model
// Library page is used as-is.
// Lowered from 600k/250k → 200k/80k after measuring (scripts/perf), then to 80k/30k:
// lights are repeated once per 4 ft of bench, so they must stay a small slice of the
// scene. The same budgets cap an UPLOADED light too (see capModelTriangles).
export const LIGHT_TRI_BUDGET = 80_000;
export const LIGHT_TRI_BUDGET_MOBILE = 30_000;

// Canopy (under-canopy) fixtures: two per bench per tier, so they get their own budget.
export const CANOPY_TRI_BUDGET = 60_000;
export const CANOPY_TRI_BUDGET_MOBILE = 25_000;

// FULL DETAIL for normal layouts. The simplified lights smear the logo on the fixture
// (and use smaller textures), so up to this many fixtures in the scene the grow lights
// keep the original full mesh and textures, untouched. Beyond it the budgets above
// apply so a very large layout does not drag. Phones always use the budgets.
// (A 4 ft bench has 2 fixtures per tier: 60 fixtures ≈ a 30-bench single-tier layout,
// about 2.6M triangles of lights.) Set to 0 to always use the budgets.
export const LIGHT_FULL_DETAIL_MAX_FIXTURES = 60;
// Always true: the grow light is drawn exactly as the .glb, never simplified
// (simplifying broke the mesh). Instancing keeps it to a few draw calls.
export const lightsFullDetail = () => true;

// Triangles ONE copy of a model may have so `count` copies fit the budget
// (Infinity = leave the model exactly as authored).
export const lightTrisPerFixture = (count, mobile = false) =>
  lightsFullDetail(count, mobile)
    ? Infinity
    : Math.floor((mobile ? LIGHT_TRI_BUDGET_MOBILE : LIGHT_TRI_BUDGET) / Math.max(1, count));
export const canopyTrisPerFixture = (count, mobile = false) =>
  Math.floor((mobile ? CANOPY_TRI_BUDGET_MOBILE : CANOPY_TRI_BUDGET) / Math.max(1, count));

export function sceneLightUrl(url, fixtureCount, { mobile = false } = {}) {
  if (!url || url !== DEFAULT_MODELS.growLightUrl) return url;
  if (lightsFullDetail(fixtureCount, mobile)) return url; // original full mesh + 2K textures
  const budget = mobile ? LIGHT_TRI_BUDGET_MOBILE : LIGHT_TRI_BUDGET;
  return GROWLIGHT_LODS[pickPlantLod(fixtureCount, GROWLIGHT_LODS.map((l) => l.tris), budget)].url;
}
