import * as THREE from "three";
import {
  getBrushedMetalTexture, getBrushedRoughnessTexture,
  getGalvanizedTexture, getGalvanizedRoughnessTexture,
} from "./benchTextures.js";

// Detailed rolling-bench model (ported from the "Rolling Bench System v3" reference):
// brushed-metal slotted tray, claw-foot adjustable legs, an overhead scaffold frame
// with clamp connectors + diagonal bracing, and a hand-wheel rotary drive on one end.
//
// The reference model works in meters → 1 model unit = 1 meter ≈ 39.37 in, so the
// vertical proportions read like a real bench. The X/Z footprint is stretched to the
// requested footprint (footW × footL, in inches), centered at the origin.
//
// API is unchanged: buildScaffoldBench(footW, footL, tiers) → THREE.Group with
// userData.deckTopYs / deckTopY / tierHeight / baseY (consumed by plants, irrigation
// and canopy lights). Tray top is aligned to BASE_Y so pots sit on the deck correctly.

const IN_PER_M = 39.37;

// Shared PBR materials — brushed tray metal, polished pipe, cast hardware, drive alloy.
// Galvanized look, as in GrowStudios: brushed deck, galvanized frame, cast legs.
const TRAY = new THREE.MeshStandardMaterial({ color: 0xbfc4c9, metalness: 0.9, roughness: 0.8, envMapIntensity: 0.55 });
const PIPE = new THREE.MeshStandardMaterial({ color: 0xa9b0b6, metalness: 0.85, roughness: 0.9, envMapIntensity: 0.7 });
const CAST = new THREE.MeshStandardMaterial({ color: 0x8f969c, metalness: 0.6, roughness: 0.55 });
const DRIVE = new THREE.MeshStandardMaterial({ color: 0x8888a0, metalness: 0.7, roughness: 0.32 });
TRAY.userData.role = "deck";
PIPE.userData.role = "frame";
CAST.userData.role = "leg";
DRIVE.userData.role = "leg";
// Texture maps are made lazily (they need a document), once, on the first build.
function ensureMaps() {
  if (TRAY.map) return;
  TRAY.map = getBrushedMetalTexture();
  TRAY.roughnessMap = getBrushedRoughnessTexture();
  PIPE.map = getGalvanizedTexture();
  PIPE.roughnessMap = getGalvanizedRoughnessTexture();
  [TRAY, PIPE].forEach((m) => { m.needsUpdate = true; });
}
// Bright green modular mounting brackets/clamps (matches the reference renders).
const GREEN = new THREE.MeshStandardMaterial({ color: 0x3fae39, metalness: 0.25, roughness: 0.48 });

// ── Primitive helpers (geometry in meters, positions in meters) ─────────────
// Level of detail for big layouts: scales the radial/segment counts of every round
// part (1 = full). Set only for the duration of one buildScaffoldBench call.
let SEG = 1;
function CYL(rt, rb, h, s = 14) { return new THREE.CylinderGeometry(rt, rb, h, Math.max(5, Math.round(s * SEG))); }
function BOX(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function SPH(r, w = 12, h = 9) { return new THREE.SphereGeometry(r, Math.max(5, Math.round(w * SEG)), Math.max(4, Math.round(h * SEG))); }
function TOR(R, t, rs = 8, ts = 28) { return new THREE.TorusGeometry(R, t, Math.max(4, Math.round(rs * SEG)), Math.max(8, Math.round(ts * SEG))); }

function add(g, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x ?? 0, y ?? 0, z ?? 0);
  if (rx != null) m.rotation.x = rx;
  if (ry != null) m.rotation.y = ry;
  if (rz != null) m.rotation.z = rz;
  g.add(m);
  return m;
}

