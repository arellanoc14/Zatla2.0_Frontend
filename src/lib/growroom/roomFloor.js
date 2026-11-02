import * as THREE from "three";
import { getFloorAlbedo } from "./facilityFloor.js";

// Render-only interior room floor — a sealed-concrete slab covering a single
// room's footprint, parented to that room's pivot group so it rotates/moves with
// the room. Sits just above the shared facility floor. Display-only; never touches
// data. The material is marked _procedural so the scene's disposal pass skips it
// (shared across rooms via the cached module-level material).
//
// It takes NO per-material envMap: scene.environment lights it. Pinning the
// build's PMREM texture here left the cached material pointing at a texture the
// next rebuild had disposed (sceneColor.test.js).

const TILE_IN = 120; // one concrete tile per 10ft, whatever the room's size

let _roomFloorMat = null;
function getRoomFloorMaterial() {
  if (_roomFloorMat) return _roomFloorMat;
  const mat = new THREE.MeshLambertMaterial({
    color: 0x0a0a0a,
    // Light sealed concrete; the facility slab outside the rooms is a step
    // darker, so each room reads as its own lit slab.
    map: getFloorAlbedo("#070707"),
    // Pull the room floor toward the camera in depth so it always wins over the
    // facility slab beneath it — no z-fighting / color flicker where they overlap.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.userData._procedural = true; // shared — skip auto-dispose
  _roomFloorMat = mat;
  return mat;
}

// Add a floor plane for one room, sized to its width × length, centered in the
// room's pivot group (room-center-local coords), lying flat just above the facility
// floor. `group` is the room's rotation pivot group, so the floor rotates with it.
// A merged / odd-shaped room passes its `polygon` (room-local {x,y} from the top-
// left corner) so the slab follows the union outline instead of filling the whole
// bounding box — otherwise the notch of an L-shaped merge shows as empty floor.
export function addRoomFloor(group, widthIn, lengthIn, polygon = null) {
  // Always a ShapeGeometry, rectangle or merged outline: its UVs are the shape's
  // own coordinates (inches), so dividing by TILE_IN tiles ONE shared texture at
  // 10ft for every room. (A PlaneGeometry's 0..1 UVs would stretch one tile over
  // the whole room, and a per-room repeat would need a per-room texture.)
  const pts = Array.isArray(polygon) && polygon.length >= 3
    ? polygon
    : [{ x: 0, y: 0 }, { x: widthIn, y: 0 }, { x: widthIn, y: lengthIn }, { x: 0, y: lengthIn }];
  // Shape lives in XY; after the -90° X rotation shape +y becomes world -z,
  // so flip y to keep room-local y pointing down the room like the walls.
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x - widthIn / 2, -(p.y - lengthIn / 2))));
  const geom = new THREE.ShapeGeometry(shape);
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE_IN, uv.getY(i) / TILE_IN);
  const floor = new THREE.Mesh(geom, getRoomFloorMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.userData.shadowMode = "receive"; // benches shadow it; a floor never casts
  floor.position.set(0, 0.5, 0); // room-center-local; clearly above the facility slab
  group.add(floor);
  return floor;
}
