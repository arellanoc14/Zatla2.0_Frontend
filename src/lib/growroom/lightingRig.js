import * as THREE from "three";

// Add the display-only lighting rig to the scene: soft sky/ground hemisphere base
// + a three-point directional setup (key, fill, warm rim) + overhead top-down fill,
// for gentle modelling on the benches and equipment without harsh shadows. Tuned
// against the scene's ACES tone mapping. Render-only; never touches data.
export function addLightingRig(scene, cx, cz, ceil, facSpan) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bcc4, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // Key light — main directional from front-left, slightly cool daylight.
  const keyLight = new THREE.DirectionalLight(0xfff6e8, 0.85);
  keyLight.position.set(cx - facSpan * 0.6, ceil * 2.2, cz - facSpan * 0.6);
  scene.add(keyLight);

  // Fill light — softer, from the opposite side to lift shadow areas.
  const fillLight = new THREE.DirectionalLight(0xeaf1ff, 0.35);
  fillLight.position.set(cx + facSpan * 0.7, ceil * 1.4, cz + facSpan * 0.5);
  scene.add(fillLight);

  // Warm rim/back light — grazes the tops of benches for a subtle highlight edge.
  const rimLight = new THREE.DirectionalLight(0xffe7c2, 0.3);
  rimLight.position.set(cx, ceil * 1.8, cz + facSpan * 0.9);
  scene.add(rimLight);

  // Overhead top-down fill — keeps the floor and aisle evenly lit.
  const overhead = new THREE.DirectionalLight(0xffffff, 0.35);
  overhead.position.set(cx, ceil * 2.5, cz);
  scene.add(overhead);
}
// ── The LIVE walkthrough's rig ──────────────────────────────────────────────
// addLightingRig above is kept exactly as it was for the email renderer, whose
// exposure and studio sun were tuned against those six lights. The walkthrough
// uses this one instead. What changed and why:
//  - hemisphere only, no ambient: the PMREM room environment is the indirect
//    light. Ambient + hemisphere at 0.95 was MORE than the 0.85 key, which is
//    what made every surface the same flat grey;
//  - ONE key with its .target set to the facility centre (the old rig never set
//    a target, so all four directionals aimed at world origin and an off-origin
//    facility was lit from the wrong side) plus one cool fill. No rim, no
//    overhead, nothing to cancel the key's shading;
//  - the key casts the scene's only shadow map, fitted to the facility's
//    bounding sphere so a far room never falls off its edge.
// bounds: { cx, cz, spanW, spanL, ceil } in inches (spans include the apron
// padding). opts.shadows / opts.mapSize come from the device class. Returns the
// lights so a caller can retune them. Numbers marked TUNE were set against the
// dev harness, not from memory.
const KEY_DIR = new THREE.Vector3(-0.33, 0.9, -0.3).normalize(); // ~64 deg up, front-left. TUNE
const FILL_DIR = new THREE.Vector3(0.5, 0.6, 0.4).normalize();   // opposite side, lower

export function addWalkthroughLightingRig(scene, { cx, cz, spanW, spanL, ceil }, { shadows = false, mapSize = 2048 } = {}) {
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x5a5248, 0.35); // cool sky, dark warm ground
  scene.add(hemi);

  const target = new THREE.Vector3(cx, ceil / 2, cz);
  // Bounding sphere of the facility box: sizes the light distance and the
  // shadow camera alike.
  const r = 0.5 * Math.hypot(spanW, ceil, spanL);

  const key = new THREE.DirectionalLight(0xfff1e0, 2.0);
  key.position.copy(target).addScaledVector(KEY_DIR, 2 * r);
  key.target.position.copy(target);
  scene.add(key, key.target);
  if (shadows) {
    key.castShadow = true;
    const c = key.shadow.camera;
    c.left = -r; c.right = r; c.bottom = -r; c.top = r;
    c.near = 0.9 * r; c.far = 3.2 * r;
    key.shadow.mapSize.set(mapSize, mapSize);
    const texel = (2 * r) / mapSize;
    key.shadow.bias = -0.0003;
    // World (inch) units. If decks striate, raise this to 2 texels before
    // touching bias.
    key.shadow.normalBias = 1.5 * texel;
    // three recomputes an ortho shadow camera's projection only when it first
    // creates the map; do it here so the fit holds whenever the bounds are set.
    c.updateProjectionMatrix();
  }

  const fill = new THREE.DirectionalLight(0xdbe6f5, 0.35);
  fill.position.copy(target).addScaledVector(FILL_DIR, 2 * r);
  fill.target.position.copy(target);
  scene.add(fill, fill.target);

  return { hemi, key, fill };
}
