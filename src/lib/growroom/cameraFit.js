import * as THREE from "three";

// The walkthrough's opening shot: a three-quarter heading and a distance that
// fits the CONTENT (benches and equipment) into the frame.
//
// Heading. camDir is the unit vector from the framing target TOWARD the camera:
// angle is the heading around the room (π = dead in front, the old frontal
// view), pitch is measured from vertical. DEFAULT_ANGLE stands the camera 36°
// off the front axis so the bench rows recede toward a visible vanishing point;
// DEFAULT_PITCH (~36° above the floor) is low enough that every bench shows a
// vertical face and the tiers stack visibly, high enough that the aisles read.
//
// Distance. Fit by projecting the box's eight corners through the actual camera:
// re-centre the look-at on the projected extents (under perspective the near end
// of a long room looms and the far end shrinks, so the box's centre is not the
// picture's centre, and a fixed padding either clipped the near row or left
// empty floor over the far one), then bisect the distance until the tighter
// axis spans exactly FILL of the frame. The span shrinks monotonically with
// distance, so the bisection always lands; a plain multiplicative step crept
// for long rooms at wide aspects (cameraFit.test.js pins the exact fit).
//
// ponytail: thumbnailRenderer.js keeps its own copy of this fit — its test pins
// the math in that file and the walkthrough may not import from it. Merge the
// two when the email render is next touched.
export const DEFAULT_ANGLE = Math.PI * 0.8;
export const DEFAULT_PITCH = 0.95;

export function camDirFromAngle(angle, pitch) {
  return new THREE.Vector3(
    Math.sin(angle) * Math.sin(pitch),
    Math.cos(pitch),
    Math.cos(angle) * Math.sin(pitch)
  ).normalize();
}

export function defaultCamDir() {
  return camDirFromAngle(DEFAULT_ANGLE, DEFAULT_PITCH);
}

// Returns { pos, tgt, distance } for `camera`'s fov/aspect. Works on a clone, so
// the caller's camera is never moved — a mode tween starts from wherever it is.
export function fitCameraToBox(camera, box, camDir, fill = 0.82) {
  const cam = camera.clone();
  const center = box.getCenter(new THREE.Vector3());
  const fovV = (cam.fov * Math.PI) / 180;
  const tanV = Math.tan(fovV / 2);
  const tanH = tanV * cam.aspect;
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, camDir).normalize();
  const camUp = new THREE.Vector3().crossVectors(camDir, right).normalize();
  const { min, max } = box;
  const corners = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners.push(new THREE.Vector3(x, y, z));

  // Projected extents of the corners with the camera `distance` out from `target`.
  const ndc = new THREE.Vector3();
  const measure = (target, distance) => {
    cam.position.copy(target).add(camDir.clone().multiplyScalar(distance));
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      ndc.copy(c).project(cam);
      minX = Math.min(minX, ndc.x); maxX = Math.max(maxX, ndc.x);
      minY = Math.min(minY, ndc.y); maxY = Math.max(maxY, ndc.y);
    }
    return { midX: (minX + maxX) / 2, midY: (minY + maxY) / 2, half: Math.max((maxX - minX) / 2, (maxY - minY) / 2) };
  };

  // First estimate: the distance each corner needs on both camera axes from
  // the box centre — exact for the corner that binds, but centred on the BOX.
  const v = new THREE.Vector3();
  let needed = 0;
  for (const c of corners) {
    v.copy(c).sub(center);
    const along = v.dot(camDir); // toward the camera = nearer
    needed = Math.max(needed, Math.abs(v.dot(right)) / tanH + along, Math.abs(v.dot(camUp)) / tanV + along);
  }
  const target = center.clone();
  let distance = Math.max(needed, 1);

  for (let round = 0; round < 3; round++) {
    // Re-centre: an NDC offset is a world shift along the camera's own axes at
    // the target's depth; moving the target moves the camera with it, so the
    // heading is unchanged and only the framing slides.
    const m = measure(target, distance);
    target.add(right.clone().multiplyScalar(m.midX * distance * tanH));
    target.add(camUp.clone().multiplyScalar(m.midY * distance * tanV));
    // Bisect the distance so the tighter axis spans FILL.
    let lo = distance, hi = distance;
    for (let i = 0; i < 12 && measure(target, hi).half > fill; i++) hi *= 1.5;
    for (let i = 0; i < 12 && measure(target, lo).half < fill; i++) lo /= 1.5;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (measure(target, mid).half > fill) lo = mid; else hi = mid;
    }
    distance = hi;
  }
  return { pos: target.clone().add(camDir.clone().multiplyScalar(distance)), tgt: target, distance };
}
