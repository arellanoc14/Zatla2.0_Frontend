// Detailed Quest-style dehumidifier built from Three.js primitives only (no GLB).
//
// A low, wide horizontal unit (~0.9m W × 0.6m D × 0.55m tall) with a sloped top,
// a quilted side filter panel, a recessed front control panel + blue LED strip,
// intake grille lines, a rear drain port, and two base feet. Pure geometry —
// branding/logos intentionally omitted. Returns an unpositioned THREE.Group
// centered on the footprint origin; the caller positions/rotates it like any
// other equipment mesh.

import * as THREE from "three";

// Inches per metre — model is spec'd in metres, room is in inches.
const M = 39.3701;

const mk = (color, opts = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25, ...opts });
  m.userData._procedural = true;
  return m;
};

// Shared materials (module-level so the scene's disposal pass leaves them alive).
const D_MAT = {
  body: mk(0xc8c8c8, { roughness: 0.55, metalness: 0.3 }),   // light gray shell
  filter: mk(0xf4f4f2, { roughness: 0.85, metalness: 0.05 }), // white quilted filter panel
  panel: mk(0x444444, { roughness: 0.5, metalness: 0.2 }),    // dark control panel
  led: mk(0x0088ff, { emissive: 0x0088ff, emissiveIntensity: 0.9, roughness: 0.3 }),
  grille: mk(0x3a3a3a, { roughness: 0.7, metalness: 0.2 }),   // intake grille lines
  foot: mk(0x6b7177, { roughness: 0.8, metalness: 0.1 }),     // neutral base skids
  port: mk(0x555555, { roughness: 0.6, metalness: 0.4 }),     // drain hose port
};

// Build the Quest-style dehumidifier group. Footprint (inches) sizes the body so
// it reads to scale in the room; height is fixed at ~0.55m.
export function buildDehumidifierMesh(footprintW, footprintD) {
  const g = new THREE.Group();

  const w = footprintW || 0.9 * M;
  const d = footprintD || 0.6 * M;
  const h = 0.55 * M;
  const footH = 0.05 * M; // base feet height

  const bodyH = h - footH;
  const bodyY = footH + bodyH / 2;

  // ── Main body ──
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH * 0.82, d), D_MAT.body);
  body.position.y = footH + (bodyH * 0.82) / 2;
  g.add(body);

  // ── Sloped top panel ── (a thin box tilted down toward the front)
  const topThick = bodyH * 0.18;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, topThick, d * 1.02), D_MAT.body);
  top.position.set(0, footH + bodyH * 0.82 + topThick / 2 - 0.4, 0);
  top.rotation.x = -0.13; // slope downward toward the front (+z)
  g.add(top);

  // ── Large side filter panel (quilted/white recessed rectangle) on +X side ──
  const filter = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, bodyH * 0.6, d * 0.7),
    D_MAT.filter
  );
  filter.position.set(w / 2 + 0.1, bodyY, 0);
  g.add(filter);
  // Quilted recess lines (thin grooves across the filter face).
  for (let i = -2; i <= 2; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, d * 0.66), D_MAT.grille);
    groove.position.set(w / 2 + 0.12, bodyY + i * (bodyH * 0.11), 0);
    g.add(groove);
  }

  // ── Front control panel (recessed dark rectangle) on +Z face ──
  const panelW = w * 0.32, panelH = bodyH * 0.26;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.5), D_MAT.panel);
  panel.position.set(-w * 0.18, bodyY + bodyH * 0.12, d / 2 + 0.1);
  g.add(panel);
  // Blue emissive LED strip across the control panel.
  const led = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.78, 0.5, 0.5), D_MAT.led);
  led.position.set(-w * 0.18, bodyY + bodyH * 0.04, d / 2 + 0.32);
  g.add(led);

  // ── Top/side intake grille lines (thin dark boxes on the front face) ──
  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.4, 0.3), D_MAT.grille);
    line.position.set(w * 0.22, bodyY + bodyH * 0.22 - i * 1.6, d / 2 + 0.05);
    g.add(line);
  }

  // ── Drain hose port (cylinder at the bottom-back) ──
  const port = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14), D_MAT.port);
  port.rotation.x = Math.PI / 2; // axis → Z (points out the back)
  port.position.set(w * 0.28, footH + 1.4, -d / 2 - 0.4);
  g.add(port);

  // ── 2 base feet / skids at the bottom front ──
  const footGeo = new THREE.BoxGeometry(w * 0.16, footH, d * 0.5);
  [-w * 0.34, w * 0.34].forEach((fx) => {
    const foot = new THREE.Mesh(footGeo, D_MAT.foot);
    foot.position.set(fx, footH / 2, d * 0.12);
    g.add(foot);
  });

  return g;
}