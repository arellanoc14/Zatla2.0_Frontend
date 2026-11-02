import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flattenGroupByMaterial } from "./instanceGroup";
import { DEFAULT_MODELS, PLANT_LODS } from "./globalModels";
import {
  PLANT_FILL, PLANT_HEIGHT_IN, PLANT_TRI_BUDGET, PLANT_TRI_BUDGET_MOBILE, pickPlantLod,
} from "./plantLayout";

// Which plant GLB the 3D scene should draw.
//
// The built-in ZATLA plant (~25k triangles) is far too heavy to repeat 6 times per
// bench, so the scene uses one of its lighter levels of detail, chosen from the
// total plant count so the whole plant field stays inside a triangle budget
// (smaller on phones). A plant uploaded on the Model Library page is used as-is.
export function resolvePlantUrl(models, plantCount = 0, { mobile = false } = {}) {
  const url = models?.cannabisPlantUrl;
  if (typeof url !== "string" || url.trim() === "") return null;
  if (url !== DEFAULT_MODELS.cannabisPlantUrl) return url;
  const budget = mobile ? PLANT_TRI_BUDGET_MOBILE : PLANT_TRI_BUDGET;
  const i = pickPlantLod(plantCount, PLANT_LODS.map((l) => l.tris), budget);
  return PLANT_LODS[i].url;
}

// Warn (don't fail) when an uploaded plant would be very heavy once repeated.
const TRIANGLE_WARN = 3_000_000;

// Draw every plant of every room — one draw per material per room, never one mesh
// per plant.
//
//   roomPlantData[rid] = [{ x, y, z, yaw, cellMin }]
//     x/z: position in the room group's local frame; y: deck height the pot
//     rests on; yaw: radians; cellMin: smaller grid-cell dimension (inches),
//     which caps the plant's width so neighbours never overlap.
//
// bake: true merges each room's plants into plain static meshes instead of
// InstancedMesh. Some phone GPUs/drivers draw InstancedMesh as black or not at all
// (the GPS app hit this and avoids instancing on mobile), so phones take this path.
//
// The model is normalised once (base at y=0, centred, 1 unit tall) so each
// instance is scaled to its own height in inches (the scene's unit).
export function renderPlantField({
  roomPlantData, roomGroups, fallbackGroup, url, loadGLB, isDisposed, trackMat, invalidate, bake = false,
}) {
  if (!url) return;
  const rids = Object.keys(roomPlantData).filter((rid) => roomPlantData[rid]?.length);
  if (rids.length === 0) return;

  loadGLB(url)
    .then((sceneObj) => {
      if (isDisposed()) return;
      const parts = flattenGroupByMaterial(sceneObj);
      if (parts.length === 0) return;

      const box = new THREE.Box3();
      parts.forEach(({ geometry }) => { geometry.computeBoundingBox(); box.union(geometry.boundingBox); });
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const height = size.y || 1;
      const widthRatio = Math.max(size.x, size.z, 1e-6) / height; // width ÷ height
      const k = 1 / height;
      parts.forEach(({ geometry }) => {
        geometry.translate(-center.x, -box.min.y, -center.z);
        geometry.scale(k, k, k);
      });

      let tris = 0;
      parts.forEach(({ geometry }) => { tris += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3; });
      let plantCount = 0;
      rids.forEach((rid) => { plantCount += roomPlantData[rid].length; });
      if (tris * plantCount > TRIANGLE_WARN) {
        console.warn(`[Plants] ${plantCount} plants x ${Math.round(tris)} triangles is heavy; consider a lighter plant model.`);
      }

      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const matrixFor = (p) => {
        const s = Math.min(PLANT_HEIGHT_IN, (PLANT_FILL * p.cellMin) / widthRatio);
        e.set(0, p.yaw || 0, 0);
        q.setFromEuler(e);
        pos.set(p.x, p.y, p.z);
        scl.set(s, s, s);
        return m.compose(pos, q, scl);
      };

      rids.forEach((rid) => {
        const list = roomPlantData[rid];
        const dest = roomGroups[rid] || fallbackGroup;
        parts.forEach(({ geometry, material }) => {
          if (bake) {
            const baked = list.map((p) => geometry.clone().applyMatrix4(matrixFor(p)));
            const merged = mergeGeometries(baked, false);
            baked.forEach((g) => g.dispose());
            if (!merged) return;
            const mesh = new THREE.Mesh(merged, material);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            mesh.userData.perfTag = "plants"; // lets the speed test switch plants off
            trackMat(mesh.material);
            dest.add(mesh);
            return;
          }
          const im = new THREE.InstancedMesh(geometry, material, list.length);
          list.forEach((p, i) => im.setMatrixAt(i, matrixFor(p)));
          im.instanceMatrix.needsUpdate = true;
          im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          im.matrixAutoUpdate = false;
          im.updateMatrix();
          im.userData.perfTag = "plants"; // lets the speed test switch plants off
          trackMat(im.material);
          dest.add(im);
        });
      });
      invalidate();
    })
    .catch((err) => {
      console.error("[Plants] model failed to load:", err?.message || err);
    });
}
