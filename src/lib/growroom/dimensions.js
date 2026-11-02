import * as THREE from "three";

// Builds 3D dimension annotations for the room: a measurement tick-line with a
// floating text label, drawn for width, length, and ceiling height. Pure helper —
// returns a THREE.Group ready to add to the scene. Inches in, scene units in inches.

// Render text to a canvas → sprite so labels always face the camera and stay crisp.
function makeLabel(text, { scale = 24, bg = "rgba(17,24,33,0.96)", fg = "#f8fafc" } = {}) {
  const pad = 18;
  const fontPx = 64;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  canvas.width = Math.ceil(tw + pad * 2);
  canvas.height = fontPx + pad * 2;

  // rounded pill background
  const r = 14;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
  ctx.arcTo(0, canvas.height, 0, 0, r);
  ctx.arcTo(0, 0, canvas.width, 0, r);
  ctx.closePath();
  ctx.fill();

  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, canvas.height / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // The label sprite is only a few dozen pixels tall on a phone, so the texture is
  // heavily MINIFIED. Without mipmaps that undersampling scrambles the glyphs into
  // the unreadable smear seen on mobile — mipmapping + anisotropy fixes it.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect, scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

// A flat dimension line on the floor (or wall) between p0 and p1 with end ticks.
function dimLine(p0, p1, color = 0x64748b) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
  const main = new THREE.BufferGeometry().setFromPoints([p0, p1]);
  g.add(new THREE.Line(main, mat));
  // end ticks (small perpendicular marks)
  const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(4);
  [p0, p1].forEach((p) => {
    const t = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().addVectors(p, perp),
      new THREE.Vector3().subVectors(p, perp),
    ]);
    g.add(new THREE.Line(t, mat));
  });
  return g;
}

// fmt: a function (inches) -> display string (so we respect the project's units).
export function buildDimensions(roomW, roomL, ceil, fmt, { labelScale = 24 } = {}) {
  const group = new THREE.Group();
  const off = 14; // how far outside the footprint the dim lines sit

  // Width (along X) — drawn in front of the room (z = -off)
  const wY = 0.5;
  group.add(dimLine(new THREE.Vector3(0, wY, -off), new THREE.Vector3(roomW, wY, -off)));
  const wLabel = makeLabel(fmt(roomW), { scale: labelScale });
  wLabel.position.set(roomW / 2, 14, -off);
  group.add(wLabel);

  // Length (along Z) — drawn to the left of the room (x = -off)
  group.add(dimLine(new THREE.Vector3(-off, wY, 0), new THREE.Vector3(-off, wY, roomL)));
  const lLabel = makeLabel(fmt(roomL), { scale: labelScale });
  lLabel.position.set(-off - 28, 14, roomL / 2);
  group.add(lLabel);

  // Ceiling height — vertical line at the front-left corner
  group.add(dimLine(new THREE.Vector3(-off, 0, -off), new THREE.Vector3(-off, ceil, -off)));
  const hLabel = makeLabel(fmt(ceil), { scale: labelScale });
  hLabel.position.set(-off, ceil / 2, -off);
  group.add(hLabel);

  return group;
}

// Merged / odd-shaped room: a dimension line + length label alongside EVERY outside
// wall of the polygon (room-local inches, x = width axis, y = length axis → 3D z),
// offset outward. Matches the 2D plan's per-wall dimensions. Ceiling height is
// drawn at the first corner.
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function buildPolygonDimensions(poly, ceil, fmt, { labelScale = 24 } = {}) {
  const group = new THREE.Group();
  const off = 14;
  const y = 0.5;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 12) continue;
    const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
    let nx = dy, ny = -dx;
    if (pointInPoly((a.x + b.x) / 2 + nx * 2, (a.y + b.y) / 2 + ny * 2, poly)) { nx = -nx; ny = -ny; }
    group.add(dimLine(
      new THREE.Vector3(a.x + nx * off, y, a.y + ny * off),
      new THREE.Vector3(b.x + nx * off, y, b.y + ny * off),
    ));
    const label = makeLabel(fmt(len), { scale: labelScale });
    label.position.set((a.x + b.x) / 2 + nx * (off + 22), 14, (a.y + b.y) / 2 + ny * (off + 22));
    group.add(label);
  }
  const c = poly[0];
  group.add(dimLine(new THREE.Vector3(c.x - off, 0, c.y - off), new THREE.Vector3(c.x - off, ceil, c.y - off)));
  const hLabel = makeLabel(fmt(ceil), { scale: labelScale });
  hLabel.position.set(c.x - off, ceil / 2, c.y - off);
  group.add(hLabel);
  return group;
}

