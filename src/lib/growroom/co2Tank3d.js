// Detailed CO₂ supply cylinder — Three.js primitives only (no GLB, no text/logos).
//
// Builds one compressed-gas cylinder from the existing `co2tank` object's spec:
// a brushed-aluminum bottle with domed ends + faint vertical seam strips, a
// shoulder collar, valve stem + hex cap, a spoked hand-wheel (the signature
// feature), a brass regulator with two angled pressure gauges, an inline
// solenoid valve with an animatable LED, output tubing dropping to a floor
// distribution manifold, an optional safety cap, and wall-mount bracket straps.
//
// The model is built upright/centered at the local origin (base at y=0) and is
// scaled proportionally by tank size (lb). The caller positions/rotates it via
// positionEquipmentGroup() exactly like every other equipment object, so the
// per-room placement + 2D↔3D sync is preserved. The solenoid LED subgroup is
// tagged userData.pulseLed so the scene render loop can pulse it when active.

import * as THREE from "three";

const M = 39.3701; // inches per meter (primitives are specced in meters → inches)

// Shared procedural materials. Tagged _procedural so the scene disposal pass
// leaves these module-level constants alive.
const mat = (color, opts = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...opts });
  m.userData._procedural = true;
  return m;
};
const CO2 = {
  body: mat(0xc0c4c8, { metalness: 0.85, roughness: 0.2 }),   // brushed aluminum bottle
  seam: mat(0xaaaaaa, { metalness: 0.7, roughness: 0.3 }),    // faint vertical seam strips
  collar: mat(0x999999, { metalness: 0.7, roughness: 0.3 }),  // shoulder collar ring
  valve: mat(0x444444, { metalness: 0.6, roughness: 0.4 }),   // valve stem
  hex: mat(0x333333, { metalness: 0.6, roughness: 0.4 }),     // hex cap
  wheel: mat(0x222222, { metalness: 0.4, roughness: 0.5 }),   // hand-wheel + spokes
  brass: mat(0xc8960a, { metalness: 0.6, roughness: 0.35 }),  // regulator body
  gaugeFace: mat(0xf0f0f0, { metalness: 0.1, roughness: 0.5 }),
  gaugeRim: mat(0x888888, { metalness: 0.6, roughness: 0.35 }),
  needle: mat(0xcc0000, { metalness: 0.2, roughness: 0.5 }),  // gauge needle
  solenoid: mat(0x1a1a1a, { metalness: 0.3, roughness: 0.6 }),// solenoid body
  coil: mat(0x333333, { metalness: 0.4, roughness: 0.5 }),    // solenoid coil
  tube: mat(0x1a1a1a, { metalness: 0.2, roughness: 0.7 }),    // output tubing
  manifold: mat(0x555555, { metalness: 0.6, roughness: 0.4 }),// distribution bar
  outlet: mat(0x444444, { metalness: 0.5, roughness: 0.45 }), // outlet stubs
  cap: mat(0x222222, { metalness: 0.2, roughness: 0.7 }),     // safety cap
  strap: mat(0x555555, { metalness: 0.5, roughness: 0.5 }),   // mount straps
  plate: mat(0x444444, { metalness: 0.5, roughness: 0.5 }),   // wall backing plate
};

// LED material — emissive red so it glows; emissiveIntensity is animated by the
// render loop when the solenoid is active. Per-instance (not shared) so each
// tank's LED pulses independently.
function makeLedMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: 0xff2200,
    emissive: 0xff2200,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    metalness: 0.1,
  });
  return m;
}

// Tank size → proportional scale of the reference 20 lb bottle. Larger tanks are
// taller and a touch fatter; smaller tanks shorter and slimmer.
const SIZE_SCALE = { 5: 0.62, 10: 0.8, 20: 1.0, 50: 1.35 };

