// GLB swap-in helpers for smart equipment — each replaces a room object's
// procedural placeholder mesh with its uploaded .glb model using the EXACT same
// placement math the inline build path used (extracted verbatim from
// Walkthrough3D). View-only: no data, layout or sync logic here. A failed load
// keeps the placeholder and never crashes the scene.
import * as THREE from "three";
import { loadGLB, fitModelToFootprint, forceOpaqueDoubleSided } from "@/lib/growroom/glbModel";
import { setShadowFlags } from "@/lib/growroom/shadowFlags";
import { positionEquipmentGroup } from "@/lib/growroom/equipment3d";
import { effectiveHeightY, clampHeightY } from "@/lib/growroom/equipmentHeight";
import { isNearWall, HALF_WALL } from "@/lib/growroom/room3dGeom";
import { recolorFanModel } from "@/lib/growroom/fanRecolor";

// Shared tail: shift into the room group's local frame, force opaque materials,
// swap out the placeholder, re-register as draggable (active room only), repaint.
function finishSwap(holder, ctx, recolorFan = false) {
  const { obj, mesh, group, toLocal, ox, oz, trackMat, registerEquipment, unregisterEquipment, invalidate } = ctx;
  const hL = toLocal(holder.position.x + ox, holder.position.z + oz);
  holder.position.x = hL.x;
  holder.position.z = hL.z;
  forceOpaqueDoubleSided(holder, trackMat);
  if (recolorFan) recolorFanModel(holder, trackMat);
  setShadowFlags(holder); // lands after build(); the scene-wide shadow pass never saw it
  group.remove(mesh);
  group.add(holder);
  // Re-register the swapped-in GLB holder for picking in EVERY room (not just the
  // active one) — the placeholder was registered for all rooms, so keep the GLB
  // pickable too. Drag context is stored per-object regardless of active room, so
  // tapping an object in any room selects it (and switches the active room).
  if (obj.id) { unregisterEquipment(obj.id, mesh); registerEquipment(obj.id, holder); }
  invalidate();
}

// GLB load failed → reveal the procedural placeholder as a fallback so the object
// is never invisible forever (it was hidden while awaiting the GLB). Repaints.
function revealPlaceholderOnError(ctx) {
  if (ctx.mesh) ctx.mesh.visible = true;
  ctx.invalidate?.();
}

// Floor-standing equipment (CO₂ tank, dehumidifier): uniform fit to footprint,
// placed at its stored pos; an explicit user height (pos.z) wins over the floor.
export function swapFloorEquipmentGlb(ctx) {
  const { url, obj, size, rc, isDisposed, label } = ctx;
  loadGLB(url).then((sceneObj) => {
    if (isDisposed()) return;
    const holder = fitModelToFootprint(sceneObj, size.w, size.h, { uniform: true });
    positionEquipmentGroup(holder, obj);
    holder.position.y = (typeof obj.pos?.z === "number") ? effectiveHeightY(obj, rc) : 0;
    finishSwap(holder, ctx);
  }).catch((err) => { console.error(`[GLB] ${label} render failed`, err?.message || err); revealPlaceholderOnError(ctx); });
}

// Wall-snappable equipment (fan, AC/mini-split): PROXIMITY wall snap — within
// ~6" of a wall it turns to face into the room and seats FLUSH against the wall
// at its mount height (snapHeight); otherwise it stays free on the floor.
export function swapWallEquipmentGlb(ctx) {
  const { url, obj, size, rc, rw, rl, isDisposed, label, fitW, fitL, fitOpts, snapHeight, recolorFan, alwaysSnap } = ctx;
  loadGLB(url).then((sceneObj) => {
    if (isDisposed()) return;
    const holder = fitModelToFootprint(sceneObj, fitW, fitL, fitOpts);
    positionEquipmentGroup(holder, obj);
    // alwaysSnap (controller — door-like): ALWAYS seat flush on the nearest wall.
    const nearWall = alwaysSnap || isNearWall(holder.position.x, holder.position.z, size, rw, rl);
    if (nearWall) {
      const fcx = holder.position.x, fcz = holder.position.z;
      const dl = { left: fcx, right: rw - fcx, top: fcz, bottom: rl - fcz };
      const near = Object.keys(dl).reduce((a, b) => (dl[a] <= dl[b] ? a : b));
      if (near === "left")        holder.rotation.y = Math.PI / 2;
      else if (near === "right")  holder.rotation.y = -Math.PI / 2;
      else if (near === "top")    holder.rotation.y = 0;
      else if (near === "bottom") holder.rotation.y = Math.PI;
      holder.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(holder);
      if (near === "left")        holder.position.x += (HALF_WALL - bb.min.x);
      else if (near === "right")  holder.position.x += (rw - HALF_WALL - bb.max.x);
      else if (near === "top")    holder.position.z += (HALF_WALL - bb.min.z);
      else if (near === "bottom") holder.position.z += (rl - HALF_WALL - bb.max.z);
    }
    // Always use effectiveHeightY — the SAME value the HeightControl slider uses —
    // so the rendered Y matches the slider thumb exactly (no mismatch). Fans
    // default to near-ceiling, floor types to 0, etc.
    holder.position.y = effectiveHeightY(obj, rc);
    finishSwap(holder, ctx, recolorFan);
  }).catch((err) => { console.error(`[GLB] ${label} render failed`, err?.message || err); revealPlaceholderOnError(ctx); });
}

// Ducting (free-moving, ceiling-height run): rendered at its true spec size,
// both ends kept inside the room; height fixed near the wall top unless the
// user set an explicit height.
export function swapDuctingGlb(ctx) {
  const { url, obj, size, rc, rw, rl, isDisposed } = ctx;
  const dia = obj.spec?.diameterIn || size.h;
  loadGLB(url).then((sceneObj) => {
    if (isDisposed()) return;
    const ductLen = obj.spec?.lengthIn || size.w;
    const holder = fitModelToFootprint(sceneObj, dia, ductLen, { uniform: false, targetH: dia });
    positionEquipmentGroup(holder, obj);
    holder.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(holder);
    if (bb.min.x < HALF_WALL)            holder.position.x += (HALF_WALL - bb.min.x);
    else if (bb.max.x > rw - HALF_WALL)  holder.position.x -= (bb.max.x - (rw - HALF_WALL));
    if (bb.min.z < HALF_WALL)            holder.position.z += (HALF_WALL - bb.min.z);
    else if (bb.max.z > rl - HALF_WALL)  holder.position.z -= (bb.max.z - (rl - HALF_WALL));
    // Use effectiveHeightY for BOTH the stored-height and default cases so the
    // initial render sits at the SAME Y the height slider commits (it falls back to
    // ducting's natural near-ceiling default when pos.z is absent). Previously the
    // default used a center-anchored mountY while the slider used a bottom-anchored
    // clamp, so a fresh duct rendered ~dia/2 higher (half above the wall) until it
    // was moved and re-committed — this makes both paths identical.
    holder.position.y = effectiveHeightY(obj, rc);
    finishSwap(holder, ctx);
  }).catch((err) => { console.error("[GLB] ducting render failed", err?.message || err); revealPlaceholderOnError(ctx); });
}