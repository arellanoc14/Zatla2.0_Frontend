// Detailed multi-component HVAC ducting run — Three.js primitives only (no GLB).
//
// Builds one inline extraction system along the ceiling from the existing
// `ducting` object's spec: a galvanized duct run, an inline fan unit, an optional
// carbon filter ahead of the fan, collar connector rings at the joints, a
// corrugated flex section feeding the fan, and an exhaust wall cap at the end.
//
// Layout is along local +X (the object's footprint length), centered on the
// footprint, so positionEquipmentGroup() places/rotates it exactly like the old
// single tube. The caller mounts it at ceiling height. The fan blade subgroup is
// tagged userData.spinFan so the scene's render loop can rotate it when active.

import * as THREE from "three";

const FT = 12; // inches per foot
const M = 39.3701; // inches per meter (primitives are specced in meters → inches)

// Shared procedural materials. Tagged _procedural so the scene disposal pass
// leaves these module-level constants alive.
const mat = (color, opts = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...opts });
  m.userData._procedural = true;
  return m;
};
const HVAC = {
  galv: mat(0xb0b8c1, { metalness: 0.6, roughness: 0.3 }), // galvanized silver duct
  flex: mat(0x9aa0a6, { metalness: 0.45, roughness: 0.45 }), // lighter flex duct body
  ridge: mat(0x888888, { metalness: 0.4, roughness: 0.5 }),  // flex corrugation ridges
  collar: mat(0x999999, { metalness: 0.7, roughness: 0.25 }),// collar connector rings
  fanBody: mat(0x2a2a2a, { metalness: 0.4, roughness: 0.5 }),// fan housing dark gray
  grille: mat(0x111111, { metalness: 0.3, roughness: 0.6 }), // fan front grille
  blade: mat(0x333333, { metalness: 0.5, roughness: 0.4 }),  // fan blades
  filterBody: mat(0x1a1a1a, { metalness: 0.2, roughness: 0.7 }), // carbon filter charcoal
  filterCap: mat(0xbfc4cc, { metalness: 0.7, roughness: 0.25 }), // filter silver end caps
  filterBand: mat(0xe8e8e8, { metalness: 0.1, roughness: 0.6 }),  // subtle white band
  cap: mat(0x555555, { metalness: 0.3, roughness: 0.6 }),    // exhaust wall cap plate
};

// A collar connector ring (small silver torus) lying in the Y-Z plane so it hugs
// a duct whose axis runs along X.
function collarRing(radiusIn, xPos) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radiusIn + 0.6, 0.7, 8, 20),
    HVAC.collar
  );
  ring.rotation.y = Math.PI / 2; // torus plane → Y-Z (faces along X)
  ring.position.x = xPos;
  return ring;
}

// A straight galvanized duct tube of given length, axis along X, centered at xPos.
function straightDuct(radiusIn, lengthIn, xPos) {
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusIn, radiusIn, lengthIn, 18),
    HVAC.galv
  );
  tube.rotation.z = Math.PI / 2; // axis → X
  tube.position.x = xPos;
  return tube;
}

// Corrugated flex-duct section: a lighter cylinder with stacked thin torus ridges
// ~0.04m apart. Axis along X, centered at xPos.
function flexSection(radiusIn, lengthIn, xPos) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusIn * 0.95, radiusIn * 0.95, lengthIn, 16),
    HVAC.flex
  );
  body.rotation.z = Math.PI / 2;
  grp.add(body);
  const ridgeGap = 0.04 * M; // ~1.6 in
  const count = Math.max(2, Math.floor(lengthIn / ridgeGap));
  for (let i = 0; i <= count; i++) {
    const x = -lengthIn / 2 + i * (lengthIn / count);
    const ridge = new THREE.Mesh(
      new THREE.TorusGeometry(radiusIn, 0.45, 6, 16),
      HVAC.ridge
    );
    ridge.rotation.y = Math.PI / 2;
    ridge.position.x = x;
    grp.add(ridge);
  }
  grp.position.x = xPos;
  return grp;
}

