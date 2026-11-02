import * as THREE from "three";
import { smartObjectSize, doorNearestWall, doorWallLine } from "./smartObjects";
import { pointInPolygon } from "./polygon";

export const WALL_THICKNESS = 6;
// Walls are drawn just OUTSIDE the room outline: the inner face sits this far
// (inches) beyond it, so a bench laid out at a 0" wall clearance shows a slim
// gap instead of sinking into a wall centred on the line. The walls move, the
// benches never do — bench positions, dimension labels and estimates are
// untouched. TUNE.
export const WALL_FACE_OUT_IN = 1.5;
const DOOR_HEIGHT = 80;
export const WALL_HEIGHT_MULT = 1;

const BASEBOARD_H = 6;
const BASEBOARD_OUT = 0.6;
const CAP_H = 4;
const CAP_OUT = 0.6;

let _wallMaps = null;
function getWallMaps() {
  if (_wallMaps) return _wallMaps;
  // No canvas in node: the wall builders still run (roomFabric.test.js), with
  // untextured materials.
  if (typeof document === "undefined") return { albedo: null, normal: null, panelPx: 512, tile: 512 };
  const S = 512;
  // panelPx drives the horizontal tiling in tiledWallMaterial. Keep it equal to the
  // tile width so the corrugated map repeats once per panel width — the rib pattern
  // is self-tiling within the tile, so it reads continuously across long walls.
  // ONE physical rib per tile — tiledWallMaterial repeats the tile once per RIB_IN
  // of wall height (in real inches), so each repeat reads as one corrugation fold.
  const PANEL_PX = S;

  // ── Albedo: galvanized corrugated steel siding (ONE fold per tile) ───────────
  const aCan = document.createElement("canvas");
  aCan.width = aCan.height = S;
  const a = aCan.getContext("2d");
  // Cool galvanized steel base — darker so it clearly differs from clean-room white.
  a.fillStyle = "#9aa1a8";
  a.fillRect(0, 0, S, S);
  // Subtle vertical weathering streaks (brushed-metal feel).
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * S;
    const w = 1 + Math.random() * 2;
    const dark = Math.random() < 0.5;
    a.fillStyle = dark ? "rgba(70,75,80,0.06)" : "rgba(235,240,245,0.06)";
    a.fillRect(x, 0, w, S);
  }
  // Bake the fold into the albedo too (visible even in flat lighting): a light
  // highlight crest at the TOP of the tile, a dark valley at the BOTTOM. Since the
  // tile = one rib, these land at every physical fold across the wall.
  const crest = a.createLinearGradient(0, 0, 0, S * 0.22);
  crest.addColorStop(0, "rgba(240,245,250,0.55)");
  crest.addColorStop(1, "rgba(240,245,250,0)");
  a.fillStyle = crest;
  a.fillRect(0, 0, S, S * 0.22);
  const valley = a.createLinearGradient(0, S * 0.78, 0, S);
  valley.addColorStop(0, "rgba(55,60,65,0)");
  valley.addColorStop(1, "rgba(55,60,65,0.55)");
  a.fillStyle = valley;
  a.fillRect(0, S * 0.78, S, S * 0.22);
  const albedo = new THREE.CanvasTexture(aCan);
  // sRGB like every other painted albedo; the normal map below stays linear.
  albedo.colorSpace = THREE.SRGBColorSpace;

  // ── Normal: ONE smooth fold spanning the whole tile (flat→up→flat→down→flat) ──
  const nCan = document.createElement("canvas");
  nCan.width = nCan.height = S;
  const n = nCan.getContext("2d");
  const grad = n.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0.0, "#8080ff");
  grad.addColorStop(0.30, "#80b0ff"); // fold facing up
  grad.addColorStop(0.50, "#8080ff");
  grad.addColorStop(0.70, "#8050ff"); // fold facing down
  grad.addColorStop(1.0, "#8080ff");
  n.fillStyle = grad;
  n.fillRect(0, 0, S, S);
  const normal = new THREE.CanvasTexture(nCan);

  [albedo, normal].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  });

  _wallMaps = { albedo, normal, panelPx: PANEL_PX, tile: S };
  return _wallMaps;
}