// Green modular clamp connector (central body + saddle arms + bolt + seam ring).
function clampConnector(g, x, y, z, type = "inline") {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(SPH(0.048, 12, 9), GREEN);
  body.scale.set(1, 0.82, 1);
  grp.add(body);
  const armGeo = CYL(0.034, 0.026, 0.08, 10);
  if (type === "inline" || type === "T" || type === "cross") {
    const aL = new THREE.Mesh(armGeo, GREEN); aL.rotation.z = Math.PI / 2; aL.position.x = -0.05; grp.add(aL);
    const aR = new THREE.Mesh(armGeo, GREEN); aR.rotation.z = Math.PI / 2; aR.position.x = 0.05; grp.add(aR);
  }
  if (type === "T" || type === "cross") {
    const aU = new THREE.Mesh(armGeo, GREEN); aU.position.y = 0.05; grp.add(aU);
  }
  if (type === "cross") {
    const aD = new THREE.Mesh(armGeo, GREEN); aD.position.y = -0.05; grp.add(aD);
  }
  const bolt = new THREE.Mesh(CYL(0.013, 0.013, 0.02, 6), CAST);
  bolt.position.y = 0.055; grp.add(bolt);
  const seam = new THREE.Mesh(TOR(0.046, 0.005, 6, 18), GREEN);
  seam.rotation.x = Math.PI / 2; grp.add(seam);
  grp.position.set(x, y, z);
  g.add(grp);
  return grp;
}

// footW = width across (X), footL = length along (Z), both in inches.
// tiers kept in the signature for API compatibility (this single-deck bench ignores it).
// detail: 1 = full; ~0.5 for 60+ benches, ~0.35 for 150+ (see Walkthrough3D).
export function buildScaffoldBench(footW, footL, tiers = 1, { detail = 1 } = {}) {
  const prev = SEG;
  SEG = detail;
  try {
    return buildScaffoldBenchImpl(footW, footL, tiers);
  } finally {
    SEG = prev;
  }
}