// Inline fan unit: short thick housing cylinder, dark grille face, and a spinnable
// 4-blade subgroup (tagged so the render loop can rotate it). Axis along X.
function fanUnit(xPos) {
  const grp = new THREE.Group();
  const housingR = 0.175 * M; // 0.35m dia
  const housingLen = 0.25 * M;
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(housingR, housingR, housingLen, 24),
    HVAC.fanBody
  );
  housing.rotation.z = Math.PI / 2;
  grp.add(housing);

  // Front grille — thin crossing box strips on the +X face.
  const grille = new THREE.Group();
  const faceX = housingLen / 2 + 0.3;
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, housingR * 2 * 0.92, 0.6),
      HVAC.grille
    );
    strip.position.set(faceX, 0, i * (housingR * 0.32));
    grille.add(strip);
    const strip2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, housingR * 2 * 0.92),
      HVAC.grille
    );
    strip2.position.set(faceX, i * (housingR * 0.32), 0);
    grille.add(strip2);
  }
  grp.add(grille);

  // Spinnable blades — 4 thin boxes around the axis, set back inside the housing.
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, housingR * 1.7, housingR * 0.42),
      HVAC.blade
    );
    blade.rotation.x = (i * Math.PI) / 2;
    blades.add(blade);
  }
  blades.rotation.z = Math.PI / 2; // blade plane perpendicular to X axis
  blades.userData.spinFan = true;
  grp.add(blades);

  grp.position.x = xPos;
  return grp;
}

// Carbon filter: charcoal cylinder with silver end caps and a subtle white band.
// Axis along X, centered at xPos.
function carbonFilter(xPos) {
  const grp = new THREE.Group();
  const r = 0.1 * M;       // 0.2m dia
  const len = 0.5 * M;     // 0.5m long
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), HVAC.filterBody);
  body.rotation.z = Math.PI / 2;
  grp.add(body);
  // Silver end caps
  [-1, 1].forEach((s) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, len * 0.08, 20), HVAC.filterCap);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s * (len / 2 - len * 0.04);
    grp.add(cap);
  });
  // Subtle white band near the intake end
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, len * 0.06, 20), HVAC.filterBand);
  band.rotation.z = Math.PI / 2;
  band.position.x = -len * 0.18;
  grp.add(band);
  grp.position.x = xPos;
  return grp;
}

// Exhaust wall cap: flat square plate with louvered horizontal strips, standing
// upright (faces along +X) at the far end of the run.
function exhaustCap(xPos) {
  const grp = new THREE.Group();
  const side = 0.28 * M;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, side, side), HVAC.cap);
  grp.add(plate);
  for (let i = -2; i <= 2; i++) {
    const louver = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, side * 0.12, side * 0.86),
      HVAC.grille
    );
    louver.position.set(0.5, i * (side * 0.18), 0);
    louver.rotation.z = -0.18; // angled louvers
    grp.add(louver);
  }
  grp.position.x = xPos;
  return grp;
}

// Build the full HVAC run group. lengthIn/diameterIn come from the object spec.
// Order along +X (airflow direction): exhaust cap ← duct ← fan ← flex ← [filter] ← duct intake.
export function buildDuctingHvacMesh(lengthIn = 96, diameterIn = 8, carbonFilterOn = true) {
  const g = new THREE.Group();
  const r = Math.max(2, diameterIn) / 2;
  const half = lengthIn / 2;

  // Component widths (inches)
  const fanLen = 0.25 * M;
  const flexLen = Math.min(0.35 * M, lengthIn * 0.18);
  const filterLen = carbonFilterOn ? 0.5 * M : 0;
  const capLen = 0.8;

  // Walk from the intake end (-half) outward to the exhaust end (+half).
  let x = -half;

  // Carbon filter sits at the intake, before the fan.
  if (carbonFilterOn) {
    g.add(carbonFilter(x + filterLen / 2));
    g.add(collarRing(r, x + filterLen));
    x += filterLen;
  }

  // Flex section connecting filter/intake → fan.
  g.add(flexSection(r, flexLen, x + flexLen / 2));
  x += flexLen;

  // Inline fan unit.
  g.add(collarRing(0.175 * M, x));
  g.add(fanUnit(x + fanLen / 2));
  x += fanLen;
  g.add(collarRing(r, x));

  // Main straight duct run to the exhaust cap (fills the remaining length).
  const runLen = Math.max(4, half - x - capLen);
  g.add(straightDuct(r, runLen, x + runLen / 2));
  x += runLen;

  // Collar + exhaust wall cap at the far end.
  g.add(collarRing(r, x));
  g.add(exhaustCap(half));

  return g;
}