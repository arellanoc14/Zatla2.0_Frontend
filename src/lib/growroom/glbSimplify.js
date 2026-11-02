import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Caps how many triangles ONE copy of a model may have, by simplifying it when the
// scene would otherwise draw too many (many fixtures × a dense model). Works on any
// uploaded GLB, not just the built-in ones. The simplifier is loaded on demand so it
// costs nothing until a model actually needs it.
//
// It uses the topology-free ("sloppy") simplifier: dense generated meshes have so many
// UV seams that the normal one barely reduces them. The kept vertices keep their
// original normals and UVs, so the model keeps its look at distance; up close it is
// rougher. Fixtures are small and repeated, so that is the right trade.

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export function sceneTriangles(root) {
  let t = 0;
  root.traverse((o) => { if (o.isMesh && o.geometry) t += triCount(o.geometry); });
  return Math.round(t);
}

let simplifierPromise = null;
function getSimplifier() {
  if (!simplifierPromise) {
    simplifierPromise = import("meshoptimizer").then(async (m) => {
      await m.MeshoptSimplifier.ready;
      return m.MeshoptSimplifier;
    });
  }
  return simplifierPromise;
}

// Index list → geometry with only the vertices it still uses (attributes compacted).
function compact(source, indices) {
  const remap = new Map();
  const order = [];
  const out = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i];
    let m = remap.get(v);
    if (m === undefined) { m = order.length; remap.set(v, m); order.push(v); }
    out[i] = m;
  }
  const g = new THREE.BufferGeometry();
  Object.entries(source.attributes).forEach(([name, attr]) => {
    const size = attr.itemSize;
    const dst = new attr.array.constructor(order.length * size);
    for (let j = 0; j < order.length; j += 1) {
      for (let k = 0; k < size; k += 1) dst[j * size + k] = attr.array[order[j] * size + k];
    }
    g.setAttribute(name, new THREE.BufferAttribute(dst, size, attr.normalized));
  });
  g.setIndex(new THREE.BufferAttribute(out, 1));
  return g;
}

const cache = new Map(); // `${root.uuid}|${target}` → Promise<Object3D>

// Returns a copy of `root` whose total triangles are at most ~`maxTris` (never below
// `floorTris`). If it is already small enough, returns `root` itself. Never mutates
// `root` (it is the shared, cached GLB scene).
export function capModelTriangles(root, maxTris, floorTris = 80) {
  const total = sceneTriangles(root);
  const target = Math.max(floorTris, Math.floor(maxTris));
  if (total <= target) return Promise.resolve(root);
  const key = `${root.uuid}|${target}`;
  if (cache.has(key)) return cache.get(key);
  const job = getSimplifier().then((S) => {
    const ratio = target / total;
    const copy = root.clone(true); // shares geometry + materials; geometry replaced below
    copy.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      let geo = o.geometry;
      const own = triCount(geo);
      if (own < 12) return;
      if (!geo.index) geo = mergeVertices(geo, 1e-5);
      const idx = geo.index.array;
      const want = Math.max(36, Math.floor((triCount(geo) * ratio)) * 3);
      if (want >= idx.length) return;
      const [next] = S.simplifySloppy(new Uint32Array(idx), new Float32Array(geo.attributes.position.array), 3, null, want, 0.5);
      if (!next || next.length < 9) return; // would delete the mesh: keep the original
      o.geometry = compact(geo, next);
    });
    return copy;
  }).catch((err) => {
    console.warn("[GLB] triangle cap failed; using the full model", err?.message || err);
    return root;
  });
  cache.set(key, job);
  return job;
}
