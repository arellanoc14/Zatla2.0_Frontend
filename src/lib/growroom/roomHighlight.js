import * as THREE from "three";

// Build a per-room selection indicator on the FLOOR: a translucent green floor
// tint plus a bright green outline frame at floor level, both drawn ON TOP
// (depthTest off) so the selected room reads clearly from any angle even over a
// packed bench layout. Hidden by default; a selection effect shows exactly one,
// and the render loop pulses the visible one. Display-only; never touches
// data/layout. Returns { group, fillMat, ringMat }.
// `polygon` (optional): merged-room outline in room-local inches — the tint and
// outline then follow the real shape, not the bounding rectangle.
export function buildRoomHighlight(rw, rl, polygon = null) {
  const poly = Array.isArray(polygon) && polygon.length >= 3 ? polygon : null;
  const group = new THREE.Group();
  group.visible = false;

  const hw = rw / 2, hl = rl / 2;
  const FLOOR_Y = 0.5; // inches — just above the floor slab to avoid z-fighting

  // Translucent green floor tint laid flat on the floor.
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e, transparent: true, opacity: 0.06,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
  const floorGeo = poly
    ? new THREE.ShapeGeometry(new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x - hw, -(p.y - hl)))))
    : new THREE.PlaneGeometry(rw, rl);
  const floor = new THREE.Mesh(floorGeo, fillMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, 0);
  floor.renderOrder = 998;
  group.add(floor);

  // Bright solid green outline frame at floor level — a crisp glowing rectangle
  // tracing the room footprint. Always on top (depthTest off). Shared ringMat →
  // pulses + green↔red overlap swap apply to the whole frame.
  const ringMat = new THREE.LineBasicMaterial({
    color: 0x16a34a, transparent: true, opacity: 0.6, depthTest: false,
  });
  const ringGeo = new THREE.BufferGeometry().setFromPoints(poly
    ? [...poly, poly[0]].map((p) => new THREE.Vector3(p.x - hw, FLOOR_Y, p.y - hl))
    : [
    new THREE.Vector3(-hw, FLOOR_Y, -hl),
    new THREE.Vector3(hw, FLOOR_Y, -hl),
    new THREE.Vector3(hw, FLOOR_Y, hl),
    new THREE.Vector3(-hw, FLOOR_Y, hl),
    new THREE.Vector3(-hw, FLOOR_Y, -hl),
  ]);
  const ring = new THREE.Line(ringGeo, ringMat);
  ring.renderOrder = 999;
  group.add(ring);

  return { group, fillMat, ringMat };
}