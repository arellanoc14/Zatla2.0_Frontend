import { useState, useRef, useCallback, useEffect } from "react";
import { benchRect, rectsOverlap } from "@/lib/growroom/clearances";
import { autoLayoutByRoom, autoLayoutLights } from "@/lib/growroom/autolayout";
import { scalePolygon, clipBenchesToPolygon, nearestPolygonWall } from "@/lib/growroom/polygon";
import {
  commitActiveRoom, roomFloorRect, roomCollides, snapToGrid, computeFacility,
  resolveRoomOverlap, facilityBox, roomOverlapDepth, activeRoomDims,
} from "@/lib/growroom/facility";

// How deep a room-drop overlap (inches) still counts as a "tiny" near-miss that
// auto-nudges flush. Beyond this it's a major overlap → snap back + feedback.
const TINY_OVERLAP_IN = 12; // 1 ft
import { ROOM_HEADER_H, ROOM_HEADER_W } from "@/lib/growroom/facilityDraw";

// Bench build settings for a re-layout, taken from the benches ALREADY in the
// room, falling back to the panel's local state only when the room has none.
//
// benchSettings mirrors StudioEditor's local useState, which initialises to
// 4ft / rolling / 1 tier and is never hydrated from the loaded room. Reading it
// directly rebuilt a 5ft triple-tier room as 4ft single-tier on every 2D
// resize — and when 4ft columns no longer fit the new dimensions,
// autoLayoutByRoom returns an empty array and every bench silently vanished.
function benchBuildFrom(doc, bs = {}) {
  const cur = (doc?.benches || [])[0] || {};
  return {
    widthFt: cur.widthIn ? Math.round(cur.widthIn / 12) : (bs.benchWidth || 4),
    type: cur.type || bs.benchType || "rolling",
    tiers: Math.max(1, Math.round(cur.tiers || bs.tiers || 1)),
  };
}
import { makeSmartObject, smartObjectSize, smartObjectByType, doorRenderedRect, doorSwingRect, clampObjectToRoom } from "@/lib/growroom/smartObjects";

const GRID = 12;          // 1ft snap grid
const HANDLE_PX = 8;      // handle hit-target in screen pixels
const ROTATE_OFFSET = 24; // distance above bench for rotation handle (screen px)
const ROOM_HANDLE_PX = 16; // room-resize handle hit-target (screen px)
const SNAP_THRESH = 12;   // inches — bench auto-align snap distance

