// Which .glb file the 3D scene uses for each model slot.
//
// Slot keys are camelCase (rollingBenchUrl, growLightUrl, ...). Every model the
// live site used ships with the app in public/3d, so nothing here depends on an
// outside server. 
export const DEFAULT_MODELS = {
  growLightUrl: "/3d/zatla-led7.glb",
  cannabisPlantUrl: "/3d/plant.glb",
  // Benches: single tier (rolling), double tier, triple tier. Only the studio
  // draws benches, so the light, Draco-packed room versions are the only copies.
  rollingBenchUrl: "/3d/zatla-rolling-room.glb",
  doubleTierUrl: "/3d/zatla-double-room.glb",
  tripleTierUrl: "/3d/zatla-triple-room.glb",
  // Under-canopy lights: the ZATLA UCL bar, and the same UCL on its stands.
  // Draco-packed with a 1024 texture; the geometry is kept full detail.
  uclUrl: "/3d/zatla-ucl-room.glb",
  uclStandUrl: "/3d/zatla-ucl-stands-room.glb",
  // The ZATLA wall fan: drawn automatically on every room's walls (see
  // Walkthrough3D wallFans) and used for any fan placed by hand.
  fanUrl: "/3d/zatla-fan-room.glb",
  dehumidifierUrl: "/3d/dehumidifier.glb",
  controllerUrl: "/3d/zatla-controller.glb",
};

// Levels of detail of the older built-in grow light, richest first (see lightLod.js).
// Only used when growLightUrl is the default AND lights may be simplified; lights
// are always drawn at full detail today (lightsFullDetail), so these never load.
export const GROWLIGHT_LODS = [
  { url: "/3d/zatla-growlight.glb", tris: 19998 },
  { url: "/3d/zatla-growlight-lite.glb", tris: 4864 },
  { url: "/3d/zatla-growlight-low.glb", tris: 1038 },
  { url: "/3d/zatla-growlight-min.glb", tris: 78 },
];

// Levels of detail of the older built-in plant, richest first. Only used when plants
// are drawn in 3D (RENDER_PLANTS_IN_3D, currently off) — see resolvePlantUrl.
export const PLANT_LODS = [
  { url: "/3d/zatla-plant-lite.glb", tris: 6550 },
  { url: "/3d/zatla-plant-mid.glb", tris: 2040 },
  { url: "/3d/zatla-plant-low.glb", tris: 804 },
  { url: "/3d/zatla-plant-min.glb", tris: 248 },
];

// The room scene (2D/3D studio) draws dozens of copies of each model, so it uses
// lighter versions: the same files decimated with meshoptimizer and Draco-packed.
// The light drops from 306k to 36k triangles (a 30-bench room: 18M → 2.2M for
// lights alone); the rolling bench is cut from 1M to ~120k triangles and
// downloads at 2.4 MB instead of 34.7 MB. The home page and the product page
// keep the full-detail light above.
export const STUDIO_MODELS = {
  ...DEFAULT_MODELS,
  growLightUrl: "/3d/zatla-led7-room.glb",
};

// Models imported on the Model Library page. There is no shared server any more,
// so for now there are none; browser-local imports are added with that page.
export async function listLibraryModels() {
  return [];
}

// slot -> url map for the 3D scene: the built-in models, with any imported model
// replacing the built-in one for its slot. Kept async so the studio loads it the
// same way it always has (through its ["globalModels"] query).
export async function getGlobalModels() {
  const library = await listLibraryModels();
  const merged = { ...DEFAULT_MODELS };
  for (const rec of library) {
    if (rec?.slot && rec?.url) merged[rec.slot] = rec.url;
  }
  return merged;
}

// slot -> url map for the studio's room scene: the lighter room models, with any
// imported model replacing the built-in one for its slot.
export async function getStudioModels() {
  const library = await listLibraryModels();
  const merged = { ...STUDIO_MODELS };
  for (const rec of library) {
    if (rec?.slot && rec?.url) merged[rec.slot] = rec.url;
  }
  return merged;
}

// What each slot falls back to when nothing is imported.
export const getServerGlobalModels = async () => ({ ...DEFAULT_MODELS });