function buildScaffoldBenchImpl(footW, footL, tiers = 1) {
  ensureMaps();
  // Inner group built in METERS, mapped to the bench's local axes:
  //   model X (length, BL) → world Z (footL),  model Z (width, BW) → world X (footW).
  const inner = new THREE.Group();

  // Reference proportions: tray sits 0.8m off the floor, 1.15m wide.
  const BL = 5.0;            // model length (mapped to world Z / footL)
  const BW = 1.15;           // model width  (mapped to world X / footW)
  const TY = 0.80;           // tray-top height (m)
  const HL = BL / 2, HW = BW / 2;

  // ── ① TRAY SURFACE ─────────────────────────────────────────────────────────
  const LIP = 0.052;
  add(inner, BOX(BL, LIP, 0.028), TRAY, 0, TY + LIP / 2, HW - 0.014);
  add(inner, BOX(BL, LIP, 0.028), TRAY, 0, TY + LIP / 2, -HW + 0.014);
  add(inner, BOX(0.028, LIP, BW), TRAY, HL - 0.014, TY + LIP / 2, 0);
  add(inner, BOX(0.028, LIP, BW), TRAY, -HL + 0.014, TY + LIP / 2, 0);
  add(inner, BOX(BL - 0.04, 0.013, BW - 0.04), TRAY, 0, TY + 0.006, 0);

  const RIBS = 20;
  for (let i = 0; i < RIBS; i++) {
    const z = -HW + 0.06 + (i / (RIBS - 1)) * (BW - 0.12);
    add(inner, BOX(BL - 0.06, 0.02, 0.014), TRAY, 0, TY + 0.02, z);
    if (i < RIBS - 1) {
      const zg = z + ((BW - 0.12) / (RIBS - 1)) / 2;
      add(inner, BOX(BL - 0.06, 0.004, 0.007), TRAY, 0, TY + 0.016, zg);
    }
  }
  [-HW + 0.014, HW - 0.014].forEach((ez) => add(inner, BOX(BL, 0.04, 0.015), TRAY, 0, TY - 0.02, ez));

  // ── ② LEG ASSEMBLY ───────────────────────────────────────────────────────────
  const LEG_XS = [-HL + 0.25, -HL * 0.52, 0, HL * 0.52, HL - 0.25];
  LEG_XS.forEach((lx) => {
    [-HW + 0.065, HW - 0.065].forEach((lz) => {
      add(inner, CYL(0.022, 0.022, TY - 0.06, 12), PIPE, lx, TY / 2 - 0.03, lz);

      const topNode = new THREE.Group();
      const body = new THREE.Mesh(SPH(0.042, 10, 8), GREEN);
      body.scale.set(1.1, 0.7, 1.1); topNode.add(body);
      const stem = new THREE.Mesh(CYL(0.026, 0.026, 0.055, 10), GREEN);
      stem.position.y = -0.03; topNode.add(stem);
      topNode.position.set(lx, TY - 0.025, lz); inner.add(topNode);

      add(inner, CYL(0.03, 0.03, 0.022, 6), CAST, lx, 0.065, lz);
      add(inner, CYL(0.018, 0.018, 0.055, 8), CAST, lx, 0.03, lz);

      const footG = new THREE.Group();
      const cap = new THREE.Mesh(SPH(0.052, 12, 8), CAST);
      cap.scale.set(1, 0.52, 1); footG.add(cap);
      for (let t = 0; t < 3; t++) {
        const a = (t / 3) * Math.PI * 2;
        const toe = new THREE.Mesh(SPH(0.021, 8, 6), CAST);
        toe.position.set(Math.cos(a) * 0.05, -0.016, Math.sin(a) * 0.05);
        toe.scale.set(1, 0.45, 1.25); footG.add(toe);
      }
      footG.position.set(lx, 0, lz); inner.add(footG);
    });
  });

  LEG_XS.forEach((lx) => {
    add(inner, CYL(0.016, 0.016, BW - 0.13, 10), PIPE, lx, TY * 0.4, 0, null, null, Math.PI / 2);
    add(inner, CYL(0.016, 0.016, BW - 0.13, 10), PIPE, lx, TY * 0.72, 0, null, null, Math.PI / 2);
  });
  [-HW + 0.065, HW - 0.065].forEach((lz) => {
    add(inner, CYL(0.015, 0.015, BL - 0.1, 10), PIPE, 0, TY * 0.38, lz, null, null, Math.PI / 2);
    add(inner, CYL(0.015, 0.015, BL - 0.1, 10), PIPE, 0, TY * 0.68, lz, null, null, Math.PI / 2);
  });

  // ── MAP MODEL → BENCH FOOTPRINT ──────────────────────────────────────────────
  // Convert meters → inches and stretch the model's BL/BW onto the requested
  // footprint. Model length (X, along BL) maps to world Z (footL); model width
  // (Z, along BW) maps to world X (footW). Rotating the inner group 90° about Y
  // makes model-X point along world-Z.
  const g = new THREE.Group();
  inner.rotation.y = Math.PI / 2;            // model X → world Z, model Z → world -X
  const sx = footW / (BW * IN_PER_M);        // squeeze model width onto footW
  const sz = footL / (BL * IN_PER_M);        // stretch model length onto footL
  inner.scale.set(IN_PER_M * sz, IN_PER_M, IN_PER_M * sx);

  // Align the tray top to BASE_Y so plants/irrigation sit on the deck as before.
  const BASE_Y = 0.22 * IN_PER_M;
  const trayTopModelIn = (TY + LIP) * IN_PER_M;
  inner.position.y = BASE_Y - trayTopModelIn;
  g.add(inner);

  // Single usable deck → keep the userData contract the rest of the scene relies on.
  const deckTopYs = [BASE_Y + 0.01 * IN_PER_M];
  g.userData.deckTopYs = deckTopYs;
  g.userData.deckTopY = deckTopYs[deckTopYs.length - 1];
  g.userData.tierHeight = 0.72 * IN_PER_M;
  g.userData.baseY = BASE_Y + 0.01 * IN_PER_M;
  return g;
}