import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Flatten a built THREE.Group (e.g. a scaffold bench or grow light) into a set of
// merged geometries grouped by material. Returns [{ material, geometry }, ...].
// This lets us draw N identical objects with one InstancedMesh per material
// instead of N copies of a hundreds-of-mesh group — identical visuals, far fewer
// draw calls.
export function flattenGroupByMaterial(group) {
  const byMaterial = new Map(); // material -> array of world-baked geometries
  group.updateMatrixWorld(true);
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld);
    const mat = obj.material;
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat).push(geo);
  });

  const parts = [];
  byMaterial.forEach((geos, material) => {
    const merged = mergeGeometries(geos, false);
    if (merged) parts.push({ material, geometry: merged });
    geos.forEach((g) => g.dispose());
  });
  return parts;
}

// Same result as instanceParts, but as plain merged static meshes (one per material,
// every copy baked into the geometry). For phones, where InstancedMesh can draw black
// or not at all. Costs memory per copy, so use it for light geometry only.
export function bakeParts(parts, placements) {
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  parts.forEach(({ geometry, material }) => {
    const baked = placements.map((p) => {
      e.set(0, p.rotationY || 0, 0);
      q.setFromEuler(e);
      v.set(p.x, p.y || 0, p.z);
      s.set(p.sx || 1, 1, p.sz || 1);
      m.compose(v, q, s);
      return geometry.clone().applyMatrix4(m);
    });
    const merged = mergeGeometries(baked, false);
    baked.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  });
  return meshes;
}

// Phone path of a bench-owned batch (fixtures, under-canopy lights): bake the
// placements of EACH BENCH into their own merged meshes, tagged benchId, so a
// mobile-aisle column slide can move a bench's copies with it. One merged mesh
// per bench per material instead of one per material — a few more draw calls,
// still no InstancedMesh (which draws black on some phone GPUs).
export function bakePartsPerBench(parts, placements) {
  const byBench = new Map();
  placements.forEach((p) => {
    const k = p.benchId || "";
    if (!byBench.has(k)) byBench.set(k, []);
    byBench.get(k).push(p);
  });
  const meshes = [];
  byBench.forEach((list, benchId) => {
    bakeParts(parts, list).forEach((mesh) => {
      if (benchId) mesh.userData.benchId = benchId;
      meshes.push(mesh);
    });
  });
  return meshes;
}

// Build one InstancedMesh per material part and place each instance via Matrix4.
// placements: [{ x, z, rotationY }]. Returns an array of InstancedMesh.
export function instanceParts(parts, placements) {
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  parts.forEach(({ geometry, material }) => {
    const im = new THREE.InstancedMesh(geometry, material, placements.length);
    placements.forEach((p, i) => {
      e.set(0, p.rotationY || 0, 0);
      q.setFromEuler(e);
      v.set(p.x, p.y || 0, p.z);
      s.set(p.sx || 1, 1, p.sz || 1); // per-instance footprint stretch
      m.compose(v, q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    // Instances are static after build → skip per-frame matrix recomputation.
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    im.matrixAutoUpdate = false;
    im.updateMatrix();
    meshes.push(im);
  });
  return meshes;
}