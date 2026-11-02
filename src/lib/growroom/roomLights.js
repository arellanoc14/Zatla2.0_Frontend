import * as THREE from "three";
import { loadGLB, fitModelToFootprint } from "./glbModel";
import { applyBenchMaterials } from "./benchMaterials";
import { lightSlotForModel } from "./lightModels";
import { sceneLightUrl, lightTrisPerFixture } from "./lightLod";
import { capModelTriangles } from "./glbSimplify";
import { flattenGroupByMaterial, instanceParts, bakePartsPerBench } from "./instanceGroup";

// ── Per-room grow-light fixtures (view-only) ─────────────────────────────────
// Renders each room's CHOSEN light model onto its single-tier benches using the
// EXACT same Phoenix pipeline data (growLightPlacements fits: full bench width ×
// 4ft length slice, topY, rotation-aware, { uniform:false, targetH:6 }). Each
// room owns a dedicated THREE.Group so a model change CROSSFADES that room's
// fixtures in place (~300ms) with no scene rebuild. Fixtures are display-only,
// derived from benches, never persisted to rooms[].objects[], never selectable.
export function createRoomLights({ renderRooms, roomGroups, roomLightData, models, trackMat, fallbackGroup, invalidate, isDisposed, mobile = false }) {
  const groups = {}; // rid → THREE.Group holding that room's fixtures
  // Total fixtures in the scene, used to pick the built-in light's level of detail.
  const fixtureCount = Object.values(roomLightData).reduce(
    (n, fits) => n + fits.reduce((m, f) => m + f.placements.length, 0), 0);
  // Chosen slot URL. "none" is an INTENTIONAL no-lights state (no Phoenix
  // fallback); any other empty/unknown slot falls back to Phoenix (never crash).
  const resolveUrl = (key) => {
    if (key === "none") return null;
    const slot = lightSlotForModel(key || "phoenix");
    if (!slot) return null;
    const url = models[slot] || models.growLightUrl || null;
    return sceneLightUrl(url, fixtureCount, { mobile });
  };

  // Clone every mesh material so this fixture owns PRIVATE material instances.
  // GLB clones can still share materials from the cached model — without this,
  // fading one room's fixtures mutates opacity on other rooms' fixtures too
  // (the "all rooms change / lights start invisible" bug).
  const isolateMaterials = (root) => {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => (m ? m.clone() : m))
        : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (!m) return;
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        m.needsUpdate = true;
      });
    });
  };

  const setOpacity = (root, op, solid) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (!m) return;
        m.transparent = !solid;
        m.opacity = solid ? 1 : op;
      });
    });
  };

  // Build fixtures for one room's fits into its group (materials per holder,
  // so fading one room never affects another). Returns the new holders.
  const addFixtures = (rid, url, initialOpacity, modelKey) =>
    // Cap triangles per fixture so ALL fixtures together stay inside the light budget —
    // this also lowers an uploaded light model, not just the built-in ones.
    loadGLB(url).then((raw) => capModelTriangles(raw, lightTrisPerFixture(fixtureCount, mobile))).then((sceneObj) => {
      const grp = groups[rid];
      if (isDisposed() || !grp) return null;
      // lengthAxis "z" makes the fitter turn each model so its LENGTH always runs
      // along local Z, whichever axis the GLB was authored along. That replaces both
      // the Griffin's hand-baked 90° correction and the per-model `extraRot` that
      // used to be measured here — growLightPlacements now gives the final rotation.
      const fitOpts = { uniform: false, targetH: 6, lengthAxis: "z" };
      const holders = [];
      // PERFORMANCE: fixtures with the same footprint share one fitted template, and
      // repeated ones are drawn as ONE InstancedMesh per material (plain merged meshes
      // on phones) instead of a separate clone — and draw call — per fixture. Every
      // fixture of a room still shares that room's private materials, so a crossfade
      // fades exactly this room's lights.
      // SCALING: every fixture in a room shares ONE fitted template; differing
      // footprints become a per-instance x/z stretch instead of a new bucket, so a
      // room costs one draw per material no matter how many fixtures (882 in L).
      // Only the long-axis orientation (width ≤ length or not) splits buckets.
      const buckets = new Map();
      (roomLightData[rid] || []).forEach((fit) => {
        fit.placements.forEach((p) => {
          const key = fit.benchW <= fit.segLen ? "w<l" : "w>l";
          if (!buckets.has(key)) buckets.set(key, { benchW: fit.benchW, segLen: fit.segLen, list: [] });
          buckets.get(key).list.push({ x: p.x, y: p.y ?? fit.topY ?? 0, z: p.z, rotationY: (p.rotationY || 0), w: fit.benchW, l: fit.segLen, benchId: fit.benchId });
        });
      });
      buckets.forEach(({ benchW, segLen, list }) => {
        if (list.length >= 1) {
          const template = fitModelToFootprint(sceneObj, benchW, segLen, fitOpts);
          // Which local axis holds the width? Compare the fitted box to the reference.
          const sz = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());
          const widthOnX = Math.abs(sz.x - benchW) <= Math.abs(sz.z - benchW);
          list.forEach((p) => {
            const kw = p.w / benchW, kl = p.l / segLen;
            p.sx = widthOnX ? kw : kl;
            p.sz = widthOnX ? kl : kw;
          });
          applyBenchMaterials(template);
          isolateMaterials(template);
          const parts = flattenGroupByMaterial(template);
          // Safety net: merging must keep every triangle, otherwise draw clones.
          const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
          let srcTris = 0;
          template.traverse((o) => { if (o.isMesh && o.geometry) srcTris += triCount(o.geometry); });
          let partTris = 0;
          parts.forEach(({ geometry }) => { partTris += triCount(geometry); });
          if (parts.length && partTris >= srcTris - 1) {
            // Phones: one merged copy per bench (tagged benchId) so a column slide
            // still moves each bench's fixtures; desktop: one InstancedMesh.
            const meshes = mobile ? bakePartsPerBench(parts, list) : instanceParts(parts, list);
            meshes.forEach((mesh) => {
              mesh.userData.ownsGeometry = true; // merged copy, safe to free when this model is swapped out
              if (mesh.isInstancedMesh) mesh.userData.instanceBenchIds = list.map((p) => p.benchId); // column slide moves the moving benches' fixtures
              trackMat(mesh.material);
              mesh.castShadow = mesh.receiveShadow = true;
              if (initialOpacity < 1) setOpacity(mesh, initialOpacity, false);
              grp.add(mesh);
              holders.push(mesh);
            });
            return;
          }
          parts.forEach(({ geometry }) => geometry.dispose());
        }
        // A single fixture (or merging lost geometry): one clone each, as before.
        list.forEach((p) => {
          const holder = fitModelToFootprint(sceneObj, benchW, segLen, fitOpts);
          holder.position.set(p.x, p.y, p.z);
          if (p.rotationY) holder.rotation.y = p.rotationY;
          if (p.benchId) holder.userData.benchId = p.benchId;
          applyBenchMaterials(holder);
          isolateMaterials(holder);
          holder.traverse((o) => { if (o.isMesh) trackMat(o.material); });
          if (initialOpacity < 1) setOpacity(holder, initialOpacity, false);
          grp.add(holder);
          holders.push(holder);
        });
      });
      invalidate();
      return holders;
    }).catch((err) => {
      console.error("[GLB] grow light render failed", err?.message || err);
      return null;
    });

  // Crossfade one room's group to a new model: load the new GLB FIRST, then
  // tween old 1→0 / new 0→1 over ~300ms, then remove the old fixtures. Only this
  // room's light group changes — renderer/scene untouched (no flash-load).
  const swap = (rid, modelKey) => {
    const grp = groups[rid];
    if (!grp || grp.userData.modelKey === modelKey) return;
    grp.userData.modelKey = modelKey;
    const url = resolveUrl(modelKey);
    const old = [...grp.children];
    const removeOld = () => {
      old.forEach((h) => { grp.remove(h); if (h.userData && h.userData.ownsGeometry && h.geometry) h.geometry.dispose(); });
      invalidate();
    };
    if (!url) {
      // "none" (or nothing uploaded anywhere): fade the old fixtures out, then
      // leave the group empty. No GLB load needed, no crash.
      if (old.length === 0) { invalidate(); return; }
      const t0 = performance.now(), DUR = 300;
      const tick = () => {
        if (isDisposed()) return;
        const k = Math.min(1, (performance.now() - t0) / DUR);
        old.forEach((h) => setOpacity(h, 1 - k, false));
        invalidate();
        if (k < 1) requestAnimationFrame(tick);
        else removeOld();
      };
      tick();
      return;
    }
    addFixtures(rid, url, 0, modelKey).then((holders) => {
      if (isDisposed() || !holders) return;
      const t0 = performance.now(), DUR = 300;
      const tick = () => {
        if (isDisposed()) return;
        const k = Math.min(1, (performance.now() - t0) / DUR);
        old.forEach((h) => setOpacity(h, 1 - k, false));
        holders.forEach((h) => setOpacity(h, k, false));
        invalidate();
        if (k < 1) requestAnimationFrame(tick);
        else { removeOld(); holders.forEach((h) => setOpacity(h, 1, true)); invalidate(); }
      };
      tick();
    });
  };

  // Seed a group for EVERY room (Phoenix default) — even rooms with no eligible
  // benches or no fixtures right now — so a later model change always has a group
  // to reconcile against.
  // Resolves once every room's INITIAL fixtures are on screen (or failed), so
  // the scene can show benches and lights together instead of lights first.
  const initialLoads = [];
  renderRooms.forEach((rr) => {
    const rid = rr.__rid;
    if (!rid || groups[rid]) return;
    const g = new THREE.Group();
    g.userData.perfTag = "lights"; // lets the speed test switch the light fixtures off
    g.userData.modelKey = rr.lightModel || "phoenix";
    groups[rid] = g;
    (roomGroups[rid] || fallbackGroup).add(g);
    const url = resolveUrl(g.userData.modelKey);
    if (url) initialLoads.push(addFixtures(rid, url, 1, g.userData.modelKey));
  });
  const ready = Promise.allSettled(initialLoads);

  // Reconcile every room's group against the committed doc — crossfades only
  // the rooms whose model actually changed.
  const applyRoomLightModels = (d) => {
    Object.keys(groups).forEach((rid) => {
      const rm = (d?.rooms || []).find((r) => r.id === rid);
      swap(rid, (rm ? rm.lightModel : d?.lightModel) || "phoenix");
    });
  };

  return { applyRoomLightModels, ready };
}