// Build the full CO₂ tank group. Spec drives size + solenoid LED + safety cap +
// wall-mount bracket. Returns a THREE.Group centered at the local origin.
export function buildCO2TankMesh(spec = {}, mount = "floor") {
  const g = new THREE.Group();
  const sizeLb = Number(spec.tankSizeLb) || 20;
  const s = SIZE_SCALE[sizeLb] || 1.0;
  const solenoidActive = spec.solenoidActive !== false;
  const safetyCap = !!spec.safetyCap;

  // ── Main bottle ──────────────────────────────────────────────────────────
  const bodyR = 0.09 * M * s;      // 0.18m dia
  const bodyH = 0.75 * M * s;
  const bottle = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR, bodyH, 24), CO2.body);
  body.position.y = bodyH / 2;
  bottle.add(body);

  // Domed top + bottom (half spheres).
  const domeTop = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    CO2.body
  );
  domeTop.position.y = bodyH;
  bottle.add(domeTop);
  const domeBot = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    CO2.body
  );
  bottle.add(domeBot);

  // Faint vertical seam strips — thin tall boxes around the circumference.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, bodyH * 0.9, 0.18), CO2.seam);
    strip.position.set(Math.cos(a) * bodyR, bodyH / 2, Math.sin(a) * bodyR);
    strip.rotation.y = -a;
    bottle.add(strip);
  }

  // Shoulder collar — wider flat ring at the top of the bottle.
  const collarR = 0.11 * M * s;    // 0.22m dia
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(collarR, collarR, 0.04 * M * s, 24), CO2.collar);
  collar.position.y = bodyH + bodyR * 0.4;
  bottle.add(collar);

  g.add(bottle);

  // ── Valve assembly (sits on top of the collar) ───────────────────────────
  const valveBaseY = bodyH + bodyR * 0.4 + 0.04 * M * s;
  const valve = new THREE.Group();
  valve.position.y = valveBaseY;

  // Valve stem.
  const stemH = 0.06 * M * s;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * M * s, 0.02 * M * s, stemH, 16), CO2.valve);
  stem.position.y = stemH / 2;
  valve.add(stem);
  // Hex cap (6-segment cylinder).
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * M * s, 0.022 * M * s, 0.025 * M * s, 6), CO2.hex);
  hex.position.y = stemH + 0.012 * M * s;
  valve.add(hex);

  // Hand-wheel — torus + 5 thin box spokes (the signature feature). Lies flat
  // (in the X-Z plane) so it reads as a top wheel you'd turn.
  const wheelR = 0.07 * M * s;
  // Hold the wheel + spokes in a flat group, then tip the whole group so it lies
  // in the X-Z plane. Spokes are simple boxes crossing the torus inside that group.
  const wheelGroup = new THREE.Group();
  wheelGroup.position.y = stemH * 0.6;
  wheelGroup.rotation.x = Math.PI / 2;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.008 * M * s, 8, 24), CO2.wheel);
  wheelGroup.add(wheel);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 2, 0.006 * M * s, 0.01 * M * s), CO2.wheel);
    spoke.rotation.z = a;
    wheelGroup.add(spoke);
  }
  valve.add(wheelGroup);

  // ── Regulator + gauges (mounted on a short neck off the valve front, +Z) ──
  const reg = new THREE.Group();
  reg.position.set(0, stemH * 0.5, collarR * 0.6);
  // Short neck.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * M * s, 0.012 * M * s, 0.04 * M * s, 12), CO2.valve);
  neck.rotation.x = Math.PI / 2;
  reg.add(neck);
  // Brass regulator body.
  const regBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.08 * M * s, 0.1 * M * s, 0.06 * M * s),
    CO2.brass
  );
  regBody.position.z = 0.05 * M * s;
  reg.add(regBody);

  // Two pressure gauges — disc + rim + needle, angled off the regulator front.
  [-1, 1].forEach((side) => {
    const gauge = new THREE.Group();
    const gR = 0.0225 * M * s; // 0.045m dia
    const face = new THREE.Mesh(new THREE.CylinderGeometry(gR, gR, 0.006 * M * s, 20), CO2.gaugeFace);
    face.rotation.x = Math.PI / 2;
    gauge.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(gR, 0.004 * M * s, 8, 20), CO2.gaugeRim);
    gauge.add(rim);
    // Red needle pointing ~2 o'clock.
    const needle = new THREE.Mesh(new THREE.BoxGeometry(gR * 0.9, 0.004 * M * s, 0.006 * M * s), CO2.needle);
    needle.position.set(gR * 0.3, gR * 0.25, 0.004 * M * s);
    needle.rotation.z = -Math.PI / 4;
    gauge.add(needle);
    gauge.position.set(side * 0.026 * M * s, 0.03 * M * s, 0.082 * M * s);
    gauge.rotation.x = -0.35; // angle the face up toward the viewer
    reg.add(gauge);
  });
  valve.add(reg);

  // ── Solenoid valve + LED (inline below the regulator) ─────────────────────
  const sol = new THREE.Group();
  sol.position.set(0, -stemH * 0.2, collarR * 0.9);
  const solBox = new THREE.Mesh(new THREE.BoxGeometry(0.05 * M * s, 0.05 * M * s, 0.045 * M * s), CO2.solenoid);
  sol.add(solBox);
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * M * s, 0.018 * M * s, 0.05 * M * s, 16), CO2.coil);
  coil.position.y = 0.035 * M * s;
  sol.add(coil);
  // Emissive LED — its own subgroup tagged for the render-loop pulse.
  const ledMat = makeLedMaterial();
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006 * M * s, 12, 12), ledMat);
  led.position.set(0.022 * M * s, 0.01 * M * s, 0.024 * M * s);
  led.material.emissiveIntensity = solenoidActive ? 0.9 : 0.05;
  const ledGroup = new THREE.Group();
  ledGroup.add(led);
  ledGroup.userData.pulseLed = solenoidActive; // render loop pulses only when active
  sol.add(ledGroup);
  valve.add(sol);

  // Optional safety cap over the whole valve.
  if (safetyCap) {
    const capH = 0.16 * M * s;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(collarR * 0.95, collarR * 1.0, capH, 24, 1, true),
      CO2.cap
    );
    cap.position.y = capH / 2;
    valve.add(cap);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(collarR * 0.95, collarR * 0.95, 0.01 * M * s, 24), CO2.cap);
    capTop.position.y = capH;
    valve.add(capTop);
  }

  g.add(valve);

  // ── Output tubing → floor distribution manifold ───────────────────────────
  const tubeR = 0.004 * M * s; // 0.008m dia
  const manifoldY = 0.06 * M * s;
  const manifoldZ = bodyR + 0.18 * M;
  // CatmullRom curve from the solenoid down to the floor manifold.
  const start = new THREE.Vector3(0, valveBaseY - stemH * 0.2, collarR * 0.9 + 0.02 * M * s);
  const curve = new THREE.CatmullRomCurve3([
    start,
    new THREE.Vector3(0, valveBaseY * 0.6, manifoldZ * 0.5),
    new THREE.Vector3(0, manifoldY + 0.04 * M, manifoldZ),
    new THREE.Vector3(0, manifoldY, manifoldZ),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, tubeR, 8, false), CO2.tube);
  g.add(tube);

  // Distribution manifold — horizontal bar with 4 downward outlet stubs + T-split tubing.
  const manifold = new THREE.Group();
  manifold.position.set(0, manifoldY, manifoldZ);
  const barLen = 0.4 * M;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * M, 0.01 * M, barLen, 12), CO2.manifold);
  bar.rotation.z = Math.PI / 2; // axis → X
  manifold.add(bar);
  for (let i = 0; i < 4; i++) {
    const x = -barLen / 2 + (i + 0.5) * (barLen / 4);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * M, 0.006 * M, 0.05 * M, 10), CO2.outlet);
    stub.position.set(x, -0.03 * M, 0);
    manifold.add(stub);
    // Thin distribution tubing fanning out from the manifold center along the floor.
    const dist = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(x * 0.6, -0.02 * M, 0.1 * M),
      new THREE.Vector3(x, -0.04 * M, 0.25 * M),
    ]);
    const dtube = new THREE.Mesh(new THREE.TubeGeometry(dist, 16, tubeR, 6, false), CO2.tube);
    manifold.add(dtube);
  }
  g.add(manifold);

  // ── Wall-mount bracket (only in wall mode) ─────────────────────────────────
  if (mount === "wall") {
    // Backing plate behind the bottle + two straps wrapping it.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(collarR * 2.4, bodyH * 0.9, 0.6), CO2.plate);
    plate.position.set(0, bodyH / 2, -bodyR - 0.4);
    g.add(plate);
    [bodyH * 0.3, bodyH * 0.7].forEach((y) => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(bodyR * 2.3, 0.8, 0.5), CO2.strap);
      strap.position.set(0, y, -bodyR * 0.2);
      g.add(strap);
    });
  }

  return g;
}