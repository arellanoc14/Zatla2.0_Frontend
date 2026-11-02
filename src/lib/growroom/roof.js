import * as THREE from "three";

// Room ceiling for the 3D scene: a corrugated metal deck on exposed steel
// purlins and two girders, built ROOM-CENTRED (x ∈ [-rw/2, rw/2], z ∈ [-rl/2,
// rl/2], deck at y = ceil) so it parents straight to the room's pivot group.
// No skylights: a grow room is light-tight.
//
// Scope: visual only. Walkthrough3D hides the whole group whenever the camera
// is above the ceiling (Orbit from above, Top-down) and shows it from inside
// (Walk), and tags it shadowMode "none" — a deck casting under the overhead key
// would black out the room. Never touches benches / lights / layout.

const TILE_IN = 120; // one deck tile per 10ft (12 ribs per tile → a rib every 10in)

// Procedural corrugated metal roof-deck texture (ribs running along one axis),
// built lazily (node tests import this module) and cached.
let cachedDeck = null;
function getRoofDeckTexture() {
  if (cachedDeck) return cachedDeck;
  if (typeof document === "undefined") return null;
  const W = 256, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#9aa0a6";
  ctx.fillRect(0, 0, W, H);
  const ribs = 12;
  const rw = W / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * rw;
    const g = ctx.createLinearGradient(x, 0, x + rw, 0);
    g.addColorStop(0, "rgba(40,44,48,0.30)");
    g.addColorStop(0.5, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(40,44,48,0.30)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rw, H);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedDeck = tex;
  return tex;
}

// Shared, _procedural: the scene's dispose pass skips them.
let _deckMat = null;
function deckMaterial() {
  if (_deckMat) return _deckMat;
  _deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: getRoofDeckTexture(), roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide,
  });
  _deckMat.userData._procedural = true;
  return _deckMat;
}
const BEAM_MAT = new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.6, metalness: 0.4 });
BEAM_MAT.userData._procedural = true;

const PURLIN_PITCH_IN = 96; // one cross purlin every 8ft
const PURLIN_D = 8, PURLIN_T = 3;
const GIRDER_D = 12, GIRDER_T = 4;

export function buildRoomCeiling(rw, rl, ceil, polygon = null) {
  const group = new THREE.Group();
  const isPoly = Array.isArray(polygon) && polygon.length >= 3;

  // Deck: a ShapeGeometry (rectangle or merged outline) whose UVs are the
  // shape's own inches, scaled so one tile spans 10ft whatever the room's size.
  // Rotated +90° about X so its normal points DOWN into the room and shape +y
  // lands on world +z (room-local y runs down the room, like the walls).
  const pts = isPoly
    ? polygon
    : [{ x: 0, y: 0 }, { x: rw, y: 0 }, { x: rw, y: rl }, { x: 0, y: rl }];
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x - rw / 2, p.y - rl / 2)));
  const geom = new THREE.ShapeGeometry(shape);
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE_IN, uv.getY(i) / TILE_IN);
  const deck = new THREE.Mesh(geom, deckMaterial());
  deck.rotation.x = Math.PI / 2;
  deck.position.y = ceil;
  group.add(deck);

  // Exposed steel: cross purlins every 8ft and two girders along the length,
  // hung just under the deck. Rectangles only — a merged outline would need
  // per-edge clipping, and the deck alone already reads as a ceiling there.
  if (!isPoly) {
    const count = Math.max(2, Math.round(rl / PURLIN_PITCH_IN));
    for (let i = 0; i <= count; i++) {
      const z = -rl / 2 + (rl / count) * i;
      const purlin = new THREE.Mesh(new THREE.BoxGeometry(rw, PURLIN_D, PURLIN_T), BEAM_MAT);
      purlin.position.set(0, ceil - PURLIN_D / 2 - 1, z);
      group.add(purlin);
    }
    [-rw * 0.2, rw * 0.2].forEach((x) => {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(GIRDER_T, GIRDER_D, rl), BEAM_MAT);
      girder.position.set(x, ceil - GIRDER_D / 2 - 1, 0);
      group.add(girder);
    });
  }
  return group;
}
