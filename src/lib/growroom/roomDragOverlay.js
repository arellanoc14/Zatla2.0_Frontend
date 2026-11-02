import * as THREE from "three";
import { roomCollides } from "@/lib/growroom/facility";

// ── Blue room alignment guides + overlap red-tint (3D, view-only) ────────────
// Extracted from Walkthrough3D's build(). While a room is dragged: draws thin
// blue floor ribbons wherever the dragged room's left/right/center-X or top/
// bottom/center-Z line up with another room's (within ~1ft), and tints the
// room's selection highlight RED when it overlaps another room (rotation-aware
// via the live footprint; flush edges ≠ overlap — same as 2D). NEVER snaps,
// never writes state — purely a rendered overlay.
const ROOM_GUIDE_THRESH = 12; // inches — ~1ft proximity so guides catch on a hand drag
const ROOM_GUIDE_Y = 1.0;     // slightly above the floor; depthTest:false keeps it on top
const GUIDE_W = 3;            // inches — width of the blue ribbon
const ROOM_RED = 0xef4444;
const HL_GREEN_FILL = 0x86efac;
const HL_GREEN_RING = 0x22c55e;

export function createRoomDragOverlay({ scene, renderRooms, roomGroups, selectHighlights, docRef, invalidate }) {
  const roomGuideMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.95, depthTest: false });
  roomGuideMat.userData._procedural = true; // shared material — skip auto-dispose
  const roomGuideGroup = new THREE.Group();
  roomGuideGroup.visible = false;
  roomGuideGroup.renderOrder = 998;
  scene.add(roomGuideGroup);

  // Live facility rect (world coords) for a room id — uses the LIVE group center
  // when available (so the DRAGGED room uses its current position, not the stale
  // committed offset), and the room's rotation-aware footprint span (swap W/L at
  // 90/270, exactly like the 2D roomFloorRect).
  const liveRoomRect = (rid) => {
    const rr = renderRooms.find((r) => r.__rid === rid);
    if (!rr) return null;
    const w = rr.room?.widthIn || 0;
    const l = rr.room?.lengthIn || 0;
    const deg = ((Math.round((rr.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360;
    const swap = deg === 90 || deg === 270;
    const fw = swap ? l : w;
    const fl = swap ? w : l;
    const g = roomGroups[rid];
    const ccx = g ? g.position.x : 0;
    const ccz = g ? g.position.z : 0;
    return { x: ccx - fw / 2, z: ccz - fl / 2, w: fw, h: fl };
  };

  const clearRoomGuides = () => {
    while (roomGuideGroup.children.length) {
      const ln = roomGuideGroup.children.pop();
      ln.geometry?.dispose?.();
      roomGuideGroup.remove(ln);
    }
    roomGuideGroup.visible = false;
  };

  // Rebuild the guide lines for the dragged room id against every other room.
  const updateRoomGuides = (draggedId) => {
    clearRoomGuides();
    const dr = liveRoomRect(draggedId);
    if (!dr) { invalidate(); return; }
    const dV = { left: dr.x, right: dr.x + dr.w, cx: dr.x + dr.w / 2 };
    const dH = { top: dr.z, bottom: dr.z + dr.h, cz: dr.z + dr.h / 2 };
    const seen = new Set();
    const addLine = (orient, pos, from, to) => {
      const key = `${orient}:${Math.round(pos)}`;
      if (seen.has(key)) return;
      seen.add(key);
      // Thin blue floor ribbon (flat PlaneGeometry) so it's clearly visible.
      const len = Math.abs(to - from);
      const mid = (from + to) / 2;
      const geo = new THREE.PlaneGeometry(orient === "v" ? GUIDE_W : len, orient === "v" ? len : GUIDE_W);
      const m = new THREE.Mesh(geo, roomGuideMat);
      m.rotation.x = -Math.PI / 2; // lay flat on the floor
      if (orient === "v") m.position.set(pos, ROOM_GUIDE_Y, mid);
      else                m.position.set(mid, ROOM_GUIDE_Y, pos);
      m.renderOrder = 999;
      roomGuideGroup.add(m);
    };
    (renderRooms || []).forEach((rr) => {
      if (rr.__rid === draggedId) return;
      const o = liveRoomRect(rr.__rid);
      if (!o) return;
      const oV = { left: o.x, right: o.x + o.w, cx: o.x + o.w / 2 };
      const oH = { top: o.z, bottom: o.z + o.h, cz: o.z + o.h / 2 };
      Object.values(dV).forEach((dv) => {
        Object.values(oV).forEach((ov) => {
          if (Math.abs(dv - ov) < ROOM_GUIDE_THRESH) {
            addLine("v", ov, Math.min(dr.z, o.z), Math.max(dr.z + dr.h, o.z + o.h));
          }
        });
      });
      Object.values(dH).forEach((dv) => {
        Object.values(oH).forEach((ov) => {
          if (Math.abs(dv - ov) < ROOM_GUIDE_THRESH) {
            addLine("h", ov, Math.min(dr.x, o.x), Math.max(dr.x + dr.w, o.x + o.w));
          }
        });
      });
    });
    roomGuideGroup.visible = roomGuideGroup.children.length > 0;
    invalidate();
  };

  // Swap the selection highlight fill/ring color red↔green (cheap, view-only).
  const setRoomDragRed = (roomId, on) => {
    const hl = selectHighlights[roomId];
    if (!hl) return;
    if (on) {
      hl.fillMat.color.setHex(ROOM_RED);
      hl.ringMat.color.setHex(ROOM_RED);
    } else {
      hl.fillMat.color.setHex(HL_GREEN_FILL);
      hl.ringMat.color.setHex(HL_GREEN_RING);
    }
    invalidate();
  };

  // Live overlap test: dragged room's LIVE rect vs the other rooms at their
  // committed offsets (roomCollides excludes the candidate id).
  const isRoomOverlapping = (draggedId) => {
    const dr = liveRoomRect(draggedId);
    if (!dr) return false;
    const rect = { x: dr.x, y: dr.z, w: dr.w, h: dr.h };
    return roomCollides(docRef.current?.rooms || [], draggedId, rect);
  };

  const dispose = () => {
    clearRoomGuides();
    roomGuideMat.dispose();
  };

  return { liveRoomRect, clearRoomGuides, updateRoomGuides, setRoomDragRed, isRoomOverlapping, dispose };
}