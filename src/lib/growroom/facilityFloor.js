import * as THREE from "three";
import { markOverlay } from "./overlayLayer.js";

// Render-only polished-concrete facility floor + ground details for the 3D view.
// Builds: a matte slab apron (so the floor doesn't bleed to infinity), the
// polished concrete slab with a procedural troweled-concrete albedo, and faint
// 10ft control-joint grid lines. Everything here is display-only — no geometry
// of rooms/benches/walls is touched. All materials/textures are marked
// _procedural so the scene's disposal pass skips them; the textures are cached
// at module scope and shared across rebuilds. No per-material envMaps:
// scene.environment lights every PBR material here.
//
// Also home to the shared bench contact-shadow material. (The old facility-wide
// shadow pool sat UNDER the opaque slab and was never visible; Walkthrough3D
// now lays one decal under every bench footprint instead.)

const albedos = new Map();
// Troweled-concrete albedo on any base tone (a css colour, sRGB), cached per
// base: the room floors and the facility slab share the generator at different
// values. null in node (no document) — a material with map: null is still fine.
export function getFloorAlbedo(base = "#2a2c2f") {
  if (albedos.has(base)) return albedos.get(base);
  if (typeof document === "undefined") return null;
  const S = 512;
  const can = document.createElement("canvas");
  can.width = can.height = S;
  const c = can.getContext("2d");
  c.fillStyle = base;
  c.fillRect(0, 0, S, S);
  // Thousands of faint mottled specks (lighter + darker) for a troweled feel.
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    c.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
    c.fillRect(x, y, 1, 1);
  }
  // A few very faint long control-joint lines (one vertical, one horizontal).
  c.strokeStyle = "rgba(0,0,0,0.22)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(S * 0.5, 0); c.lineTo(S * 0.5, S);
  c.moveTo(0, S * 0.5); c.lineTo(S, S * 0.5);
  c.stroke();
  const tex = new THREE.CanvasTexture(can);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  albedos.set(base, tex);
  return tex;
}

let _contactShadowTex = null;
// Radial alpha pool, darkest at the centre and fading to nothing: the bench
// contact shadow — the cheap half of "ambient occlusion" that grounds each bench.
export function getContactShadowTexture() {
  if (_contactShadowTex) return _contactShadowTex;
  if (typeof document === "undefined") return null;
  const S = 256;
  const can = document.createElement("canvas");
  can.width = can.height = S;
  const c = can.getContext("2d");
  const g = c.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, "rgba(16,18,22,0.45)");
  g.addColorStop(0.55, "rgba(16,18,22,0.18)");
  g.addColorStop(1, "rgba(16,18,22,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace;
  _contactShadowTex = tex;
  return tex;
}

let _benchContactMat = null;
// One shared material for every bench decal: transparent, no depth write, and
// pulled toward the camera so it never z-fights the room floor it lies on.
export function getBenchContactMaterial() {
  if (_benchContactMat) return _benchContactMat;
  const mat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  mat.userData._procedural = true;
  _benchContactMat = mat;
  return mat;
}

// Add the full polished-concrete floor + ground details to the scene, centered at
// (cx, cz) and sized to the facility footprint (roomW × roomL). Returns nothing —
// every mesh is added directly to the scene.
export function buildFacilityFloor(scene, { roomW, roomL, cx, cz }) {
  // Slab apron — larger, distinctly darker matte ground well BELOW the polished
  // slab so it never z-fights the floor. polygonOffset pushes it back in depth too.
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x9a9fa3, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.25,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  apronMat.userData._procedural = true;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(roomW * 2.4, roomL * 2.4), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.userData.shadowMode = "receive";
  apron.position.set(cx, -2, cz);
  scene.add(apron);

  // Polished concrete slab — procedural troweled albedo tiled ~120in per tile, a
  // step darker than the room floors (roomFloor.js) so each room reads as its own
  // lit slab; soft polished sheen via the env map (not a mirror).
  const floorAlbedo = getFloorAlbedo("#7a8084");
  if (floorAlbedo) {
    floorAlbedo.repeat.set(Math.max(1, roomW / 120), Math.max(1, roomL / 120));
  }
  const roomFloorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorAlbedo,
    roughness: 0.35,
    metalness: 0.1,
    envMapIntensity: 0.5,
  });
  roomFloorMat.userData._procedural = true;
  const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(roomW * 2.2, roomL * 2.2), roomFloorMat);
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.userData.shadowMode = "receive";
  roomFloor.position.set(cx, 0, cz);
  scene.add(roomFloor);

  // Faint expansion-joint grid — thin dark control-joint lines at 10ft (120in)
  // spacing across the facility; a quiet scale cue, just above the floor.
  const span = Math.max(roomW, roomL) * 1.6;
  const divisions = Math.max(2, Math.round(span / 120));
  const jointGrid = new THREE.GridHelper(span, divisions, 0x55585c, 0x55585c);
  jointGrid.material.transparent = true;
  jointGrid.material.opacity = 0.12;
  jointGrid.material.depthWrite = false;
  jointGrid.material.userData._procedural = true;
  jointGrid.position.set(cx, 0.2, cz);
  markOverlay(jointGrid); // a scale cue for editing: hidden by presentation mode
  scene.add(jointGrid);
}