// Handles pan, zoom, selection, room move, room resize, multi-select, and alignment guides.
// `roomMoveMode2D` gates room dragging: when false a room can only be SELECTED (never
// dragged); when true the selected room drags. `onRoomMoveComplete` fires after a
// successful room drop so the parent can auto-disable Move mode.
export function usePlanInteraction({ doc, updatePresent, containerRef, benchSettings, roomMoveMode2D = false, onRoomMoveComplete, onRoomDropResult }) {
  const DEFAULT_VIEWPORT = { pixelsPerInch: 0.55, panX: 40, panY: 40 };
  const [viewportState, setViewportRaw] = useState(DEFAULT_VIEWPORT);
  const viewport = viewportState || DEFAULT_VIEWPORT;
  const setViewport = useCallback((next) => {
    setViewportRaw((prev) => {
      const base = prev || DEFAULT_VIEWPORT;
      const v = typeof next === "function" ? next(base) : next;
      return v || base;
    });
  }, []);
  const [selected, setSelected] = useState(null);         // {kind, id} — primary
  const [multiSelected, setMultiSelected] = useState([]);  // [{kind, id}, ...]
  const drag = useRef(null);
  const pan = useRef(null);
  const pinch = useRef(null);
  const longPress = useRef(null); // touch-hold timer for room move
  // Guards against a single mobile tap committing two stacked objects: on touch,
  // the pointer/touch sequence can fire the place gesture twice for one tap. We
  // remember the last committed tap-place (time + point) and skip a near-instant
  // repeat at essentially the same spot. Only the single-tap path uses this.
  const lastTapPlaceRef = useRef({ t: 0, x: null, y: null });
  const [pressArming, setPressArming] = useState(false); // true while long-press timer is counting
  const [guides, setGuides] = useState([]);                // alignment guide lines
  const [roomGuides, setRoomGuides] = useState([]);         // FACILITY-space blue guides while dragging a room
  const [hoveredHandle, setHoveredHandle] = useState(null); // which handle cursor is over "resize-nw" etc.
  const [roomDragging, setRoomDragging] = useState(false);  // true while a room is being dragged (for the move-handle visual)
  // Live ref of the 2D Move-mode flag so the stable pointer callbacks always read
  // the current value without being re-created (which would drop an in-flight drag).
  const roomMoveMode2DRef = useRef(roomMoveMode2D);
  useEffect(() => { roomMoveMode2DRef.current = roomMoveMode2D; }, [roomMoveMode2D]);

  // ── Persistent Placement Mode + drop-and-continue line drag ──
  // `placement` holds the smart-equipment type being placed (doors excluded —
  // they keep their single-add path). While active: tap = one place, press-drag =
  // an evenly-spaced row of ghosts committed on release. Mode stays active after.
  const [placement, setPlacement] = useState(null);
  const placementRef = useRef(null);
  const [lineGhosts, setLineGhostsState] = useState([]); // ghost previews for PlanCanvas
  const lineGhostsRef = useRef([]);
  const setLineGhosts = useCallback((g) => { lineGhostsRef.current = g; setLineGhostsState(g); }, []);
  const startPlacement = useCallback((type) => {
    placementRef.current = type;
    setPlacement(type);
    setSelected(null);
    setMultiSelected([]);
    setGuides([]);
  }, []);
  const endPlacement = useCallback(() => {
    placementRef.current = null;
    setPlacement(null);
    setLineGhosts([]);
  }, [setLineGhosts]);
  // Placement mode never sticks across rooms — reset when the active room changes.
  useEffect(() => { endPlacement(); }, [doc.activeRoomId]); // eslint-disable-line
  // Esc cancels an in-flight line drag (zero objects created); a second Esc (or
  // Esc with no drag) exits placement mode.
  useEffect(() => {
    if (!placement) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (drag.current?.kind === "line-place") { drag.current = null; setLineGhosts([]); }
      else endPlacement();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement, endPlacement, setLineGhosts]);

  const fitToScreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    // Frame the whole facility bounding box (which may start at a negative origin
    // when rooms are placed up/left) so every room is visible.
    const box = facilityBox(doc);
    const w = Math.max(box.widthIn, doc.room.widthIn);
    const h = Math.max(box.lengthIn, doc.room.lengthIn);
    const margin = 50;
    const ppi = Math.min((cw - margin * 2) / w, (ch - margin * 2) / h);
    // Pan so the box's top-left (box.x/box.y, possibly negative) lands at the
    // centered margin — accounts for content that extends left/up of the origin.
    setViewport({
      pixelsPerInch: ppi,
      panX: (cw - w * ppi) / 2 - box.x * ppi,
      panY: (ch - h * ppi) / 2 - box.y * ppi,
    });
  }, [doc, containerRef]);

  // Start centered: refit whenever the canvas box changes size (the page layout
  // settles after mount) until the user pans/zooms the plan themselves.
  const fitRef = useRef(fitToScreen);
  fitRef.current = fitToScreen;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let userMoved = false;
    const stop = () => { userMoved = true; };
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop, { passive: true });
    fitRef.current();
    const ro = new ResizeObserver(() => { if (!userMoved) fitRef.current(); });
    ro.observe(el);
    return () => { ro.disconnect(); el.removeEventListener("pointerdown", stop); el.removeEventListener("wheel", stop); };
  }, []); // eslint-disable-line

  // Screen → FACILITY coords (origin = facility floor 0,0).
  const screenToFacility = useCallback(
    (sx, sy) => ({ x: (sx - viewport.panX) / viewport.pixelsPerInch, y: (sy - viewport.panY) / viewport.pixelsPerInch }),
    [viewport]
  );

  // The active room's offset on the facility floor.
  const activeOffset = useCallback(() => {
    const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
    const active = rooms.find((r) => r.id === doc.activeRoomId);
    return active?.offset || { x: 0, y: 0 };
  }, [doc.rooms, doc.activeRoomId]);

  // Screen → active-room-LOCAL coords (subtract the active room's offset), so all
  // existing bench/room interaction math below is unchanged.
  // CRITICAL: the canvas draws the active room's interior rotated about the room
  // center by doc.rotationDeg. So after de-offsetting we must apply the INVERSE
  // rotation about the room center — otherwise hit-tests on a rotated room compare
  // against unrotated positions and nothing can be selected or moved.
  const screenToWorld = useCallback(
    (sx, sy) => {
      const f = screenToFacility(sx, sy);
      const off = activeOffset();
      let lx = f.x - (off.x || 0);
      let ly = f.y - (off.y || 0);
      const deg = doc.rotationDeg || 0;
      if (deg) {
        const cx = (doc.room?.widthIn || 0) / 2;
        const cy = (doc.room?.lengthIn || 0) / 2;
        const rad = (-deg * Math.PI) / 180; // inverse of the canvas rotation
        const dx = lx - cx, dy = ly - cy;
        lx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        ly = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
      }
      return { x: lx, y: ly };
    },
    [screenToFacility, activeOffset, doc.rotationDeg, doc.room]
  );

  const snap = (v) => Math.round(v / GRID) * GRID;

  // Switch the active room: commit the current flat fields back into doc.rooms[],
  // then load the newly-selected room's geometry into the flat fields and point
  // activeRoomId at it. Each room's internal layout is preserved exactly.
  const setActiveRoom = useCallback(
    (roomId) => {
      setSelected(null);
      setMultiSelected([]);
      setGuides([]);
      updatePresent((d) => {
        if (d.activeRoomId === roomId) return d;
        const rooms = commitActiveRoom(d);
        const target = rooms.find((r) => r.id === roomId);
        if (!target) return d;
        return {
          ...d,
          rooms,
          activeRoomId: roomId,
          room: target.room,
          settings: target.settings,
          benches: target.benches || [],
          lights: target.lights || [],
          doors: target.doors || [],
          objects: target.objects || [],
          // Load the newly-active room's stored rotation into the live field so
          // 2D + 3D render it at its own angle.
          rotationDeg: target.rotationDeg || 0,
        };
      });
    },
    [updatePresent]
  );

  // Hit-test the ACTIVE room's move-handle header (the green move button at its
  // top-left). Returns true when the facility-space point lands on the button.
  //
  // CRITICAL: the button is DRAWN at the room's UNROTATED offset corner
  // (screen o = f2s(offset.x, offset.y)), NOT at the rotated footprint's bounding
  // box. So the hit-test MUST use the same unrotated offset corner — using
  // roomFloorRect (the rotated footprint) put the target in the wrong place for
  // 90°/270° rooms, so clicking the button missed it and the click fell through
  // to the room underneath. Anchoring to offset makes the button hittable at every
  // angle and stops the under-room from being selected.
  const hitTestActiveHeader = useCallback(
    (fx, fy) => {
      const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
      const active = rooms.find((r) => r.id === doc.activeRoomId);
      if (!active) return false;
      const off = active.offset || { x: 0, y: 0 };
      const gapIn = 4 / viewport.pixelsPerInch;
      const headerH = ROOM_HEADER_H / viewport.pixelsPerInch; // px → inches
      const headerW = ROOM_HEADER_W / viewport.pixelsPerInch;
      // Button sits just OUTSIDE the room's drawn (unrotated) top-left corner.
      const bx = (off.x || 0) - headerW - gapIn;
      const by = (off.y || 0) - headerH - gapIn;
      return fx >= bx && fx <= bx + headerW && fy >= by && fy <= by + headerH;
    },
    [doc.rooms, doc.activeRoomId, viewport.pixelsPerInch]
  );

  // Hit-test whether a facility-space point lands inside the ACTIVE room's
  // footprint (its rotated floor rect). Used so a click in the MIDDLE of the
  // already-active room keeps it selected instead of falling through to the
  // empty-canvas tap, which would wrongly deselect it. Corners already stayed
  // selected because they hit the resize handles — this makes the interior behave
  // the same way.
  const hitTestActiveRoomBody = useCallback(
    (fx, fy) => {
      const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
      const active = rooms.find((r) => r.id === doc.activeRoomId);
      if (!active) return false;
      const rect = roomFloorRect(active);
      return fx >= rect.x && fx <= rect.x + rect.w && fy >= rect.y && fy <= rect.y + rect.h;
    },
    [doc.rooms, doc.activeRoomId]
  );

  // Hit-test the facility floor for a room rectangle (returns its id, or null).
  // Active room is excluded so its interior interactions take priority.
  const hitTestRoom = useCallback(
    (fx, fy) => {
      const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
      for (const r of [...rooms].reverse()) {
        if (r.id === doc.activeRoomId) continue;
        const rect = roomFloorRect(r);
        if (fx >= rect.x && fx <= rect.x + rect.w && fy >= rect.y && fy <= rect.y + rect.h)
          return r.id;
      }
      return null;
    },
    [doc.rooms, doc.activeRoomId]
  );

  const hitTest = useCallback(
    (wx, wy) => {
      // Smart objects sit on top of everything (often small icons), so test first.
      // Pad the hit-box so thin/small symbols (especially the door) get a generous,
      // finger-friendly ≥52px touch target — selection never needs pixel-perfect taps.
      const TOUCH_PX = 52;
      const padIn = (TOUCH_PX / viewport.pixelsPerInch) / 2;
      for (const o of [...(doc.objects || [])].reverse()) {
        // Other objects use their raw footprint with a lighter pad.
        const pad = Math.min(padIn, 6 / viewport.pixelsPerInch);
        if (o.type === "door") {
          // Hit-test the door's FULL swing bounds (sill + leaf + arc) — this box
          // already matches the drawn symbol, so use only a SMALL pad. The full
          // 52px touch pad made the grab area balloon far past the visible door,
          // so taps outside the symbol wrongly selected it. Small pad = the door
          // is only selectable on top of / within its actual symbol.
          const dpad = Math.min(6 / viewport.pixelsPerInch, 4 / viewport.pixelsPerInch + 0);
          const r = doorSwingRect(o, activeRoomDims(doc));
          if (wx >= r.x - dpad && wx <= r.x + r.w + dpad && wy >= r.y - dpad && wy <= r.y + r.h + dpad)
            return { kind: "object", id: o.id };
          continue;
        }
        // Rotation-aware hit-test: transform the tap into the object's LOCAL,
        // un-rotated frame about its center, then do the padded box test against
        // the un-rotated w×h. Works for 90/180/270 AND free angles.
        const s = smartObjectSize(o);
        const cx = o.pos.x + s.w / 2, cy = o.pos.y + s.h / 2;
        const rad = -((o.rotationDeg || 0) * Math.PI) / 180; // un-rotate
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const dx = wx - cx, dy = wy - cy;
        const lx = cx + (dx * cos - dy * sin);
        const ly = cy + (dx * sin + dy * cos);
        if (lx >= cx - s.w / 2 - pad && lx <= cx + s.w / 2 + pad && ly >= cy - s.h / 2 - pad && ly <= cy + s.h / 2 + pad)
          return { kind: "object", id: o.id };
      }
      // Equipment, lights, benches (top-most first, so reverse)
      for (const e of [...(doc.equipment || [])].reverse()) {
        if (wx >= e.pos.x && wx <= e.pos.x + e.sizeIn.w && wy >= e.pos.y && wy <= e.pos.y + e.sizeIn.h)
          return { kind: "equipment", id: e.id };
      }
      for (const l of [...(doc.lights || [])].reverse()) {
        if (wx >= l.pos.x && wx <= l.pos.x + l.footprintIn.w && wy >= l.pos.y && wy <= l.pos.y + l.footprintIn.h)
          return { kind: "light", id: l.id };
      }
      // Benches are display-only — driven entirely by auto-layout. They are
      // intentionally NOT hit-tested, so tapping a bench never selects it.
      return null;
    },
    [doc, viewport.pixelsPerInch]
  );

  // Detect rotation handle under the cursor for a selected bench.
  const detectHandle = useCallback(
    (wx, wy, bench) => {
      if (!bench) return null;
      const r = benchRect(bench);
      const hs = HANDLE_PX / viewport.pixelsPerInch;
      const cx = r.x + r.w / 2;

      // Rotation handle above center
      if (Math.abs(wx - cx) < hs * 1.5 && Math.abs(wy - (r.y - ROTATE_OFFSET / viewport.pixelsPerInch)) < hs * 1.5)
        return "rotate";

      return null;
    },
    [viewport.pixelsPerInch]
  );

  // Detect room resize handles — all four corners + all four edges. Corners are
  // tested first (they sit at the rect's corners where the edge zones also reach),
  // so grabbing a corner resizes in BOTH axes.
  //
  // Detection is done in FACILITY (screen-aligned) space against the room's
  // ROTATED footprint (roomFloorRect), and the returned handle name describes the
  // SCREEN quadrant the user grabbed (n/s/e/w/corners as they appear on screen).
  // This is what makes the resize feel natural at every rotation: the handle and
  // the resize math below both work in the same on-screen frame, so the corner you
  // grab always tracks your finger and the diagonally-opposite screen corner stays
  // pinned — no reversal after a 90°/180°/270° turn.
  const detectRoomHandle = useCallback(
    (fx, fy) => {
      const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
      const active = rooms.find((r) => r.id === doc.activeRoomId);
      if (!active) return null;
      const rect = roomFloorRect(active); // rotated footprint, facility coords
      const hs = ROOM_HANDLE_PX / viewport.pixelsPerInch;
      const nearL = Math.abs(fx - rect.x) < hs;
      const nearR = Math.abs(fx - (rect.x + rect.w)) < hs;
      const nearT = Math.abs(fy - rect.y) < hs;
      const nearB = Math.abs(fy - (rect.y + rect.h)) < hs;
      // Only register when the pointer is within the handle band of the footprint.
      const inX = fx >= rect.x - hs && fx <= rect.x + rect.w + hs;
      const inY = fy >= rect.y - hs && fy <= rect.y + rect.h + hs;
      if (!inX || !inY) return null;
      // Corners (both axes) — priority over edges.
      if (nearL && nearT) return "room-nw";
      if (nearR && nearT) return "room-ne";
      if (nearL && nearB) return "room-sw";
      if (nearR && nearB) return "room-se";
      // Edges (single axis), excluding the corner zones.
      if (nearR && fy > rect.y + hs && fy < rect.y + rect.h - hs) return "room-e";
      if (nearL && fy > rect.y + hs && fy < rect.y + rect.h - hs) return "room-w";
      if (nearB && fx > rect.x + hs && fx < rect.x + rect.w - hs) return "room-s";
      if (nearT && fx > rect.x + hs && fx < rect.x + rect.w - hs) return "room-n";
      return null;
    },
    [doc.rooms, doc.activeRoomId, viewport.pixelsPerInch]
  );

  // Compute alignment guides between a dragged rect and other benches + room midlines.
  const computeGuides = useCallback(
    (draggedBench, allBenches, roomW, roomL) => {
      if (!draggedBench) return [];
      const r = benchRect(draggedBench);
      const threshold = 6 / viewport.pixelsPerInch;
      const results = [];

      const dEdges = {
        left: r.x, right: r.x + r.w, top: r.y, bottom: r.y + r.h,
        cx: r.x + r.w / 2, cy: r.y + r.h / 2,
      };

      // Room midlines
      const roomMidX = roomW / 2;
      const roomMidY = roomL / 2;
      [
        { v: roomMidX, label: "room-center-x" },
        { v: roomMidY, label: "room-center-y" },
      ].forEach((mid) => {
        ["left", "right", "cx"].forEach((k) => {
          if (Math.abs(dEdges[k] - mid.v) < threshold)
            results.push({ orient: "v", pos: mid.v, from: 0, to: roomL, label: mid.label });
        });
        ["top", "bottom", "cy"].forEach((k) => {
          if (Math.abs(dEdges[k] - mid.v) < threshold)
            results.push({ orient: "h", pos: mid.v, from: 0, to: roomW, label: mid.label });
        });
      });

      // Other benches
      allBenches.forEach((b) => {
        if (b.id === draggedBench.id) return;
        const br = benchRect(b);
        const bEdges = {
          left: br.x, right: br.x + br.w, top: br.y, bottom: br.y + br.h,
          cx: br.x + br.w / 2, cy: br.y + br.h / 2,
        };
        Object.entries(dEdges).forEach(([dk, dv]) => {
          Object.entries(bEdges).forEach(([bk, bv]) => {
            if (Math.abs(dv - bv) < threshold) {
              const orient = ["left", "right", "cx"].includes(dk) ? "v" : "h";
              const spanMin = Math.min(dv, bv);
              const spanMax = Math.max(dv, bv);
              results.push({
                orient,
                pos: dv,
                from: orient === "v" ? Math.min(r.y, br.y) : Math.min(r.x, br.x),
                to: orient === "v" ? Math.max(r.y + r.h, br.y + br.h) : Math.max(r.x + r.w, br.x + br.w),
                label: "edge-align",
              });
            }
          });
        });
      });

      return results;
    },
    [viewport.pixelsPerInch]
  );

  // Compute FACILITY-space alignment guides between the dragged room's footprint
  // and every OTHER room's footprint. Returns blue guide lines wherever an edge or
  // center of the dragged room lines up (within a screen-pixel threshold) with an
  // edge or center of a neighbor. GUIDE-ONLY — never snaps or changes the offset.
  const computeRoomGuides = useCallback(
    (draggedId, rooms) => {
      const dragged = rooms.find((r) => r.id === draggedId);
      if (!dragged) return [];
      const dr = roomFloorRect(dragged);
      const threshold = 6 / viewport.pixelsPerInch; // ~6px proximity regardless of zoom
      const dV = { left: dr.x, right: dr.x + dr.w, cx: dr.x + dr.w / 2 };
      const dH = { top: dr.y, bottom: dr.y + dr.h, cy: dr.y + dr.h / 2 };
      const results = [];

      rooms.forEach((r) => {
        if (r.id === draggedId) return;
        const o = roomFloorRect(r);
        const oV = { left: o.x, right: o.x + o.w, cx: o.x + o.w / 2 };
        const oH = { top: o.y, bottom: o.y + o.h, cy: o.y + o.h / 2 };
        // Vertical guides (matching X positions) — span both rooms' Y extents.
        Object.values(dV).forEach((dv) => {
          Object.values(oV).forEach((ov) => {
            if (Math.abs(dv - ov) < threshold) {
              results.push({
                orient: "v", pos: ov,
                from: Math.min(dr.y, o.y),
                to: Math.max(dr.y + dr.h, o.y + o.h),
              });
            }
          });
        });
        // Horizontal guides (matching Y positions) — span both rooms' X extents.
        Object.values(dH).forEach((dv) => {
          Object.values(oH).forEach((ov) => {
            if (Math.abs(dv - ov) < threshold) {
              results.push({
                orient: "h", pos: ov,
                from: Math.min(dr.x, o.x),
                to: Math.max(dr.x + dr.w, o.x + o.w),
              });
            }
          });
        });
      });

      // De-dupe near-identical lines so we don't stack many overlapping guides.
      const seen = new Set();
      return results.filter((g) => {
        const key = `${g.orient}:${Math.round(g.pos)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    [viewport.pixelsPerInch]
  );

  // ── Event handlers ──
  const getPos = (e) => {
    const el = containerRef.current;
    if (!el) return { sx: 0, sy: 0 };
    const rect = el.getBoundingClientRect();
    // On touchend `e.touches` is empty — fall back to changedTouches so we still
    // have a coordinate rather than reading `undefined.clientX` and crashing.
    const t = e.touches ? (e.touches[0] || e.changedTouches?.[0] || {}) : e;
    return { sx: (t.clientX || 0) - rect.left, sy: (t.clientY || 0) - rect.top };
  };

  // Two-finger pinch midpoint + distance
  const getPinchData = (e) => {
    const el = containerRef.current;
    if (!el || !e.touches || e.touches.length < 2) return { midX: 0, midY: 0, dist: 1 };
    const rect = el.getBoundingClientRect();
    const t0 = e.touches[0], t1 = e.touches[1];
    return {
      midX: ((t0.clientX + t1.clientX) / 2) - rect.left,
      midY: ((t0.clientY + t1.clientY) / 2) - rect.top,
      dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
    };
  };

  const getObj = (doc, hit) => {
    if (!hit) return null;
    if (hit.kind === "bench") return doc.benches.find((b) => b.id === hit.id);
    if (hit.kind === "light") return doc.lights.find((l) => l.id === hit.id);
    if (hit.kind === "equipment") return doc.equipment.find((e) => e.id === hit.id);
    if (hit.kind === "object") return (doc.objects || []).find((o) => o.id === hit.id);
    return null;
  };

  const onPointerDown = useCallback(
    (e) => {
      // Touch devices fire a synthetic mousedown/mouseup/click AFTER the touch
      // sequence ends unless the touch event is prevented — without this, a single
      // tap ran onPointerDown/onPointerUp twice (once from touch, once from the
      // synthetic mouse event), placing two overlapping objects per tap on mobile.
      if (e.touches && e.cancelable) e.preventDefault();

      // Two-finger pinch — capture start state and bail early.
      if (e.touches && e.touches.length === 2) {
        const pd = getPinchData(e);
        pinch.current = {
          startPpi: viewport.pixelsPerInch,
          startDist: pd.dist,
          anchorWx: (pd.midX - viewport.panX) / viewport.pixelsPerInch,
          anchorWy: (pd.midY - viewport.panY) / viewport.pixelsPerInch,
        };
        drag.current = null;
        pan.current = null;
        setLineGhosts([]); // a second finger during a line drag aborts placement
        setSelected(null);
        setMultiSelected([]);
        setGuides([]);
        return;
      }

      const { sx, sy } = getPos(e);
      const w = screenToWorld(sx, sy);

      // Middle button or space → pan
      if (e.button === 1 || e.spaceKey) {
        pan.current = { sx, sy, panX: viewport.panX, panY: viewport.panY };
        return;
      }

      // Placement Mode: a single-finger press starts a place gesture — tap drops
      // one, drag lays a row of ghosts. Suspends select/room-move/resize entirely
      // (two-finger pinch already bailed above, so it still zooms and never places).
      if (placementRef.current && doc.activeRoomId) {
        setSelected(null);
        setMultiSelected([]);
        setGuides([]);
        drag.current = {
          kind: "line-place",
          type: placementRef.current,
          startW: w,
          startScreen: { x: sx, y: sy },
          moved: false,
        };
        return;
      }

      const fHdr = screenToFacility(sx, sy);

      // 2D Move mode ON: the ENTIRE selected room footprint is the drag target —
      // press/drag anywhere inside the active room to move the whole room (benches
      // and all). No corner/header hunting. Still commits only to rooms[].offset.
      if (roomMoveMode2DRef.current && hitTestActiveRoomBody(fHdr.x, fHdr.y)) {
        const active = doc.rooms.find((r) => r.id === doc.activeRoomId);
        const off = active?.offset || { x: 0, y: 0 };
        setSelected(null);
        setMultiSelected([]);
        setGuides([]);
        drag.current = {
          kind: "room-move",
          roomId: doc.activeRoomId,
          startF: fHdr,
          startScreen: { x: sx, y: sy },
          baseOffset: { x: off.x || 0, y: off.y || 0 },
          moved: false,
        };
        setRoomDragging(true);
        return;
      }

      // Smart objects (doors / equipment) take priority over the room-resize edge
      // handles: wall-mounted objects sit right on the room border, where the
      // resize handles also live — without this, the edge handle swallowed the
      // click and the object could never be selected. Test the object hit FIRST
      // and only fall through to resize when nothing was hit.
      const earlyObjHit = hitTest(w.x, w.y);

      // Check room resize handles (skipped if an object is under the cursor).
      // Detection is in FACILITY space (rotation-aware), so pass fHdr, not w.
      // While 2D Move mode is ON, resize handles are disabled so whole-room drag
      // (handled above) takes priority — no corner/edge resize competing with it.
      const roomHandle = roomMoveMode2DRef.current
        ? null
        : earlyObjHit
          ? null
          : detectRoomHandle(fHdr.x, fHdr.y);
      if (roomHandle) {
        setSelected(null);
        setMultiSelected([]);
        const activeRoom = doc.rooms?.find((r) => r.id === doc.activeRoomId);
        const baseOffset = activeRoom?.offset || { x: 0, y: 0 };
        drag.current = {
          kind: "room-resize",
          startW: w,
          handle: roomHandle,
          baseRoom: { ...doc.room },
          baseOffset: { x: baseOffset.x || 0, y: baseOffset.y || 0 },
          // Merged / custom-drawn rooms carry an outline. Snapshot it so each
          // resize frame rescales the ORIGINAL shape (never a rescaled copy).
          basePolygon: Array.isArray(activeRoom?.polygon) && activeRoom.polygon.length >= 3
            ? activeRoom.polygon.map((p) => ({ x: p.x, y: p.y }))
            : null,
          // Snapshot the room's rotated screen footprint so the resize can pin the
          // diagonally-opposite SCREEN corner and grow the grabbed corner toward
          // the pointer — consistent at every rotation.
          baseRect: roomFloorRect(activeRoom),
          rotation: ((Math.round((doc.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360,
          // Snapshot the original objects so they rescale from their starting
          // layout each frame (rescaling the already-rescaled set would compound).
          baseObjects: (doc.objects || []).map((o) => ({ ...o, pos: { ...o.pos } })),
        };
        setGuides([]);
        return;
      }

      // Before bench hit-testing, check whether an INACTIVE room rectangle was
      // clicked on the facility floor. If so, begin a room interaction: a click
      // without drag selects it (sets activeRoomId); a drag repositions it.
      const f = screenToFacility(sx, sy);
      const roomHit = hitTestRoom(f.x, f.y);
      if (roomHit) {
        // Always SELECT an inactive room first — never drag it directly, even if
        // Move mode was ON. The active-room change resets Move mode OFF in
        // StudioEditor, so the user re-taps Move to grab the newly-selected room.
        setActiveRoom(roomHit);
        return;
      }

      const hit = earlyObjHit || hitTest(w.x, w.y);
      if (hit) {
        const obj = getObj(doc, hit);
        // Stale/mismatched hit (e.g. id no longer in the array) — clear any
        // lingering selection rather than leaving a bench stuck orange.
        if (!obj) { setSelected(null); setMultiSelected([]); setGuides([]); return; }

        // Shift-click → toggle multi-select
        if (e.shiftKey) {
          setMultiSelected((prev) => {
            const exists = prev.find((s) => s.kind === hit.kind && s.id === hit.id);
            if (exists) return prev.filter((s) => !(s.kind === hit.kind && s.id === hit.id));
            return [...prev, hit];
          });
          return;
        }

        // Check if we hit the rotation handle on the currently selected bench
        if (hit.kind === "bench" && selected?.kind === "bench" && selected.id === hit.id) {
          const handle = detectHandle(w.x, w.y, obj);
          if (handle === "rotate") {
            setSelected(hit);
            const r = benchRect(obj);
            drag.current = {
              kind: "rotate",
              hit,
              handle: "rotate",
              startW: w,
              baseRect: { ...r },
              base: { ...obj },
            };
            setGuides([]);
            return;
          }
        }

        // Normal selection + move
        setSelected(hit);
        setMultiSelected([]);
        // For a door, grab from its RENDERED (wall-pinned) position so dragging
        // continues from where the door actually is, not its stale spawn/center.
        let base = obj.pos;
        if (hit.kind === "object" && obj.type === "door") {
          const rr = doorRenderedRect(obj, activeRoomDims(doc));
          base = { x: rr.x, y: rr.y };
        }
        drag.current = { kind: "move", hit, startW: w, base: { ...base } };
        setGuides([]);
      } else if (hitTestActiveRoomBody(f.x, f.y)) {
        // Click inside the MIDDLE of the already-active room (not on a bench,
        // object, or resize handle). Keep the room selected — start a pan that is
        // NOT tagged emptyTap, so pointer-up never deselects the active room. This
        // makes the interior behave like the corners (which stay selected via the
        // resize handles) instead of dropping selection.
        setSelected(null);
        setMultiSelected([]);
        setGuides([]);
        pan.current = { sx, sy, panX: viewport.panX, panY: viewport.panY };
      } else {
        // Click on truly empty floor — clear selection, start pan. Tag the pan so
        // pointer-up can guarantee deselection even if a stale selection lingers.
        // The emptyTap flag also clears the ACTIVE ROOM on pointer-up so every room
        // renders as unselected when the user clicks outside all rooms.
        setSelected(null);
        setMultiSelected([]);
        setGuides([]);
        pan.current = { sx, sy, panX: viewport.panX, panY: viewport.panY, emptyTap: true };
      }
    },
    [screenToWorld, screenToFacility, hitTestActiveHeader, hitTestRoom, hitTestActiveRoomBody, hitTest, detectHandle, detectRoomHandle, viewport, doc, selected, setActiveRoom]
  );

  const onPointerMove = useCallback(
    (e) => {
      // Two-finger pinch zoom
      if (pinch.current && e.touches && e.touches.length >= 2) {
        // Stop the browser's native pinch-zoom from fighting our canvas zoom and
        // throwing off coordinate math.
        if (e.cancelable) e.preventDefault();
        const pd = getPinchData(e);
        const ratio = pd.dist / pinch.current.startDist;
        const newPpi = Math.max(0.02, Math.min(8, pinch.current.startPpi * ratio));
        // Zoom around the two-finger midpoint
        const panX = pd.midX - pinch.current.anchorWx * newPpi;
        const panY = pd.midY - pinch.current.anchorWy * newPpi;
        setViewport({ pixelsPerInch: newPpi, panX, panY });
        return;
      }

      const { sx, sy } = getPos(e);

      // Update hovered handle for cursor styling
      if (!drag.current && !pan.current) {
        const w = screenToWorld(sx, sy);
        // Room handles take priority — detection is in facility space now.
        const fh = screenToFacility(sx, sy);
        const rh = detectRoomHandle(fh.x, fh.y);
        if (rh) { setHoveredHandle(rh); }
        else if (selected?.kind === "bench") {
          const obj = getObj(doc, selected);
          setHoveredHandle(obj ? detectHandle(w.x, w.y, obj) : null);
        } else {
          setHoveredHandle(null);
        }
      }

      // Pan
      if (pan.current) {
        if (e.touches && e.cancelable) e.preventDefault();
        const p = pan.current;
        // Flag a real pan drag (vs a stationary tap) so an empty-canvas TAP can
        // deselect the active room while an empty-canvas DRAG (panning) doesn't.
        if (Math.abs(sx - p.sx) > 3 || Math.abs(sy - p.sy) > 3) p.moved = true;
        setViewport((v) => ({ ...v, panX: p.panX + (sx - p.sx), panY: p.panY + (sy - p.sy) }));
        return;
      }

      if (!drag.current) return;
      // Active object drag on touch — block native scroll so the bench tracks the finger.
      if (e.touches && e.cancelable) e.preventDefault();
      const w = screenToWorld(sx, sy);
      const d = drag.current;

      if (d.kind === "room-move") {
        const f = screenToFacility(sx, sy);
        const dx = f.x - d.startF.x;
        const dy = f.y - d.startF.y;
        // Tap-vs-drag is measured in SCREEN PIXELS (not inches), so it behaves the
        // same at every zoom level. In inches a tiny finger jitter looked huge when
        // zoomed out, which cancelled taps and made rooms feel impossible to select.
        const sdx = Math.abs(sx - (d.startScreen?.x ?? sx));
        const sdy = Math.abs(sy - (d.startScreen?.y ?? sy));
        // Touch-hold not yet armed: if the finger travels well past a tap before the
        // long-press fires, treat it as a tap — SELECT the room and cancel the
        // pending grab so the room doesn't move.
        if (d.pending) {
          if (sdx > 12 || sdy > 12) {
            if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
            setPressArming(false);
            setActiveRoom(d.roomId);
            drag.current = null;
          }
          return;
        }
        // Mark as a real drag once the pointer moves past a small screen-pixel
        // threshold, so a plain click still registers as a select on pointer-up.
        if (sdx > 4 || sdy > 4) d.moved = true;
        // Allow any-direction placement (including negative offsets) — the
        // facility floor auto-grows to contain rooms in every direction.
        let nx = snapToGrid(d.baseOffset.x + dx);
        let ny = snapToGrid(d.baseOffset.y + dy);
        // Light "sticky" alignment: when an edge/center of the dragged room comes
        // within the same threshold that shows a guide, nudge the offset so it lines
        // up exactly with that neighbor. Subtle pull — assists alignment without
        // fighting free movement (a small extra drag breaks past it).
        const snapped = snapRoomOffset(doc, d.roomId, nx, ny, 6 / viewport.pixelsPerInch);
        nx = snapped.x; ny = snapped.y;
        updatePresent((doc_) => {
          const rooms = Array.isArray(doc_.rooms) ? doc_.rooms : [];
          const room = rooms.find((r) => r.id === d.roomId);
          if (!room) return doc_;
          // Use the rotated footprint span so collision respects 90°/270° rooms.
          const fr = roomFloorRect({ ...room, offset: { x: nx, y: ny } });
          const candidate = { x: nx, y: ny, w: fr.w, h: fr.h };
          // Remember the last collision-free offset so pointer-up can snap back to
          // it if the drop ends up grossly overlapping a neighbor.
          if (!roomCollides(rooms, d.roomId, candidate)) {
            d.lastValid = { x: nx, y: ny };
          }
          const nextRooms = rooms.map((r) => (r.id === d.roomId ? { ...r, offset: { x: nx, y: ny } } : r));
          // Blue room-to-room alignment guides (guide-only, no snapping).
          setRoomGuides(computeRoomGuides(d.roomId, nextRooms));
          // Follow the finger freely (even into an overlap) — pointer-up will
          // auto-nudge small overlaps flush or snap back from gross ones.
          return { ...doc_, rooms: nextRooms };
        }, { transient: true });
      } else if (d.kind === "room-resize") {
        const base = d.baseRoom;
        // Resize entirely in FACILITY (screen-aligned) space so the grabbed corner
        // always follows the pointer and the diagonally-opposite SCREEN corner
        // stays pinned — identical feel at 0°/90°/180°/270°. We move the grabbed
        // screen edge(s) to the pointer, keep the opposite edge anchored, then map
        // the resulting screen footprint back to the room's LOCAL width/length
        // (swapping at 90°/270°) and re-center the offset.
        const rect = d.baseRect; // rotated screen footprint at drag start
        const swap = d.rotation === 90 || d.rotation === 270;
        const minDim = 48; // minimum 4ft room
        const f = screenToFacility(sx, sy);
        const h = d.handle;

        // Start from the snapshot footprint, then move the grabbed edges.
        let left = rect.x;
        let right = rect.x + rect.w;
        let top = rect.y;
        let bottom = rect.y + rect.h;

        if (h === "room-e" || h === "room-ne" || h === "room-se") {
          right = Math.max(left + minDim, snap(f.x));
        }
        if (h === "room-w" || h === "room-nw" || h === "room-sw") {
          left = Math.min(right - minDim, snap(f.x));
        }
        if (h === "room-s" || h === "room-sw" || h === "room-se") {
          bottom = Math.max(top + minDim, snap(f.y));
        }
        if (h === "room-n" || h === "room-nw" || h === "room-ne") {
          top = Math.min(bottom - minDim, snap(f.y));
        }

        // New SCREEN footprint span + its center on the facility floor.
        const screenW = right - left;
        const screenH = bottom - top;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;

        // Map screen span back to local room dims: at 90°/270° the screen width is
        // the room's LENGTH and the screen height is the room's WIDTH.
        const newW = Math.max(minDim, swap ? screenH : screenW);
        const newL = Math.max(minDim, swap ? screenW : screenH);

        if (newW === base.widthIn && newL === base.lengthIn) return;

        // roomFloorRect centers the rotated footprint on (offset + localDims/2),
        // so to keep the footprint centered at (cx,cy) the offset is the center
        // minus half the UNROTATED local dims.
        const newRoom = { ...base, widthIn: newW, lengthIn: newL };
        const newOffset = { x: snap(cx - newW / 2), y: snap(cy - newL / 2) };
        const bs = benchSettings || {};
        const bb = benchBuildFrom(doc, bs);
        // An odd-shaped room keeps its outline: the polygon scales with the new
        // bounding box and benches landing in a notch are dropped, so growing a
        // merged room never fills the cutout.
        const nextPolygon = scalePolygon(d.basePolygon, base.widthIn, base.lengthIn, newW, newL);
        const laid = autoLayoutByRoom(newRoom, doc.settings, bb.widthFt, bb.type, bb.tiers).benches;
        const benches = nextPolygon ? clipBenchesToPolygon(laid, nextPolygon) : laid;
        const lights = bs.lightsOn ? autoLayoutLights(benches, bs.lightWidth || 4) : [];

        // Doors + equipment scale with the room so they keep their relative spot
        // (and doors stay pinned to their wall) instead of being stranded. Always
        // rescale from the ORIGINAL snapshot against the original room size so the
        // scaling never compounds across frames.
        const objects = rescaleObjects(
          d.baseObjects,
          base,
          nextPolygon ? { ...newRoom, polygon: nextPolygon } : newRoom
        );

        updatePresent((doc_) => {
          const rooms = Array.isArray(doc_.rooms) ? doc_.rooms : [];
          const nextRooms = rooms.map((r) => (r.id === doc_.activeRoomId
            ? { ...r, offset: newOffset, room: newRoom, benches, lights, objects, ...(nextPolygon ? { polygon: nextPolygon } : {}) }
            : r));
          setRoomGuides(computeRoomGuides(doc_.activeRoomId, nextRooms));
          return {
            ...doc_,
            room: newRoom,
            benches,
            lights,
            objects,
            // Write the new dims into the active room's slot in the SAME update so
            // rooms[activeId] and the flat fields never disagree mid-resize. This
            // prevents a stale dims read from smearing onto a neighbor on commit.
            rooms: nextRooms,
          };
        }, { transient: true });
      } else if (d.kind === "move") {
        const dx = w.x - d.startW.x;
        const dy = w.y - d.startW.y;
        let nx = snap(d.base.x + dx);
        let ny = snap(d.base.y + dy);
        // Doors snap flush against the nearest room wall while dragging. All other
        // equipment objects are clamped so their full footprint stays inside the
        // room walls — they can never be dragged out past or overlapping a wall.
        if (d.hit.kind === "object") {
          const o = (doc.objects || []).find((ob) => ob.id === d.hit.id);
          if (o?.type === "door") {
            const snapped = snapDoorToWall({ x: nx, y: ny }, smartObjectSize(o), activeRoomDims(doc));
            nx = snapped.x; ny = snapped.y;
          } else if (o) {
            const clamped = clampObjectToRoom({ ...o, pos: { x: nx, y: ny } }, activeRoomDims(doc));
            nx = clamped.x; ny = clamped.y;
          }
        }
        updatePresent((doc_) => {
          const key = d.hit.kind === "bench" ? "benches" : d.hit.kind === "light" ? "lights" : d.hit.kind === "object" ? "objects" : "equipment";
          const moved = { ...doc_, [key]: (doc_[key] || []).map((o) => (o.id === d.hit.id ? { ...o, pos: { x: nx, y: ny } } : o)) };
          // Compute guides while dragging
          const changedBench = moved.benches.find((b) => b.id === d.hit.id);
          if (d.hit.kind === "bench" && changedBench) {
            setGuides(computeGuides(changedBench, moved.benches, doc_.room.widthIn, doc_.room.lengthIn));
          }
          return moved;
        }, { transient: true });
      } else if (d.kind === "line-place") {
        // Tap-vs-drag threshold in SCREEN pixels so it feels the same at any zoom.
        const sdx = Math.abs(sx - d.startScreen.x), sdy = Math.abs(sy - d.startScreen.y);
        if (!d.moved && (sdx > 6 || sdy > 6)) d.moved = true;
        if (!d.moved) return;
        setLineGhosts(computeLineGhosts(d.type, d.startW, w, activeRoomDims(doc)));
      } else if (d.kind === "rotate") {
        const r = d.baseRect;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const angle = Math.atan2(w.y - cy, w.x - cx) * (180 / Math.PI);
        const snapped = Math.round(angle / 15) * 15; // snap to 15° increments
        updatePresent((doc_) => ({
          ...doc_,
          benches: doc_.benches.map((b) =>
            b.id === d.hit.id ? { ...b, rotationDeg: snapped } : b
          ),
        }), { transient: true });
      }
    },
    [screenToWorld, screenToFacility, snap, updatePresent, computeGuides, computeRoomGuides, detectHandle, detectRoomHandle, doc, selected, viewport, benchSettings, setActiveRoom]
  );

  const onPointerUp = useCallback(() => {
    // End pinch if active
    if (pinch.current) {
      pinch.current = null;
      drag.current = null;
      pan.current = null;
      setGuides([]);
      setLineGhosts([]);
      return;
    }

    // Capture drag data into locals before dispatching — React 18 batches
    // useReducer updates in event handlers, so the reducer callback runs AFTER
    // we null out drag.current, causing "Cannot read properties of null".
    // Clear any pending long-press timer on release.
    if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
    setPressArming(false);

    const dragData = drag.current;
    if (dragData) {
      if (dragData.kind === "room-move") {
        if (dragData.pending || !dragData.moved) {
          // A click without movement → select that room as the active room.
          setActiveRoom(dragData.roomId);
        } else {
          // Commit the room EXACTLY where it was dropped — no auto-nudge, no
          // snap-back, no collision adjustment of any kind. The transient drag
          // frames already hold the final offset in state; this committed no-op
          // update records it as one undo step, and the auto-save persists it as-is.
          updatePresent((d) => ({ ...d }));
          onRoomDropResult?.("ok");
          // Successful room drop → tell the parent to auto-disable Move mode.
          onRoomMoveComplete?.();
        }
      } else if (dragData.kind === "move" && dragData.hit?.kind === "bench") {
        const hitId = dragData.hit.id;
        updatePresent((d) => {
          const b = d.benches.find((bb) => bb.id === hitId);
          if (!b) return d;
          const aligned = snapBenchToPeers(b, d.benches);
          return { ...d, benches: d.benches.map((bb) => bb.id === b.id ? aligned : bb) };
        });
      } else if (dragData.kind === "line-place") {
        const type = dragData.type;
        if (!dragData.moved) {
          // Tap = single place at the press point (existing create + clamp path).
          // Debounce a duplicate tap: on mobile a single tap can fire this commit
          // twice at the same point. Skip a repeat within ~400ms and ~2in of the
          // last committed tap-place; a genuine later/elsewhere tap still places.
          const now = Date.now();
          const prev = lastTapPlaceRef.current;
          const samePoint =
            prev.x != null &&
            Math.abs(dragData.startW.x - prev.x) < 2 &&
            Math.abs(dragData.startW.y - prev.y) < 2;
          if (now - prev.t < 400 && samePoint) {
            setLineGhosts([]);
            drag.current = null;
            pan.current = null;
            setGuides([]);
            setRoomGuides([]);
            setRoomDragging(false);
            return;
          }
          lastTapPlaceRef.current = { t: now, x: dragData.startW.x, y: dragData.startW.y };
          const obj = makeSmartObject(type, { x: 0, y: 0 });
          if (obj) {
            updatePresent((d) => {
              const s = smartObjectSize(obj);
              const raw = { x: snap(dragData.startW.x - s.w / 2), y: snap(dragData.startW.y - s.h / 2) };
              const pos = clampObjectToRoom({ ...obj, pos: raw }, activeRoomDims(d));
              return { ...d, objects: [...(d.objects || []), { ...obj, pos }] };
            });
          }
        } else {
          // Line place: commit one INDEPENDENT object per VALID ghost, atomically
          // (one update = one undo step). Invalid ghosts are skipped. Placement
          // mode stays active afterwards.
          const valid = (lineGhostsRef.current || []).filter((g) => g.valid);
          if (valid.length > 0) {
            updatePresent((d) => {
              const placed = valid.map((g) => ({
                ...makeSmartObject(type, { x: g.x, y: g.y }),
                rotationDeg: g.rotationDeg,
              }));
              return { ...d, objects: [...(d.objects || []), ...placed] };
            });
          }
        }
        setLineGhosts([]);
      } else if (dragData.kind !== "room-resize") {
        updatePresent((d) => ({ ...d }));
      }
      // room-resize was committed transiently during the drag. On release, if the
      // resized room now OVERLAPS any other room, snap it back to its ORIGINAL size
      // AND position (the drag-start snapshot) — same rule as room-move drop.
      if (dragData.kind === "room-resize") {
        updatePresent((d) => {
          const rooms = Array.isArray(d.rooms) ? d.rooms : [];
          const bs = benchSettings || {};
          const activeId = d.activeRoomId;

          // Does the active room (at its current resized size/offset) overlap a neighbor?
          const active = rooms.find((r) => r.id === activeId);
          const fr = active ? roomFloorRect(active) : null;
          const overlaps = !!fr && roomCollides(rooms, activeId, { x: fr.x, y: fr.y, w: fr.w, h: fr.h });

          if (overlaps) {
            // Revert to the snapshot taken at drag start: original room dims, offset,
            // and objects; re-layout benches/lights from the original size.
            const baseRoom = dragData.baseRoom;
            const baseOffset = dragData.baseOffset;
            const baseObjects = (dragData.baseObjects || []).map((o) => ({ ...o, pos: { ...o.pos } }));
            const basePolygon = dragData.basePolygon;
            const relaid = autoLayoutByRoom(baseRoom, d.settings, benchBuildFrom(d, bs).widthFt, benchBuildFrom(d, bs).type, benchBuildFrom(d, bs).tiers).benches;
            const benches = basePolygon ? clipBenchesToPolygon(relaid, basePolygon) : relaid;
            const lights = bs.lightsOn ? autoLayoutLights(benches, bs.lightWidth || 4) : [];
            return {
              ...d,
              room: baseRoom,
              benches,
              lights,
              objects: baseObjects,
              rooms: rooms.map((r) => (r.id === activeId
                ? { ...r, offset: baseOffset, room: baseRoom, benches, lights, objects: baseObjects, ...(basePolygon ? { polygon: basePolygon } : {}) }
                : r)),
            };
          }

          // No overlap → keep the new size; just refresh bench layout for the new
          // dims, clipped to the (already-rescaled) outline of an odd-shaped room.
          const keptPoly = active?.polygon;
          const finalLaid = autoLayoutByRoom(d.room, d.settings, benchBuildFrom(d, bs).widthFt, benchBuildFrom(d, bs).type, benchBuildFrom(d, bs).tiers).benches;
          const benches = Array.isArray(keptPoly) && keptPoly.length >= 3
            ? clipBenchesToPolygon(finalLaid, keptPoly)
            : finalLaid;
          const lights = bs.lightsOn ? autoLayoutLights(benches, bs.lightWidth || 4) : [];
          // Explicitly mirror the flat fields into rooms[activeId] so the save
          // always serializes the resized dimensions — not just what
          // syncActiveRoom happens to mirror in the reducer.
          return {
            ...d,
            benches,
            lights,
            rooms: rooms.map((r) => (r.id === activeId
              ? { ...r, room: d.room, benches, lights, objects: d.objects }
              : r)),
          };
        });
      }
    }
    // Empty-canvas TAP (pressed on empty space and didn't pan): clear the
    // selection AND deselect the active room, so every room renders as unselected
    // when the user clicks outside all rooms. Commit the active room's working
    // fields back into rooms[] first so no in-progress edits are lost, then null
    // activeRoomId. A panning DRAG (pan.moved) leaves the active room untouched.
    if (pan.current?.emptyTap && !pan.current.moved) {
      setSelected(null);
      setMultiSelected([]);
      setGuides([]);
      updatePresent((d) => {
        if (!d.activeRoomId) return d;
        return { ...d, rooms: commitActiveRoom(d), activeRoomId: null };
      });
    } else if (pan.current?.emptyTap) {
      // Panning over empty space — just guarantee selection is cleared.
      setSelected(null);
      setMultiSelected([]);
    }

    drag.current = null;
    pan.current = null;
    setGuides([]);
    setRoomGuides([]);
    setRoomDragging(false);
  }, [updatePresent, benchSettings, setActiveRoom, setSelected, setMultiSelected, setGuides, onRoomMoveComplete, onRoomDropResult]);

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      const { sx, sy } = getPos(e);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setViewport((v) => {
        const newPpi = Math.max(0.02, Math.min(8, v.pixelsPerInch * factor));
        const wx = (sx - v.panX) / v.pixelsPerInch;
        const wy = (sy - v.panY) / v.pixelsPerInch;
        return { pixelsPerInch: newPpi, panX: sx - wx * newPpi, panY: sy - wy * newPpi };
      });
    },
    [containerRef]
  );

  const zoomBy = useCallback(
    (factor) => {
      const el = containerRef.current;
      const cw = el ? el.clientWidth / 2 : 400;
      const ch = el ? el.clientHeight / 2 : 300;
      setViewport((v) => {
        const newPpi = Math.max(0.02, Math.min(8, v.pixelsPerInch * factor));
        const wx = (cw - v.panX) / v.pixelsPerInch;
        const wy = (ch - v.panY) / v.pixelsPerInch;
        return { pixelsPerInch: newPpi, panX: cw - wx * newPpi, panY: ch - wy * newPpi };
      });
    },
    [containerRef]
  );

  // Nudge selected benches by arrow keys
  const nudgeSelected = useCallback(
    (dx, dy) => {
      const targets = multiSelected.length > 0
        ? multiSelected
        : selected ? [selected] : [];
      if (!targets.length) return;
      updatePresent((d) => {
        const benchIds = new Set(targets.filter((s) => s.kind === "bench").map((s) => s.id));
        return {
          ...d,
          benches: d.benches.map((b) =>
            benchIds.has(b.id)
              ? { ...b, pos: { x: snap(b.pos.x + dx), y: snap(b.pos.y + dy) } }
              : b
          ),
        };
      });
    },
    [multiSelected, selected, updatePresent]
  );

  // Tap-to-place a smart object into the CURRENTLY SELECTED room — ALWAYS. The
  // target is doc.activeRoomId's flat working fields (doc.room / doc.objects),
  // never whatever room the Add Equipment button happens to sit over. Position and
  // write both read the SAME fresh state `d` inside the updater, so the object is
  // centered in, and appended to, the active room with no stale-room mismatch.
  const placeObject = useCallback(
    (type) => {
      const obj = makeSmartObject(type, { x: 0, y: 0 });
      if (!obj) return;
      const id = obj.id;
      updatePresent((d) => {
        const s = smartObjectSize(obj);
        // Stagger consecutive adds of the same type so they cascade instead of
        // landing on the EXACT same center point (which stacks them perfectly —
        // the user sees "one" object but rotating/clamping reveals the hidden
        // pile). Offset by 12" per existing object of that type, wrapping every 6
        // steps so it stays centered-ish and tidy. clampObjectToRoom then keeps
        // the footprint inside the walls. No two objects ever spawn identically.
        const n = (d.objects || []).filter((o) => o.type === type).length;
        const STEP = 12;
        const step = (n % 6) + 1;
        const cx = snap((d.room.widthIn / 2) - s.w / 2 + step * STEP);
        const cy = snap((d.room.lengthIn / 2) - s.h / 2 + step * STEP);
        const pos = clampObjectToRoom({ ...obj, pos: { x: cx, y: cy } }, activeRoomDims(d));
        const placed = { ...obj, pos };
        return { ...d, objects: [...(d.objects || []), placed] };
      });
      setSelected({ kind: "object", id });
      setMultiSelected([]);
      return id;
    },
    [updatePresent]
  );

  // Clearance violation check — returns benches that PHYSICALLY overlap each other.
  const getClearanceViolations = useCallback(() => {
    const benches = doc.benches || [];
    const violations = [];
    // Flag only benches that REALLY overlap. The 3rd arg of rectsOverlap inflates
    // the test rects, so a small NEGATIVE value shrinks them — requiring ~1in of
    // actual penetration before it counts. Benches sitting flush/snug in a dense,
    // valid auto-layout (or flanking the center aisle) are NOT flagged. The gap was
    // previously derived from the aisle width (18–24"), which wrongly lit up tight
    // but correct layouts in red — that threshold no longer applies here.
    const OVERLAP_TOL = -1; // inches of real penetration required for a violation
    for (let i = 0; i < benches.length; i++) {
      for (let j = i + 1; j < benches.length; j++) {
        if (rectsOverlap(benchRect(benches[i]), benchRect(benches[j]), OVERLAP_TOL)) {
          violations.push(benches[i].id, benches[j].id);
        }
      }
    }
    return [...new Set(violations)];
  }, [doc]);

  return {
    viewport, setViewport,
    selected, setSelected,
    multiSelected, setMultiSelected,
    guides,             // alignment guides for PlanCanvas
    roomGuides,         // FACILITY-space blue room-to-room alignment guides
    hoveredHandle,      // which handle is hovered
    roomDragging,       // true while a room is being dragged (move-handle visual)
    onPointerDown, onPointerMove, onPointerUp, onWheel,
    fitToScreen, zoomBy, screenToWorld,
    nudgeSelected,
    getClearanceViolations,
    setActiveRoom,      // switch which room the controls operate on
    placeObject,        // tap-to-place a smart object into the active room
    placement,          // active Placement-Mode equipment type (or null)
    startPlacement, endPlacement,
    lineGhosts,         // live line-place ghost previews for PlanCanvas
  };
}

// ── Room-resize responsiveness: scale every door + equipment object so it keeps
//     its RELATIVE place as the room grows/shrinks. Each object's footprint-center
//     is rescaled by the room's width/length ratio; doors then re-snap flush to
//     their nearest wall, and all other equipment is re-clamped fully inside the
//     new room walls so nothing ends up stranded or poking through. Object sizes
//     are unchanged — only their positions move. ──
export function rescaleObjects(objects, oldRoom, newRoom) {
  const ow = oldRoom?.widthIn || 1;
  const ol = oldRoom?.lengthIn || 1;
  const nw = newRoom?.widthIn || ow;
  const nl = newRoom?.lengthIn || ol;
  const sx = nw / ow;
  const sy = nl / ol;
  return (objects || []).map((o) => {
    const size = smartObjectSize(o);
    // Rescale by the object's CENTER so it tracks its relative position, then
    // convert back to a top-left footprint position.
    const cx = (o.pos.x + size.w / 2) * sx;
    const cy = (o.pos.y + size.h / 2) * sy;
    let nx = cx - size.w / 2;
    let ny = cy - size.h / 2;
    if (o.type === "door") {
      const snapped = snapDoorToWall({ x: nx, y: ny }, size, newRoom);
      nx = snapped.x; ny = snapped.y;
    } else {
      const clamped = clampObjectToRoom({ ...o, pos: { x: nx, y: ny } }, newRoom);
      nx = clamped.x; ny = clamped.y;
    }
    return { ...o, pos: { x: nx, y: ny } };
  });
}

// ── Sticky room alignment: given a candidate offset (nx,ny) for the dragged
//     room, pull X and/or Y so a room edge or center lines up exactly with a
//     neighbor's edge/center — but only when already within `tol` inches (the
//     same proximity that shows a blue guide). Returns the adjusted offset. The
//     snap is per-axis and tiny, so dragging a bit more slides right past it. ──
function snapRoomOffset(doc, roomId, nx, ny, tol) {
  const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
  const self = rooms.find((r) => r.id === roomId);
  if (!self) return { x: nx, y: ny };
  // Footprint span of the dragged room at the candidate offset.
  const fr = roomFloorRect({ ...self, offset: { x: nx, y: ny } });
  const others = rooms.filter((r) => r.id !== roomId).map((r) => roomFloorRect(r));
  if (others.length === 0) return { x: nx, y: ny };

  // Candidate lines on the dragged footprint vs each neighbor, per axis.
  const dX = [fr.x, fr.x + fr.w, fr.x + fr.w / 2];
  const dY = [fr.y, fr.y + fr.h, fr.y + fr.h / 2];

  let bestX = null, bestXd = tol;
  let bestY = null, bestYd = tol;
  others.forEach((o) => {
    const oX = [o.x, o.x + o.w, o.x + o.w / 2];
    const oY = [o.y, o.y + o.h, o.y + o.h / 2];
    dX.forEach((dv, di) => oX.forEach((ov) => {
      const diff = Math.abs(dv - ov);
      if (diff < bestXd) { bestXd = diff; bestX = nx + (ov - dv); }
    }));
    dY.forEach((dv, di) => oY.forEach((ov) => {
      const diff = Math.abs(dv - ov);
      if (diff < bestYd) { bestYd = diff; bestY = ny + (ov - dv); }
    }));
  });

  return { x: bestX != null ? bestX : nx, y: bestY != null ? bestY : ny };
}

// ── Door wall-snap: free drag everywhere; snap flush to a wall ONLY when the
//     door's nearest edge comes within DOOR_SNAP_IN of that wall. Otherwise the
//     door follows the finger freely (no forced wall attachment). ──
const DOOR_SNAP_IN = 18; // ~1.5 ft proximity before it snaps to the wall
function snapDoorToWall(pos, size, room) {
  const W = room?.widthIn || 0, L = room?.lengthIn || 0;
  // Odd-shaped (merged / drawn) room: snap to the nearest REAL polygon wall.
  const poly = room?.polygon;
  if (Array.isArray(poly) && poly.length >= 3) {
    const near = nearestPolygonWall(poly, pos.x + size.w / 2, pos.y + size.h / 2);
    if (!near) return { x: pos.x, y: pos.y };
    if (near.dist > DOOR_SNAP_IN + Math.max(size.w, size.h) / 2) return { x: pos.x, y: pos.y };
    if (near.side === "top") return { x: pos.x, y: near.coord };
    if (near.side === "bottom") return { x: pos.x, y: near.coord - size.h };
    if (near.side === "left") return { x: near.coord, y: pos.y };
    return { x: near.coord - size.w, y: pos.y };
  }
  // Gap from each of the door's edges to the matching wall.
  const gaps = {
    top: pos.y,
    bottom: L - (pos.y + size.h),
    left: pos.x,
    right: W - (pos.x + size.w),
  };
  // Nearest wall by edge gap.
  const nearest = Object.keys(gaps).reduce((a, b) => (gaps[a] <= gaps[b] ? a : b));
  // Only snap when close enough — otherwise leave the position untouched (free drag).
  if (gaps[nearest] > DOOR_SNAP_IN) return { x: pos.x, y: pos.y };
  let x = pos.x, y = pos.y;
  if (nearest === "top") y = 0;
  else if (nearest === "bottom") y = L - size.h;
  else if (nearest === "left") x = 0;
  else if (nearest === "right") x = W - size.w;
  return { x, y };
}

// ── Bench auto-align: snap a bench's x to the nearest peer column and
//     y to the nearest peer module boundary when dropped close enough ──
function snapBenchToPeers(bench, allBenches) {
  const peers = allBenches.filter((b) => b.id !== bench.id);
  if (!peers.length) return bench;

  const r = benchRect(bench);
  let bestX = bench.pos.x;
  let bestY = bench.pos.y;

  // Snap X to nearest peer column (pos.x) within threshold
  let minDx = SNAP_THRESH + 1;
  peers.forEach((p) => {
    const d = Math.abs(bench.pos.x - p.pos.x);
    if (d < minDx) { minDx = d; bestX = p.pos.x; }
  });

  // Snap Y to nearest peer top-edge or bottom-edge within threshold
  let minDy = SNAP_THRESH + 1;
  peers.forEach((p) => {
    const pr = benchRect(p);
    // Align top edge to peer's top edge
    const dTop = Math.abs(r.y - pr.y);
    if (dTop < minDy) { minDy = dTop; bestY = pr.y; }
    // Align top edge to peer's bottom edge (stack below)
    const dBot = Math.abs(r.y - (pr.y + pr.h));
    if (dBot < minDy) { minDy = dBot; bestY = pr.y + pr.h; }
  });

  // Also look for y-alignment to peer bottom edge matching bench bottom edge
  let minDy2 = SNAP_THRESH + 1;
  peers.forEach((p) => {
    const pr = benchRect(p);
    const d = Math.abs((r.y + r.h) - (pr.y + pr.h));
    if (d < minDy2) { minDy2 = d; bestY = pr.y + pr.h - r.h; }
  });
  if (minDy2 < minDy) { minDy = minDy2; /* bestY already set */ }

  // Only snap if within threshold
  if (minDx > SNAP_THRESH) bestX = bench.pos.x;
  if (minDy > SNAP_THRESH) bestY = bench.pos.y;

  return { ...bench, pos: { x: bestX, y: bestY } };
}

// ── Line-place ghost computation: evenly-spaced candidates from the press point
//     along the axis-snapped (0°/90°) drag direction. Spacing = the object's long
//     footprint dim + a clearance gap. Each candidate runs through the SAME
//     rotation-aware clampObjectToRoom as a normal placement; any that would be
//     clamped (doesn't fully fit inside the room where it lands) is invalid. ──
const LINE_GAP_IN = 12; // clearance between instances
const LINE_MAX = 60;    // safety cap on ghosts per gesture
function computeLineGhosts(type, start, cur, room) {
  const def = smartObjectByType(type);
  if (!def) return [];
  const proto = { type, spec: { ...def.spec } };
  const s = smartObjectSize(proto);
  const dx = cur.x - start.x, dy = cur.y - start.y;
  const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y"; // axis-snap for predictability
  const nativeLong = s.h >= s.w ? "y" : "x";
  const rotationDeg = axis === nativeLong ? 0 : 90; // long axis follows the drag
  const spacing = Math.max(s.w, s.h) + LINE_GAP_IN;
  const len = Math.abs(axis === "x" ? dx : dy);
  const dir = (axis === "x" ? dx : dy) >= 0 ? 1 : -1;
  const count = Math.min(LINE_MAX, Math.floor(len / spacing) + 1);
  const ghosts = [];
  for (let i = 0; i < count; i++) {
    const cx = start.x + (axis === "x" ? dir * i * spacing : 0);
    const cy = start.y + (axis === "y" ? dir * i * spacing : 0);
    const raw = { x: cx - s.w / 2, y: cy - s.h / 2 };
    const clamped = clampObjectToRoom({ ...proto, rotationDeg, pos: raw }, room);
    const valid = Math.abs(clamped.x - raw.x) < 0.5 && Math.abs(clamped.y - raw.y) < 0.5;
    ghosts.push({ x: raw.x, y: raw.y, w: s.w, h: s.h, rotationDeg, valid });
  }
  return ghosts;
}

export { benchRect };