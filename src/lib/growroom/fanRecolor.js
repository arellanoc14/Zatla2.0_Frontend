// Brand recolor for the oscillating-fan GLB (display-only, per-instance).
// Matches the GrowPros floor fan: matte-black housing/cage/stand with
// lime-green blades. Materials are CLONED before recoloring so the shared
// GLB cache is never mutated (other models keep their original colors).
import * as THREE from "three";

const BLADE_GREEN = new THREE.Color("#b7d433");
const HOUSING_BLACK = new THREE.Color("#17181a");
const BLADE_RE = /blade|prop|wing|rotor|impell/i;

export function recolorFanModel(root, trackMat) {
  // Pass 1: find blade meshes by name (mesh or material name).
  const bladeMats = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (BLADE_RE.test(o.name || "") || mats.some((m) => BLADE_RE.test(m?.name || ""))) {
      mats.forEach((m) => m && bladeMats.add(m));
    }
  });
  // Count distinct materials. With a SINGLE merged material (blades + housing
  // share one), blades can't be tinted separately — paint the whole fan the
  // black housing color instead of turning the entire unit green.
  const allMats = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && allMats.add(m));
  });
  if (bladeMats.size === 0 && allMats.size > 1) {
    // Fallback: treat the LIGHTEST material as the blades (usually the
    // brightest part of a dark fan model).
    let best = null, bestLum = -1;
    allMats.forEach((m) => {
      if (!m.color) return;
      const lum = m.color.r * 0.3 + m.color.g * 0.6 + m.color.b * 0.1;
      if (lum > bestLum) { bestLum = lum; best = m; }
    });
    if (best) bladeMats.add(best);
  }
  // Pass 2: clone every material, tint blades lime and the rest matte black.
  const cloneCache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      if (!m) return m;
      if (!cloneCache.has(m)) {
        const c = m.clone();
        if (c.color) c.color.copy(bladeMats.has(m) ? BLADE_GREEN : HOUSING_BLACK);
        if ("metalness" in c) c.metalness = 0.2;
        if ("roughness" in c) c.roughness = bladeMats.has(m) ? 0.45 : 0.6;
        c.map = null; // solid brand color — drop any baked texture tint
        cloneCache.set(m, c);
      }
      return cloneCache.get(m);
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  if (trackMat) cloneCache.forEach((c) => trackMat(c));
}