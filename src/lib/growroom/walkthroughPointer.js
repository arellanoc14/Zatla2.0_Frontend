import * as THREE from "three";

// Pointer-interaction system for Walkthrough3D (orbit/top-down).
// Owns tap-to-select, equipment drag (camera locked while an object is selected),
// room drag (Move mode), and the pinch/pointercancel aborts. Extracted verbatim
// from Walkthrough3D.build() to keep that file under the size limit; behaviour is
// unchanged. All scene/camera/handler dependencies are passed in via `deps`.
//
// Returns { registerListeners, removeListeners, cancelActiveDrag } plus the small
// pieces the render loop / capture still needs. The caller wires the returned
// listeners onto the renderer canvas + window.
export function createWalkthroughPointer(deps) {
  const {
    renderer, activeCameraRef, controls, scene,
    roomGroups, roomCenters, roomHitPlanes, renderRooms,
    equip, roomW, roomL,
    draggingRef, selectedRoomIdRef, selectedObjectIdRef, roomMoveModeRef, objectMoveModeRef,
    onMoveRoomRef, onSelectRoomRef, onSelectObjectRef, onDragObjectRef,
    activateRoomForObjectRef,
    // Invisible per-bench tap targets (userData { benchId, roomId }) and the
    // handler a tap on one goes to; it returns true when it took the tap.
    benchHitBoxes = [], onTapBenchRef = null,
    updateRoomGuides, clearRoomGuides, setRoomDragRed, isRoomOverlapping,
    isWalk, invalidate,
  } = deps;

  const activeCamera = () => activeCameraRef();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _floorHit = new THREE.Vector3();

  const setNdc = (clientX, clientY) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  };
  const floorPointAt = (clientX, clientY) => {
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, activeCamera());
    const hit = raycaster.ray.intersectPlane(floorPlane, _floorHit);
    if (!hit) return null;
    const { x, z } = _floorHit;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const bound = Math.max(roomW, roomL) * 4 + 1000;
    if (Math.abs(x) > bound || Math.abs(z) > bound) return null;
    return { x, z };
  };
  const pickRoomAt = (clientX, clientY) => {
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, activeCamera());
    const hits = raycaster.intersectObjects(roomHitPlanes, false);
    return hits.length ? hits[0].object.userData.roomId : null;
  };
  // Nearest bench tap target under the pointer → { benchId, roomId }, or null.
  const pickBenchAt = (clientX, clientY) => {
    if (!benchHitBoxes.length) return null;
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, activeCamera());
    const hits = raycaster.intersectObjects(benchHitBoxes, false);
    const u = hits.length ? hits[0].object.userData : null;
    return u && u.benchId ? { benchId: u.benchId, roomId: u.roomId || null } : null;
  };

  let downX = 0, downY = 0;

  // Room-drag state.
  let roomDragId = null, roomGrab = null, roomLastPos = null, roomHalf = null, roomDragOrigin = null;
  // Equipment-drag state.
  let equipDragId = null, equipGrab = null, equipLastPos = null, equipMoved = false, equipFromEmpty = false;
  // Tap-select candidate (Move mode OFF): the object pressed on pointer-down, so a
  // near-stationary pointer-up can select it without ever starting a drag.
  let tapObjId = null;

  let lastPointerType = "mouse";
  const equipDragThreshold = () => (lastPointerType === "mouse" ? 6 : 12);

  const beginInteraction = (clientX, clientY) => {
    if (isWalk()) return;
    downX = clientX; downY = clientY;
    // Room drag — skipped while an equipment object is selected (then the press
    // only ever moves that object; camera + room locked).
    const selRid = selectedRoomIdRef.current;
    if (!selectedObjectIdRef.current && roomMoveModeRef.current && selRid && onMoveRoomRef.current && roomGroups[selRid]) {
      const roomId = pickRoomAt(clientX, clientY);
      const hit = floorPointAt(clientX, clientY);
      if (roomId === selRid && hit) {
        const g = roomGroups[selRid];
        const rr = renderRooms.find((r) => r.__rid === selRid);
        roomDragId = selRid;
        roomGrab = { dx: g.position.x - hit.x, dz: g.position.z - hit.z };
        roomHalf = { w: (rr?.room?.widthIn || 0) / 2, l: (rr?.room?.lengthIn || 0) / 2 };
        roomLastPos = { x: g.position.x, z: g.position.z };
        roomDragOrigin = { x: g.position.x, z: g.position.z };
        draggingRef.current = true;
        controls.enabled = false;
        return;
      }
    }

    // Equipment pick (touch-forgiving ring sampling).
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, activeCamera());
    const rect = renderer.domElement.getBoundingClientRect();
    const touchRadius = lastPointerType === "mouse"
      ? 0
      : (22 / Math.min(rect.width || 1, rect.height || 1)) * 2;
    const aimAt = (dx, dy) => {
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1 + dx;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1 + dy;
      raycaster.setFromCamera(ndc, activeCamera());
      return raycaster;
    };
    let hitObjId = equip.pickEquipmentForgiving(raycaster, aimAt, touchRadius);
    const selId = selectedObjectIdRef.current;
    // Move mode gate — objects only DRAG when the Move toggle is ON (like rooms).
    // With Move OFF: never begin a drag; just remember which object (if any) was
    // pressed so pointer-up can tap-select it, and let OrbitControls own the gesture.
    if (!objectMoveModeRef?.current) {
      tapObjId = hitObjId;
      return;
    }
    // Move ON: camera is LOCKED — any press drags the SELECTED object, even off-mesh.
    const fromEmpty = !hitObjId && !!selId && !!equip.getMesh(selId);
    if (fromEmpty) hitObjId = selId;
    if (hitObjId) {
      const hit = floorPointAt(clientX, clientY);
      const mesh = equip.getMesh(hitObjId);
      equipDragId = hitObjId;
      equipMoved = false;
      equipFromEmpty = fromEmpty;
      equipLastPos = null;
      equipGrab = (hit && mesh)
        ? { dx: mesh.getWorldPosition(new THREE.Vector3()).x - hit.x, dz: mesh.getWorldPosition(new THREE.Vector3()).z - hit.z }
        : { dx: 0, dz: 0 };
      draggingRef.current = true;
      controls.enabled = false;
    }
  };

  const moveInteraction = (clientX, clientY) => {
    if (equipDragId) {
      if (!equipMoved && Math.hypot(clientX - downX, clientY - downY) < equipDragThreshold()) return;
      const hit = floorPointAt(clientX, clientY);
      if (!hit) return;
      const ctx = equip.getCtx(equipDragId);
      const mesh = equip.getMesh(equipDragId);
      const g = roomGroups[ctx?.rid];
      if (!mesh || !ctx || !g) return;
      // Room-local top-left pos from the finger (grab-offset preserved), then
      // wall-snap (doors) / clamp inside the room walls — the SAME math the drop
      // commits — so the mesh tracks the finger smoothly but can never cross a
      // wall. worldHitToRoomPos already handles the rotation-aware transform.
      const pos = equip.worldHitToRoomPos(equipDragId, hit, equipGrab);
      if (!pos) return;
      const s = ctx.size || { w: 12, h: 12 };
      // Place the mesh at the clamped room-local pos, converting straight into the
      // room group's OWN local frame (centered on the room). The group frame is
      // already rotated/translated, so we only shift the 0,0-origin room pos by the
      // half-dims — no facility-origin (ctx.ox/oz) math, which goes stale after the
      // active room is moved and made the drag feel off for that room specifically.
      mesh.position.x = pos.x + s.w / 2 - ctx.rw / 2;
      mesh.position.z = pos.y + s.h / 2 - ctx.rl / 2;
      equip.refreshOutline();
      equipLastPos = pos;
      equipMoved = true;
      onDragObjectRef.current?.(equipDragId, pos.x, pos.y, { transient: true });
      invalidate();
      return;
    }
    if (roomDragId) {
      const hit = floorPointAt(clientX, clientY);
      if (!hit) return;
      const g = roomGroups[roomDragId];
      if (!g) return;
      const nx = hit.x + roomGrab.dx;
      const nz = hit.z + roomGrab.dz;
      if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
      g.position.x = nx;
      g.position.z = nz;
      roomLastPos = { x: nx, z: nz };
      updateRoomGuides(roomDragId);
      setRoomDragRed(roomDragId, isRoomOverlapping(roomDragId));
      invalidate();
      return;
    }
  };

  const endInteraction = (clientX, clientY) => {
    if (equipDragId) {
      const objId = equipDragId, last = equipLastPos, moved = equipMoved, fromEmpty = equipFromEmpty;
      equipDragId = null; equipGrab = null; equipLastPos = null; equipMoved = false; equipFromEmpty = false;
      controls.enabled = true;
      draggingRef.current = false;
      if (moved && last) {
        onDragObjectRef.current?.(objId, last.x, last.y, { transient: false });
      } else if (fromEmpty) {
        // Empty-space tap while selected → deselect.
        onSelectObjectRef.current?.(null);
        equip.hideOutline();
      } else {
        if (objId !== selectedObjectIdRef.current) {
          activateRoomForObjectRef.current?.(objId);
          onSelectObjectRef.current?.(objId);
        }
        equip.showOutline(objId);
      }
      invalidate();
      return;
    }
    if (roomDragId) {
      const commitId = roomDragId, commitPos = roomLastPos, half = roomHalf;
      const origin = roomDragOrigin;
      const moved = Math.hypot((clientX ?? downX) - downX, (clientY ?? downY) - downY);
      const stillOverlaps = isRoomOverlapping(commitId);
      roomDragId = null; roomGrab = null; roomLastPos = null; roomHalf = null;
      controls.enabled = true;
      draggingRef.current = false;
      clearRoomGuides();
      if (stillOverlaps && origin) {
        const g = roomGroups[commitId];
        if (g) { g.position.x = origin.x; g.position.z = origin.z; }
      } else if (moved > 6 && commitPos && half) {
        onMoveRoomRef.current?.(commitId, { x: commitPos.x - half.w, y: commitPos.z - half.l });
      }
      setRoomDragRed(commitId, false);
      roomDragOrigin = null;
      invalidate();
      return;
    }
    if (isWalk()) { tapObjId = null; return; }
    const moved = Math.hypot((clientX ?? downX) - downX, (clientY ?? downY) - downY);
    // A near-stationary press that landed on an equipment object (Move mode OFF)
    // selects that object — the camera still orbited if the finger moved.
    const tappedObj = tapObjId;
    tapObjId = null;
    if (moved > 6) return;
    if (tappedObj) {
      if (tappedObj !== selectedObjectIdRef.current) {
        activateRoomForObjectRef.current?.(tappedObj);
        onSelectObjectRef.current?.(tappedObj);
      }
      equip.showOutline(tappedObj);
      invalidate();
      return;
    }
    // A bench of the SELECTED room (nothing selected): slide its column into the
    // aisle (mobileAisle.js). A bench in any other room falls through and
    // selects that room, as a tap on its floor always did.
    if (!selectedObjectIdRef.current && onTapBenchRef?.current) {
      const bench = pickBenchAt(clientX ?? downX, clientY ?? downY);
      if (bench && bench.roomId && bench.roomId === selectedRoomIdRef.current && onTapBenchRef.current(bench.benchId, bench.roomId)) {
        invalidate();
        return;
      }
    }
    const roomId = pickRoomAt(clientX ?? downX, clientY ?? downY);
    if (selectedObjectIdRef.current) { onSelectObjectRef.current?.(null); equip.hideOutline(); }
    if (roomId && roomId !== selectedRoomIdRef.current) onSelectRoomRef.current?.(roomId);
  };

  const activePointers = new Set();
  const cancelActiveDrag = () => {
    if (roomDragId) {
      const g = roomGroups[roomDragId];
      if (g && roomDragOrigin) { g.position.x = roomDragOrigin.x; g.position.z = roomDragOrigin.z; }
      setRoomDragRed?.(roomDragId, false);
      clearRoomGuides();
      roomDragId = null; roomGrab = null; roomLastPos = null; roomHalf = null; roomDragOrigin = null;
    }
    if (equipDragId) {
      if (equipMoved && equipLastPos) onDragObjectRef.current?.(equipDragId, equipLastPos.x, equipLastPos.y, { transient: false });
      equipDragId = null; equipGrab = null; equipLastPos = null; equipMoved = false; equipFromEmpty = false;
    }
    tapObjId = null;
    controls.enabled = true;
    draggingRef.current = false;
    invalidate();
  };

  const onDragDown = (e) => {
    lastPointerType = e.pointerType || "mouse";
    activePointers.add(e.pointerId);
    if (activePointers.size > 1) {
      if (roomDragId) cancelActiveDrag();
      return;
    }
    beginInteraction(e.clientX, e.clientY);
    if (roomDragId || equipDragId) {
      e.preventDefault?.();
      e.stopPropagation?.();
      try { renderer.domElement.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    }
  };
  const onDragMove = (e) => {
    if (activePointers.size > 1) return;
    if (!roomDragId && !equipDragId) return;
    moveInteraction(e.clientX, e.clientY);
    e.preventDefault?.();
  };
  const onDragUp = (e) => {
    activePointers.delete(e.pointerId);
    const wasDragging = !!roomDragId || !!equipDragId;
    endInteraction(e.clientX, e.clientY);
    if (wasDragging) { try { renderer.domElement.releasePointerCapture?.(e.pointerId); } catch { /* noop */ } }
  };
  const onDragCancel = (e) => {
    activePointers.delete(e.pointerId);
    cancelActiveDrag();
  };

  const registerListeners = () => {
    renderer.domElement.addEventListener("pointerdown", onDragDown, true);
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", onDragCancel);
  };
  const removeListeners = () => {
    renderer.domElement.removeEventListener("pointerdown", onDragDown, true);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragCancel);
  };

  return { registerListeners, removeListeners, cancelActiveDrag };
}