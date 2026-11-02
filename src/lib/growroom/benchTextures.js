import * as THREE from "three";

// Procedural canvas textures for bench surfaces: self-contained (no hosting, no
// CORS), built lazily on first use (node tests import modules that import this
// file, and nothing may touch `document` at module load) and cached for reuse
// across every bench mesh. Albedos are sRGB; roughness maps are linear greyscale
// (three reads a roughnessMap's GREEN channel), so a material's `roughness` is
// multiplied by the map's value at each texel.
//
// Two finishes:
//  - brushed aluminium (trays / decks): fine horizontal streaks. The albedo stays
//    near-white so the material colour sets the tone; the ROUGHNESS map carries
//    the same streaks, which is what smears the highlight along the grain the
//    way a brushed panel does (no MeshPhysicalMaterial anisotropy needed).
//  - galvanized steel (frame / legs): the spangle of hot-dip zinc, soft
//    irregular patches a few percent lighter or darker than their neighbours,
//    in albedo and roughness alike so each crystal catches the light differently.
// One random layout is drawn once and shared by an albedo and its roughness map
// so the light catches exactly where the grain is painted.

const SIZE = 512;
const cache = {};

let _layout = null;
function layout() {
  if (_layout) return _layout;
  const streaks = [], bands = [], spangles = [];
  for (let i = 0; i < 2600; i++) {
    streaks.push({ x: Math.random() * SIZE, y: Math.random() * SIZE, len: 30 + Math.random() * 220, shade: Math.random() * 2 - 1, w: Math.random() < 0.5 ? 1 : 0.5 });
  }
  for (let i = 0; i < 14; i++) bands.push({ y: Math.random() * SIZE, h: 6 + Math.random() * 20, a: 0.04 + Math.random() * 0.05 });
  for (let i = 0; i < 420; i++) {
    spangles.push({ x: Math.random() * SIZE, y: Math.random() * SIZE, rx: 10 + Math.random() * 34, ry: 6 + Math.random() * 26, rot: Math.random() * Math.PI, shade: Math.random() * 2 - 1 });
  }
  _layout = { streaks, bands, spangles };
  return _layout;
}

// base: css colour; amp: strongest streak/spangle tint, 0..1 alpha of white or black.
function paintBrushed(ctx, base, amp) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const { streaks, bands } = layout();
  streaks.forEach((s) => {
    const a = Math.abs(s.shade) * amp;
    ctx.strokeStyle = s.shade >= 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.len, s.y);
    ctx.stroke();
  });
  // Broad soft bands for depth.
  bands.forEach((b) => {
    ctx.fillStyle = `rgba(0,0,0,${b.a})`;
    ctx.fillRect(0, b.y, SIZE, b.h);
  });
}

function paintGalvanized(ctx, base, amp) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  layout().spangles.forEach((s) => {
    const a = Math.abs(s.shade) * amp;
    ctx.fillStyle = s.shade >= 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.rx, s.ry, s.rot, 0, Math.PI * 2);
    ctx.fill();
  });
}

function make(key, paint, { srgb, repeat }) {
  if (cache[key]) return cache[key];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  paint(canvas.getContext("2d"));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  // Painted albedos are sRGB; left untagged, r171 samples them as linear and
  // the metal renders about a third lighter than drawn (sceneColor.test.js).
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  cache[key] = tex;
  return tex;
}

// Brushed aluminium albedo: near-white with the grain, the material colour sets the tone.
export function getBrushedMetalTexture() {
  return make("brushed", (ctx) => paintBrushed(ctx, "#e3e6e9", 0.14), { srgb: true, repeat: 3 });
}
// Its roughness: mid grey (0.55) with the same streaks, the brushed highlight.
export function getBrushedRoughnessTexture() {
  return make("brushedRough", (ctx) => paintBrushed(ctx, "#8c8c8c", 0.2), { srgb: false, repeat: 3 });
}
// Galvanized albedo: light zinc grey with the spangle.
export function getGalvanizedTexture() {
  return make("galvanized", (ctx) => paintGalvanized(ctx, "#cfd3d7", 0.09), { srgb: true, repeat: 2 });
}
// Its roughness: 0.55 plus or minus the spangle, so each crystal reflects a little differently.
export function getGalvanizedRoughnessTexture() {
  return make("galvanizedRough", (ctx) => paintGalvanized(ctx, "#8c8c8c", 0.16), { srgb: false, repeat: 2 });
}
