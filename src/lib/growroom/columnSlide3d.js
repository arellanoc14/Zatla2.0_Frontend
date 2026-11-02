import * as THREE from "three";

// 3D half of the mobile-aisle column slide (the rules live in mobileAisle.js).
// Eases the meshes of the moving columns from where they stand to where the
// committed layout will put them, then calls onDone; the caller commits the
// doc, and the rebuild that follows (masked by the bench-swap snapshot fade)
// lands on the same picture.
//
// What moves is found by TAG inside one room's pivot group — the room-local
// frame, where plan X is local x and plan Y is local z with nothing to undo:
//   userData.benchId           any node a bench created: its GLB clone or
//                              scaffold, light texture plane, grow-light rig,
//                              canopy fixture / bridge / air unit, perpendicular
//                              UCLs, tap hit box
//   userData.instanceBenchIds  an InstancedMesh shared by several benches (tier
//                              racks): only the moving benches' instances travel
//   userData.aisleOf === rid   the aisle walkway and its stripes (aisleDelta)
//   userData.slideHide         hidden for the slide — dimension labels and PPFD
//                              sheets are measured from the old positions and
//                              the rebuild redraws them
// Creates no geometry, materials or lights; holds references only for the
// slide's duration.
export const SLIDE_MS = 650;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function createColumnSlide({ invalidate } = {}) {
  let anim = null; // the running slide
  let last = null; // the finished slide, kept so a refused commit can revert it
  const scratch = new THREE.Matrix4();

  const apply = (a, k) => {
    a.nodes.forEach((n) => { n.obj.position[a.dir] = n.from + n.by * k; });
    if (!a.instances.length) return;
    const touched = new Set();
    a.instances.forEach(({ mesh, index, base }) => {
      scratch.copy(base);
      scratch.elements[a.dir === "x" ? 12 : 14] += a.delta * k;
      mesh.setMatrixAt(index, scratch);
      touched.add(mesh);
    });
    touched.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  };

  // { group, rid, axis: "x" | "y", delta, movedIds, aisleDelta, durationMs, onDone }
  // Returns false (and changes nothing) when a slide is already running or no
  // tagged mesh of the moving benches exists.
  const start = ({ group, rid, axis, delta, movedIds, aisleDelta = 0, durationMs = SLIDE_MS, onDone }) => {
    if (anim || !group || !delta) return false;
    const moving = new Set(movedIds || []);
    const dir = axis === "y" ? "z" : "x";
    const nodes = [];
    const instances = [];
    const hidden = [];
    const visit = (obj) => {
      const u = obj.userData || {};
      if (u.slideHide) {
        if (obj.visible) { obj.visible = false; hidden.push(obj); }
        return;
      }
      if (u.benchId) {
        // A bench's own subtree never holds another bench — stop either way.
        if (moving.has(u.benchId)) nodes.push({ obj, from: obj.position[dir], by: delta });
        return;
      }
      if (aisleDelta && u.aisleOf && u.aisleOf === rid) {
        nodes.push({ obj, from: obj.position[dir], by: aisleDelta });
        return;
      }
      if (obj.isInstancedMesh && Array.isArray(u.instanceBenchIds)) {
        u.instanceBenchIds.forEach((id, index) => {
          if (!moving.has(id)) return;
          const base = new THREE.Matrix4();
          obj.getMatrixAt(index, base);
          instances.push({ mesh: obj, index, base });
        });
        return;
      }
      obj.children.forEach(visit);
    };
    group.children.forEach(visit);
    if (!nodes.length && !instances.length) {
      hidden.forEach((o) => { o.visible = true; });
      return false;
    }
    last = null;
    anim = { t0: null, durationMs: Math.max(1, durationMs), nodes, instances, hidden, dir, delta, onDone };
    invalidate?.();
    return true;
  };

  // Advance one frame. Returns true while a slide is running (keep rendering).
  const tick = (now) => {
    if (!anim) return false;
    if (anim.t0 === null) anim.t0 = now;
    const t = Math.min(1, (now - anim.t0) / anim.durationMs);
    apply(anim, ease(t));
    if (t < 1) return true;
    // Settled: re-fit culling spheres of the instanced racks that moved.
    new Set(anim.instances.map((i) => i.mesh)).forEach((mesh) => mesh.computeBoundingSphere?.());
    const done = anim.onDone;
    last = anim;
    anim = null;
    done?.();
    return true; // draw the settled frame
  };

  // Put the last finished slide back (commit refused) — positions and labels.
  const revert = () => {
    if (!last) return;
    apply(last, 0);
    last.hidden.forEach((o) => { o.visible = true; });
    last = null;
    invalidate?.();
  };

  // Scene teardown: drop everything without calling onDone.
  const cancel = () => { anim = null; last = null; };

  return { start, tick, revert, cancel, isActive: () => !!anim };
}
