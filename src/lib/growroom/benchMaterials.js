import * as THREE from "three";
import {
  getBrushedMetalTexture, getBrushedRoughnessTexture,
  getGalvanizedTexture, getGalvanizedRoughnessTexture,
} from "./benchTextures.js";
import { setShadowFlags } from "./shadowFlags.js";

// Name-based PBR material assignment for the (untextured) bench GLB meshes.
// The bench GLB ships with materials stripped to reduce file size, so every mesh
// renders plain white. This module inspects each mesh's name (case-insensitive
// "contains" match) and assigns a realistic grow-room PBR material: brushed
// aluminium decks, galvanized steel frame and legs, powder-coated track.
//
// Scope: 3D view ONLY. This never touches geometry, transforms, scale, or layout —
// it only swaps `mesh.material`, so positions/dimensions/2D↔3D sync stay intact.
//
// Every repainted mesh is tagged userData.matRole with its category. The emailed
// sheet's repaint (thumbnailStudio.js) reads that tag; it used to match these
// materials' exact hex colours, so recolouring here silently broke the email.
// Metal tones: a metal's `color` is its specular reflectance and the albedo map
// multiplies into it, so the maps stay near-white and the colours below carry
// the tone. TUNE against the harness, not from memory.

// Slight per-instance plant color variation between #2E7D32 and #4CAF50.
const PLANT_GREENS = [0x2e7d32, 0x388e3c, 0x3a8c3a, 0x43a047, 0x4caf50];

function makePotMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 });
}

// Brushed-aluminium deck / tray surface — the large flat top of the bench. The
// streaked roughness map (× 0.75 ≈ 0.41 along the grain) is the brushed look.
function makeDeckMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xbfc4c9,
    map: getBrushedMetalTexture(),
    roughnessMap: getBrushedRoughnessTexture(),
    roughness: 0.8,
    metalness: 0.9,
    envMapIntensity: 0.55,
  });
}

// Galvanized structural frame (rails / cross-members): zinc grey with spangle.
function makeFrameMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xa9b0b6,
    map: getGalvanizedTexture(),
    roughnessMap: getGalvanizedRoughnessTexture(),
    roughness: 0.9,
    metalness: 0.85,
    envMapIntensity: 0.7,
  });
}

// Galvanized support legs — a step darker than the frame so they read as a
// separate member in the shadow under the deck.
function makeLegMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x8f969c,
    map: getGalvanizedTexture(),
    roughnessMap: getGalvanizedRoughnessTexture(),
    roughness: 0.9,
    metalness: 0.8,
    envMapIntensity: 0.7,
  });
}

// Powder-coated charcoal rollers / rolling tracks.
function makeTrackMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x2f3338,
    roughness: 0.5,
    metalness: 0.6,
  });
}

function makeLightMaterial() {
  // Dark housing with a bright full-spectrum white emissive LED glow on the bars.
  return new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.4,
    metalness: 0.3,
    emissive: 0xfff6e8,
    emissiveIntensity: 1.6,
  });
}

function makePlantMaterial() {
  const color = PLANT_GREENS[Math.floor(Math.random() * PLANT_GREENS.length)];
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 });
}

const has = (name, words) => words.some((w) => name.includes(w));

// True when the GLB author already baked a real material onto this mesh — it has
// a texture map, a non-white base color, or an emissive glow. Such meshes are left
// exactly as uploaded; only plain/default (untextured white) meshes get our
// procedural grow-room materials.
function isAuthored(mat) {
  const mats = Array.isArray(mat) ? mat : [mat];
  return mats.some(
    (m) =>
      m &&
      (m.map ||
        (m.color && m.color.getHex() !== 0xffffff) ||
        (m.emissive && m.emissive.getHex() !== 0x000000))
  );
}

// The ZATLA bench models ship with a baked chrome texture (roughness 0.2),
// which reads as polished mirror steel next to the GrowStudios benches. This
// tones the authored material to the same galvanized finish the procedural
// frame uses — the texture stays, so the black corner connectors stay black
// and the tray keeps its crinkle; only the tone, sheen and reflectivity
// change. Idempotent: the material is shared by every clone of the model.
export function applyZatlaBenchFinish(holder) {
  holder.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (!m || !m.map || m.userData.zatlaFinish) return;
      m.userData.zatlaFinish = true;
      m.color.setHex(0xa9b0b6);
      m.roughness = 0.62;
      m.metalness = 0.8;
      m.envMapIntensity = 0.7;
      m.needsUpdate = true;
    });
  });
}

// Walk an already-fitted GLB holder and assign a material to every mesh by name.
// Logs each mesh name + the material category it received so unmatched meshes
// (which fall back to the bench metal material) are visible in the console.
export function applyBenchMaterials(holder) {
  holder.traverse((o) => {
    if (!o.isMesh) return;
    // Preserve materials the model was uploaded with — render it exactly as authored.
    if (isAuthored(o.material)) {
      console.log(`[GLB material] mesh "${o.name || "(unnamed)"}" → kept authored material`);
      return;
    }
    const name = (o.name || "").toLowerCase();
    let category;
    if (has(name, ["plant", "canopy", "leaf", "bud"])) {
      o.material = makePlantMaterial();
      category = "plant";
    } else if (has(name, ["pot", "container", "fabric", "bucket"])) {
      o.material = makePotMaterial();
      category = "pot";
    } else if (has(name, ["light", "led", "bar", "fixture", "lamp"])) {
      o.material = makeLightMaterial();
      category = "light";
    } else if (has(name, ["roller", "wheel", "track", "rail", "rolling"])) {
      o.material = makeTrackMaterial();
      category = "track";
    } else if (has(name, ["leg", "post", "stand", "support", "foot"])) {
      o.material = makeLegMaterial();
      category = "leg";
    } else if (has(name, ["deck", "tray", "top", "surface", "table"])) {
      o.material = makeDeckMaterial();
      category = "deck";
    } else if (has(name, ["frame", "bench", "rail", "beam", "cross"])) {
      o.material = makeFrameMaterial();
      category = "frame";
    } else {
      o.material = makeFrameMaterial();
      category = "frame (fallback — unmatched name)";
    }
    // The role word alone ("frame" for the fallback too) — what the email repaint keys on.
    o.userData.matRole = category.split(" ")[0];
    console.log(`[GLB material] mesh "${o.name || "(unnamed)"}" → ${category}`);
  });
  // Shadow-pass flags for the whole holder: this is the one post-pass every
  // GLB holder in the scene goes through (benches, racks, fixtures, canopy),
  // so it is where their cast/receive flags are set. Inert in the email
  // render, whose shadow map is off.
  setShadowFlags(holder);
}