function makeIndustrialWallMaterial() {
  const { albedo, normal } = getWallMaps();
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(1.2, 1.2), // strong so the folds catch light hard
    // Galvanized siding, not a mirror: at metalness 0.7 / env 1.1 the walls
    // reflected the white room environment and read as blank white panels.
    metalness: 0.35,
    roughness: 0.5,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
}

function makeTrimMaterial() {
  // Darker galvanized/steel — base channel + cap flashing look that fits siding.
  return new THREE.MeshStandardMaterial({
    color: 0x7f868d,
    metalness: 0.5,
    roughness: 0.5,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
}

function makeConcreteBaseMaterial() {
  // Light concrete kick wall at the base of the siding (warehouses have one).
  return new THREE.MeshStandardMaterial({
    color: 0x8e8e8a,
    metalness: 0.0,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
}

// Electrical conduit along the wall tops: two EMT runs and a junction box every
// 10ft, just inside the wall's inner face. Decorative building fabric only — not
// a quoted item, so no fan or duct is ever drawn this way. Shared material;
// never casts a shadow; tagged with the wall's normal so the near-wall cull
// hides it with its wall.
const CONDUIT_MAT = new THREE.MeshStandardMaterial({ color: 0x6f757b, metalness: 0.6, roughness: 0.45 });
CONDUIT_MAT.userData._procedural = true;
const CONDUIT_RUNS = [{ drop: 10, r: 0.75 }, { drop: 13, r: 0.5 }]; // inches below the wall top, radius
const CONDUIT_BOX_PITCH_IN = 120;

// Rib repeat is sized in REAL inches so ribs don't average out to flat at facility
// scale: one corrugation fold every RIB_IN of wall height, panel seam every PANEL_IN.
const RIB_IN = 5;        // one corrugation rib per 5 inches of height (TUNE)
const PANEL_IN = 120;    // panel seam every 10 ft
function tiledWallMaterial(baseMat, lenIn, heightIn) {
  const m = baseMat.clone();
  if (m.map) {
    m.map = m.map.clone();
    m.map.needsUpdate = true;
    m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping;
    m.map.repeat.set(Math.max(1, lenIn / PANEL_IN), Math.max(2, heightIn / RIB_IN));
  }
  if (m.normalMap) {
    m.normalMap = m.normalMap.clone();
    m.normalMap.needsUpdate = true;
    m.normalMap.wrapS = m.normalMap.wrapT = THREE.RepeatWrapping;
    m.normalMap.repeat.copy(m.map.repeat);
  }
  return m;
}

function doorSpansForWall(wallName, doors, room) {
  const spans = [];
  (doors || []).forEach((d) => {
    if (doorNearestWall(d, room) !== wallName) return;
    const s = smartObjectSize(d);
    const center =
      wallName === "top" || wallName === "bottom"
        ? (d.pos?.x || 0) + s.w / 2
        : (d.pos?.y || 0) + s.h / 2;
    spans.push([center - s.w / 2, center + s.w / 2]);
  });
  return spans.sort((a, b) => a[0] - b[0]);
}

// extA / extB: how far the run continues past its start / end, to close the
// corner that opens when two walls are both pushed outward.
function buildWallWithDoors({ axis, span, thickness, wallH, fixedCoord, normal, material, trimMaterial, baseMaterial, extA = 0, extB = 0 }) {
  const meshes = [];
  fixedCoord += (axis === "x" ? normal.z : normal.x) * (thickness / 2 + WALL_FACE_OUT_IN);
  const openings = (buildWallWithDoors._openings || []).slice();

  const addTrim = (a, b, h, yMid, out, mat) => {
    const len = b - a;
    if (len <= 0.5 || h <= 0.1) return;
    const mid = (a + b) / 2;
    const geo = axis === "x"
      ? new THREE.BoxGeometry(len, h, thickness + out * 2)
      : new THREE.BoxGeometry(thickness + out * 2, h, len);
    const m = new THREE.Mesh(geo, mat || trimMaterial);
    if (axis === "x") m.position.set(mid, yMid, fixedCoord);
    else m.position.set(fixedCoord, yMid, mid);
    m.userData.wallNormal = normal;
    meshes.push(m);
  };

  const addSegment = (a, b) => {
    const len = b - a;
    if (len <= 0.5) return;
    const mid = (a + b) / 2;
    const geo = axis === "x"
      ? new THREE.BoxGeometry(len, wallH, thickness)
      : new THREE.BoxGeometry(thickness, wallH, len);
    const wall = new THREE.Mesh(geo, tiledWallMaterial(material, len, wallH));
    if (axis === "x") wall.position.set(mid, wallH / 2, fixedCoord);
    else wall.position.set(fixedCoord, wallH / 2, mid);
    wall.userData.wallNormal = normal;
    meshes.push(wall);
    addTrim(a, b, BASEBOARD_H, BASEBOARD_H / 2, BASEBOARD_OUT, baseMaterial); // concrete kick base
    addTrim(a, b, CAP_H, wallH - CAP_H / 2, CAP_OUT);                          // steel cap rail
  };

  // Conduit runs the whole span (door openings are below it), 1.25in off the
  // inner face so the pipe clears the corrugation.
  const addConduit = () => {
    const inward = axis === "x" ? -normal.z : -normal.x;
    const face = fixedCoord + inward * (thickness / 2 + 1.25);
    const tag = (m) => { m.userData.wallNormal = normal; m.userData.conduit = true; m.userData.shadowMode = "none"; meshes.push(m); };
    CONDUIT_RUNS.forEach(({ drop, r }) => {
      const run = new THREE.Mesh(new THREE.CylinderGeometry(r, r, span, 8), CONDUIT_MAT);
      if (axis === "x") { run.rotation.z = Math.PI / 2; run.position.set(span / 2, wallH - drop, face); }
      else { run.rotation.x = Math.PI / 2; run.position.set(face, wallH - drop, span / 2); }
      tag(run);
    });
    for (let s = CONDUIT_BOX_PITCH_IN / 2; s < span; s += CONDUIT_BOX_PITCH_IN) {
      const box = new THREE.Mesh(axis === "x" ? new THREE.BoxGeometry(4, 4, 2.5) : new THREE.BoxGeometry(2.5, 4, 4), CONDUIT_MAT);
      if (axis === "x") box.position.set(s, wallH - CONDUIT_RUNS[0].drop, face);
      else box.position.set(face, wallH - CONDUIT_RUNS[0].drop, s);
      tag(box);
    }
  };

  const addDoorCasing = (a, b) => {
    const jambW = 1.5;
    const headerH = 2.5;
    [a, b].forEach((edge, i) => {
      const ja = i === 0 ? edge : edge - jambW;
      const jb = i === 0 ? edge + jambW : edge;
      const len = jb - ja;
      const mid = (ja + jb) / 2;
      const geo = axis === "x"
        ? new THREE.BoxGeometry(len, DOOR_HEIGHT, thickness + CAP_OUT * 2)
        : new THREE.BoxGeometry(thickness + CAP_OUT * 2, DOOR_HEIGHT, len);
      const m = new THREE.Mesh(geo, trimMaterial);
      if (axis === "x") m.position.set(mid, DOOR_HEIGHT / 2, fixedCoord);
      else m.position.set(fixedCoord, DOOR_HEIGHT / 2, mid);
      m.userData.wallNormal = normal;
      meshes.push(m);
    });
    const len = b - a;
    const mid = (a + b) / 2;
    const geo = axis === "x"
      ? new THREE.BoxGeometry(len, headerH, thickness + CAP_OUT * 2)
      : new THREE.BoxGeometry(thickness + CAP_OUT * 2, headerH, len);
    const m = new THREE.Mesh(geo, trimMaterial);
    const yMid = DOOR_HEIGHT + headerH / 2;
    if (axis === "x") m.position.set(mid, yMid, fixedCoord);
    else m.position.set(fixedCoord, yMid, mid);
    m.userData.wallNormal = normal;
    meshes.push(m);
  };

  const addLintel = (a, b) => {
    const len = b - a;
    if (len <= 0.5) return;
    const lintelH = wallH - DOOR_HEIGHT;
    if (lintelH <= 0.5) return;
    const mid = (a + b) / 2;
    const geo = axis === "x"
      ? new THREE.BoxGeometry(len, lintelH, thickness)
      : new THREE.BoxGeometry(thickness, lintelH, len);
    const wall = new THREE.Mesh(geo, tiledWallMaterial(material, len, lintelH));
    const yMid = DOOR_HEIGHT + lintelH / 2;
    if (axis === "x") wall.position.set(mid, yMid, fixedCoord);
    else wall.position.set(fixedCoord, yMid, mid);
    wall.userData.wallNormal = normal;
    meshes.push(wall);
    addTrim(a, b, CAP_H, wallH - CAP_H / 2, CAP_OUT);
    addDoorCasing(a, b);
  };

  addConduit(); // every wall, doors or not (the runs sit above any opening)
  if (openings.length === 0) {
    addSegment(-extA, span + extB);
    return meshes;
  }

  let cursor = -extA;
  openings.forEach(([a, b]) => {
    const oa = Math.max(0, a);
    const ob = Math.min(span, b);
    if (ob <= oa) return;
    addSegment(cursor, oa);
    addLintel(oa, ob);
    cursor = Math.max(cursor, ob);
  });
  addSegment(cursor, span + extB);
  return meshes;
}

// Corner fill for outward-shifted walls. X-running walls take the whole corner;
// Z-running walls stop just inside them (0.1" buried, so the end cap never
// z-fights the other wall's face).
const cornerExt = (axis) => WALL_FACE_OUT_IN + (axis === "x" ? WALL_THICKNESS : 0.1);

// Walls for a merged / odd-shaped room: one wall run per polygon edge (room-
// local rectilinear points). The union outline has NO edge where the shared
// wall was removed, so the merged room reads as one open space in 3D. Door
// openings are cut on whichever edge the door sits against.
function buildPolygonRoomWalls(dims, origin, doors) {
  const poly = dims.polygon;
  const ceil = dims.ceilingIn || 1;
  const wallH = ceil * WALL_HEIGHT_MULT;
  const t = WALL_THICKNESS;
  const ox = origin.x || 0;
  const oz = origin.z || 0;

  const group = new THREE.Group();
  const material = makeIndustrialWallMaterial();
  const trimMaterial = makeTrimMaterial();
  const baseMaterial = makeConcreteBaseMaterial();

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5;
    if (!horizontal && !vertical) continue; // non-rectilinear edge — skip
    const start = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const end = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const span = end - start;
    if (span < 1) continue;
    const fixed = horizontal ? a.y : a.x; // constant room-local coordinate

    // Outward normal: probe just off the edge midpoint — the side NOT inside
    // the polygon faces outward (drives the camera wall-culling).
    const midAlong = (start + end) / 2;
    let normal;
    if (horizontal) {
      const insideBelow = pointInPolygon({ x: midAlong, y: fixed + 2 }, poly, false);
      normal = new THREE.Vector3(0, 0, insideBelow ? -1 : 1);
    } else {
      const insideRight = pointInPolygon({ x: fixed + 2, y: midAlong }, poly, false);
      normal = new THREE.Vector3(insideRight ? -1 : 1, 0, 0);
    }

    // Door openings on this edge (span-space, relative to `start`). A door belongs
    // to the wall line doorWallLine picks for it — no proximity threshold, so a
    // door stored slightly off the outline still cuts a real opening.
    const openings = [];
    (doors || []).forEach((d) => {
      const s = smartObjectSize(d);
      const dcx = (d.pos?.x || 0) + s.w / 2;
      const dcy = (d.pos?.y || 0) + s.h / 2;
      const line = doorWallLine(d, dims);
      const along = horizontal ? dcx : dcy;
      const half = (horizontal ? s.w : s.h) / 2;
      const onThisEdge =
        Math.abs(line.coord - fixed) < 0.5 &&
        (horizontal ? (line.side === "top" || line.side === "bottom") : (line.side === "left" || line.side === "right"));
      if (onThisEdge && along + half > start && along - half < end) {
        openings.push([along - half - start, along + half - start]);
      }
    });
    buildWallWithDoors._openings = openings.sort((x, y) => x[0] - y[0]);

    // Extend only past OUTSIDE corners. At a notch's inside corner the two
    // shifted walls already cross in the notch, and extending would push a
    // wall stub into the room. Probe: just past the end, on the outward side.
    const out = horizontal ? normal.z : normal.x;
    const ext = (endAlong, dir) => {
      const p = horizontal
        ? { x: endAlong + dir * 2, y: fixed + out * 2 }
        : { x: fixed + out * 2, y: endAlong + dir * 2 };
      return pointInPolygon(p, poly, false) ? 0 : cornerExt(horizontal ? "x" : "z");
    };
    const meshes = buildWallWithDoors({
      axis: horizontal ? "x" : "z",
      extA: ext(start, -1), extB: ext(end, 1),
      span, thickness: t, wallH,
      fixedCoord: horizontal ? oz + fixed : ox + fixed,
      normal, material, trimMaterial, baseMaterial,
    });
    meshes.forEach((m) => {
      if (horizontal) m.position.x += ox + start;
      else m.position.z += oz + start;
      group.add(m);
    });
  }
  buildWallWithDoors._openings = [];
  return group;
}

export function buildRoomWalls(dims, origin = { x: 0, z: 0 }, doors = []) {
  if (Array.isArray(dims.polygon) && dims.polygon.length >= 3) {
    return buildPolygonRoomWalls(dims, origin, doors);
  }
  const roomW = dims.widthIn || 1;
  const roomL = dims.lengthIn || 1;
  const ceil = dims.ceilingIn || 1;
  const wallH = ceil * WALL_HEIGHT_MULT;
  const t = WALL_THICKNESS;
  const ox = origin.x || 0;
  const oz = origin.z || 0;

  const group = new THREE.Group();
  const material = makeIndustrialWallMaterial();
  const trimMaterial = makeTrimMaterial();
  const baseMaterial = makeConcreteBaseMaterial();
  const roomDims = { widthIn: roomW, lengthIn: roomL };

  [
    { name: "front", z: oz, normal: new THREE.Vector3(0, 0, -1), wallKey: "top" },
    { name: "back", z: oz + roomL, normal: new THREE.Vector3(0, 0, 1), wallKey: "bottom" },
  ].forEach(({ z, normal, wallKey }) => {
    buildWallWithDoors._openings = doorSpansForWall(wallKey, doors, roomDims);
    const meshes = buildWallWithDoors({
      axis: "x", span: roomW, thickness: t, wallH, extA: cornerExt("x"), extB: cornerExt("x"),
      fixedCoord: z, normal, material, trimMaterial, baseMaterial,
    });
    meshes.forEach((m) => { m.position.x += ox; group.add(m); });
  });

  [
    { name: "left", x: ox, normal: new THREE.Vector3(-1, 0, 0), wallKey: "left" },
    { name: "right", x: ox + roomW, normal: new THREE.Vector3(1, 0, 0), wallKey: "right" },
  ].forEach(({ x, normal, wallKey }) => {
    buildWallWithDoors._openings = doorSpansForWall(wallKey, doors, roomDims);
    const meshes = buildWallWithDoors({
      axis: "z", span: roomL, thickness: t, wallH, extA: cornerExt("z"), extB: cornerExt("z"),
      fixedCoord: x, normal, material, trimMaterial, baseMaterial,
    });
    meshes.forEach((m) => { m.position.z += oz; group.add(m); });
  });

  buildWallWithDoors._openings = [];
  return group;
}

export function buildDefaultWalls(roomW, roomL, ceil, doors = []) {
  return buildRoomWalls({ widthIn: roomW, lengthIn: roomL, ceilingIn: ceil }, { x: 0, z: 0 }, doors);
}