// Aisle & clearance dimension annotations drawn on the floor inside the room.
// `clearances` is the array from computeClearances ({ label, value, status }).
// Lines are color-coded by status (green pass / amber warn / red fail).
export function buildClearanceDimensions(roomW, roomL, benches, clearances, fmt, { labelScale = 14 } = {}) {
  const group = new THREE.Group();
  if (!benches || benches.length === 0) return group;

  const STATUS_COLOR = { pass: 0x22c55e, warn: 0xf59e0b, fail: 0xef4444 };
  const y = 0.6;

  // Bench bounding box (inches) — X = width axis, Z = length axis.
  const rects = benches.map((b) => {
    const rot = ((b.rotationDeg || 0) % 360 + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const w = swap ? b.lengthIn : b.widthIn;
    const h = swap ? b.widthIn : b.lengthIn;
    return { x: b.pos.x, z: b.pos.y, w, h };
  });
  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minZ = Math.min(...rects.map((r) => r.z));
  const maxZ = Math.max(...rects.map((r) => r.z + r.h));

  const find = (label) => clearances.find((c) => c.label === label);

  // Helper: draw a clearance span (line + value label + small name caption).
  // labelY staggers each label to a distinct height so pills never overlap
  // (and never collide with neighbouring spans) from any orbit angle.
  const span = (label, a0, a1, fixed, axis, labelY = 12) => {
    const c = find(label);
    if (!c) return;
    const color = STATUS_COLOR[c.status] || 0x64748b;
    const p0 = axis === "x" ? new THREE.Vector3(a0, y, fixed) : new THREE.Vector3(fixed, y, a0);
    const p1 = axis === "x" ? new THREE.Vector3(a1, y, fixed) : new THREE.Vector3(fixed, y, a1);
    group.add(dimLine(p0, p1, color));
    const mid = (a0 + a1) / 2;
    // Single clear pill naming the dimension AND its value, e.g. "Center aisle  36""
    const lbl = makeLabel(`${label}  ${fmt(c.value)}`, { scale: labelScale });
    lbl.position.set(axis === "x" ? mid : fixed, labelY, axis === "x" ? fixed : mid);
    group.add(lbl);
  };

  // Each span sits at a distinct height so the camera-facing pills never overlap
  // each other from any orbit angle.
  // Front aisle (top wall z=0 → first bench) along the length axis. Anchored
  // toward room center on X so it clears the corner Left/Right wall spans.
  span("Front aisle", 0, minZ, (minX + maxX) / 2, "z", 18);
  // Back aisle (last bench → far wall z=roomL), also centered on X.
  span("Back aisle", maxZ, roomL, (minX + maxX) / 2, "z", 54);
  // Left wall clearance (x=0 → first bench) along width, anchored mid-length
  // so it doesn't sit on top of the front-aisle span at the corner.
  span("Left wall", 0, minX, (minZ + maxZ) / 2, "x", 30);
  // Right wall clearance (last bench → far wall x=roomW), also mid-length.
  span("Right wall", maxX, roomW, (minZ + maxZ) / 2, "x", 30);

  // Center aisle: use the real gap + center computed in computeClearances
  // (largest gap between adjacent bench columns) so the span matches the value.
  const centerC = find("Center aisle");
  if (centerC && centerC.center != null && centerC.value > 0.5) {
    const half = centerC.value / 2;
    span("Center aisle", centerC.center - half, centerC.center + half, (minZ + maxZ) / 2, "x", 42);
  }

  return group;
}