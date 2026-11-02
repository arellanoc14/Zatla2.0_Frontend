// In-scene EQUIPMENT interaction for the 3D studio (Walkthrough3D).
// Selection outline + tap-to-select + finger-drag move for placed equipment
// objects (door, fan, minisplit, dehumidifier, co2tank, ducting) in the ACTIVE
// room. View-only for benches/lights — this touches equipment meshes only.
//
// All committed changes flow OUT through the provided handlers (onSelectObject,
// onDragObject, activateRoomForObject); this module never mutates doc/state
// directly. It manages: a mesh registry keyed by object id, a room-context map
// so drag math can convert world → room-local, a reusable selection outline,
// and the pointer drag loop (raycast onto the floor plane → room-local X/Y).
import * as THREE from "three";
import { clampPosToRoom, snapToWall } from "@/lib/growroom/room3dGeom";

// Only doors stay pinned to the nearest wall. Every other equipment type (fan,
// HVAC, dehumidifier, co2tank, ducting, controller) moves FREELY around the
// room and is only clamped to stay inside the walls.
const WALL_TYPES = new Set(["door"]);

export function createEquipmentInteraction({ scene, invalidate }) {
  // objId → { mesh, ctx } where ctx = { rid, ctr:{x,z}, rw, rl, ox, oz, size, type }
  const registry = new Map();
  // Reusable selection outline (a BoxHelper-style wire box) parented to the scene.
  let outline = null;
  let fill = null;          // translucent fill cube hugging the selection box
  let outlineTarget = null; // objId currently outlined

  const ensureOutline = () => {
    if (outline) return outline;
    // Bright green selection box drawn on top of everything, with a soft
    // translucent fill so the selected object clearly stands out from the scene.
    outline = new THREE.BoxHelper(new THREE.Object3D(), 0x22c55e);
    outline.material.depthTest = false;
    outline.material.transparent = true;
    outline.material.linewidth = 2;
    outline.visible = false;
    outline.renderOrder = 999;
    scene.add(outline);
    // Translucent fill cube that hugs the selected object's bounding box.
    fill = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.14, depthTest: false, depthWrite: false })
    );
    fill.renderOrder = 998;
    fill.visible = false;
    scene.add(fill);
    return outline;
  };
  // Fit the translucent fill cube to a mesh's world bounding box.
  const fitFill = (mesh) => {
    if (!fill || !mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) { fill.visible = false; return; }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    fill.position.copy(center);
    fill.scale.set(Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01));
    fill.visible = true;
  };

  // Register an active-room equipment mesh for picking + dragging. Tags the mesh
  // (and its descendants) so a raycast hit resolves back to the object id.
  const register = (objId, mesh, ctx) => {
    if (!objId || !mesh) return;
    mesh.userData.equipObjectId = objId;
    mesh.traverse((o) => { o.userData.equipObjectId = objId; });
    registry.set(objId, { mesh, ctx });
    // Keep the outline attached to whatever is currently selected.
    if (outlineTarget === objId) showOutline(objId);
  };

  const unregister = (objId, mesh) => {
    if (!objId) return;
    const entry = registry.get(objId);
    // Only drop if this is the currently-registered mesh (GLB swap re-registers).
    if (!mesh || (entry && entry.mesh === mesh)) registry.delete(objId);
    if (outlineTarget === objId && !registry.has(objId)) hideOutline();
  };

  const showOutline = (objId) => {
    outlineTarget = objId;
    const entry = registry.get(objId);
    const ol = ensureOutline();
    if (!entry) { ol.visible = false; if (fill) fill.visible = false; return; }
    ol.setFromObject(entry.mesh);
    ol.visible = true;
    fitFill(entry.mesh);
    invalidate();
  };
  const hideOutline = () => {
    outlineTarget = null;
    if (outline) outline.visible = false;
    if (fill) fill.visible = false;
    invalidate();
  };
  // Re-fit the outline to the currently-selected mesh (after a live move/rotate).
  const refreshOutline = () => {
    if (!outlineTarget) return;
    const entry = registry.get(outlineTarget);
    if (entry && outline) { outline.setFromObject(entry.mesh); fitFill(entry.mesh); invalidate(); }
  };
  // Pulse the selection fill opacity (call each frame from the render loop). Soft
  // breathing glow so the selected object is obvious. No-op when nothing selected.
  const pulseSelection = () => {
    if (!fill || !fill.visible) return;
    const e = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
    fill.material.opacity = 0.10 + e * 0.14;
  };
  const hasSelection = () => !!(fill && fill.visible);

  // Raycast the currently-aimed ray against all registered equipment meshes.
  // Returns the object id of the nearest hit, or null.
  const pickEquipment = (raycaster) => {
    const meshes = [];
    registry.forEach(({ mesh }) => meshes.push(mesh));
    if (meshes.length === 0) return null;
    const hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.equipObjectId) o = o.parent;
    return o?.userData.equipObjectId || null;
  };

  // Touch-forgiving pick: try the exact ray first, then sample a ring of nearby
  // rays (via the provided re-aim callback) so a finger tap that lands slightly
  // off a small piece of equipment still selects it. `aim(dx, dy)` must re-point
  // the shared raycaster at the tap point offset by (dx, dy) NDC units and return
  // the raycaster. `radius` is the search radius in NDC units.
  const pickEquipmentForgiving = (raycaster, aim, radius = 0) => {
    let hit = pickEquipment(raycaster);
    if (hit || !aim || radius <= 0) return hit;
    // Two rings of 8 samples at half + full radius — enough coverage for a thumb.
    const dirs = [0, 45, 90, 135, 180, 225, 270, 315];
    for (const scale of [0.5, 1]) {
      for (const deg of dirs) {
        const rad = (deg * Math.PI) / 180;
        const r = radius * scale;
        hit = pickEquipment(aim(Math.cos(rad) * r, Math.sin(rad) * r));
        if (hit) return hit;
      }
    }
    return null;
  };

  // Convert a world-space floor hit → room-local top-left pos for the object, then
  // wall-snap (wall types) or free-clamp (others). Returns { x, y } room-local
  // inches, or null. Uses the registered mesh's room context.
  //
  // ROTATION-AWARE: the room's pivot group is rotated on the floor, so a world
  // point must be transformed through the group's inverse matrix (worldToLocal)
  // to land in the room's OWN axes. Its local frame is centred on the room, so we
  // shift by half-dims to get the room's 0,0-origin top-left space. Doing the
  // manual (world − origin) math ignored rotation and inverted the drag on any
  // rotated room — this fixes the object to follow the finger at every angle.
  const worldHitToRoomPos = (objId, worldHit, grab) => {
    const entry = registry.get(objId);
    if (!entry) return null;
    const { ctx } = entry;
    const { rw, rl, size, type, group } = ctx;
    const s = size || { w: 12, h: 12 };
    // Apply the grab offset so the object doesn't jump to the pointer center.
    const wx = worldHit.x + (grab?.dx || 0);
    const wz = worldHit.z + (grab?.dz || 0);
    let localCenterX;
    let localCenterZ;
    if (group) {
      // World → room group local (rotated frame, origin at room center) → room 0,0.
      group.updateMatrixWorld();
      const p = group.worldToLocal(new THREE.Vector3(wx, 0, wz));
      localCenterX = p.x + rw / 2;
      localCenterZ = p.z + rl / 2;
    } else {
      // Legacy axis-aligned fallback (no group available).
      localCenterX = wx - ctx.ox;
      localCenterZ = wz - ctx.oz;
    }
    // Rotation-aware containment: the mesh runs along its LOCAL X and is rotated
    // about Y, so at 90°/270° its room-axis bounding box has w/h SWAPPED. Clamping
    // with the raw footprint kept the object off the side walls but let it pass
    // through the front/back walls (visible on a rotated ducting run). We clamp the
    // object's CENTER using the rotation-aware half-extents, then return the pos in
    // the RAW (unrotated) convention (center − rawSize/2) so the stored value and
    // the rebuild stay consistent with the rest of the pipeline (which uses the raw
    // smartObjectSize everywhere). Wall-snap types are unaffected (bbox == raw).
    const mesh = entry.mesh;
    let bbW = s.w, bbH = s.h;
    if (mesh) {
      const deg = ((Math.round((-mesh.rotation.y * 180) / Math.PI / 90) * 90) % 360 + 360) % 360;
      if (deg === 90 || deg === 270) { bbW = s.h; bbH = s.w; }
    }
    let pos = { x: localCenterX - bbW / 2, y: localCenterZ - bbH / 2 };
    const bbCtx = { roomW: rw, roomL: rl, size: { w: bbW, h: bbH } };
    if (WALL_TYPES.has(type)) {
      const r = snapToWall(pos, bbCtx, type === "door");
      pos = r.pos;
    }
    const clamped = clampPosToRoom(pos, bbCtx);
    // Convert the clamped bbox top-left back to the RAW-convention top-left via the
    // shared center, so the object's true footprint center is preserved.
    const centerX = clamped.x + bbW / 2;
    const centerY = clamped.y + bbH / 2;
    return { x: centerX - s.w / 2, y: centerY - s.h / 2 };
  };

  // The room context for an object (for the pointer-down grab offset calc).
  const getCtx = (objId) => registry.get(objId)?.ctx || null;
  const getMesh = (objId) => registry.get(objId)?.mesh || null;

  // Live-set a registered mesh's Y (height above floor, inches). Used by the
  // height slider so the change is instant (pos.z isn't in docKey → no rebuild).
  const setMeshHeight = (objId, y) => {
    const mesh = getMesh(objId);
    if (mesh && Number.isFinite(y)) { mesh.position.y = y; refreshOutline(); invalidate(); }
  };

  // Live-set a registered mesh's rotation about Y (degrees). Used by the Rotate
  // button for types NOT in docKey (fan/AC/dehum/co2tank) so it's instant.
  // Preserves any baked base rotation by rotating relative to the current value's
  // fractional part is unnecessary — the mesh is rebuilt at 0 base for these types.
  const setMeshRotationDeg = (objId, deg, baseY = 0) => {
    const mesh = getMesh(objId);
    if (mesh) { mesh.rotation.y = baseY - (deg * Math.PI) / 180; refreshOutline(); invalidate(); }
  };

  // Smoothly spin a registered mesh to a target rotation about Y (degrees) over
  // `durMs`, easing in/out. Used so the ducting rotate reads as a turning motion
  // instead of an instant snap. Returns a promise that resolves when the spin
  // finishes (or immediately if the mesh is gone). Tracks the active animation
  // per object so a rapid re-rotate replaces the previous spin cleanly.
  const rotAnims = new Map(); // objId → rafId
  const animateMeshRotationDeg = (objId, deg, { baseY = 0, durMs = 320 } = {}) =>
    new Promise((resolve) => {
      const mesh = getMesh(objId);
      if (!mesh) { resolve(); return; }
      const prev = rotAnims.get(objId);
      if (prev) cancelAnimationFrame(prev);
      const from = mesh.rotation.y;
      const to = baseY - (deg * Math.PI) / 180;
      // Take the shortest angular path so a 270°→0° turn spins a quarter, not 3/4.
      let delta = to - from;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / durMs);
        mesh.rotation.y = from + delta * ease(k);
        refreshOutline();
        invalidate();
        if (k < 1) { rotAnims.set(objId, requestAnimationFrame(step)); }
        else { rotAnims.delete(objId); mesh.rotation.y = to; refreshOutline(); invalidate(); resolve(); }
      };
      rotAnims.set(objId, requestAnimationFrame(step));
    });

  const dispose = () => {
    if (outline) { scene.remove(outline); outline.geometry?.dispose?.(); outline.material?.dispose?.(); outline = null; }
    if (fill) { scene.remove(fill); fill.geometry?.dispose?.(); fill.material?.dispose?.(); fill = null; }
    registry.clear();
    outlineTarget = null;
  };

  return {
    register, unregister,
    showOutline, hideOutline, refreshOutline, pulseSelection, hasSelection,
    pickEquipment, pickEquipmentForgiving, worldHitToRoomPos,
    getCtx, getMesh, setMeshHeight, setMeshRotationDeg, animateMeshRotationDeg,
    isWallType: (type) => WALL_TYPES.has(type),
    dispose,
  };
}