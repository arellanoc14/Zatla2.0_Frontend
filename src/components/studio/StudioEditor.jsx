import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStudioModels } from "@/lib/growroom/globalModels";
import { useStudio } from "@/lib/growroom/StudioStore";
import { useDesignCartSync } from "@/lib/cart";
import { usePlanInteraction, rescaleObjects } from "./usePlanInteraction";
import { useRoomRotation } from "./useRoomRotation";
import DeleteRoomButton from "./DeleteRoomButton";
import PlanCanvas from "./PlanCanvas";
import TopToolbar from "./TopToolbar";
import { useAutoSave } from "./useAutoSave";
import StatsPanel from "./StatsPanel";
import LandscapeSidePanel from "./LandscapeSidePanel";
import PanelErrorBoundary from "./PanelErrorBoundary";
import Walkthrough3D from "./Walkthrough3D";
import { mirrorActiveRoomPayload } from "@/lib/growroom/saveRoom";
import { commitActiveRoom, makeNewRoom, computeFacility, activeRoomDims } from "@/lib/growroom/facility";
import { exportRoomReportCsv } from "@/lib/growroom/exportReport";
import { exportRoomPdf } from "@/lib/growroom/exportPdf";
import { useAuth } from "@/lib/AuthContext";
import AisleEditor from "./AisleEditor";
import TiersButton from "./TiersButton";
import SelectedObjectRemove from "./SelectedObjectRemove";
import MoveRoomToggle from "./MoveRoomToggle";
import MergeRoomsOverlay from "./MergeRoomsOverlay";
import DrawRoomOverlay from "./DrawRoomOverlay";
import { canMergeRooms, mergeRooms, makePolygonRoom } from "@/lib/growroom/mergeRooms";
import { clipBenchesToPolygon } from "@/lib/growroom/polygon";
import { autoLayoutByRoom, autoLayoutLights } from "@/lib/growroom/autolayout";
import { ceilingForTiers } from "@/lib/growroom/growLightFit";
import { columnsOf, resolveAisleAt } from "@/lib/growroom/mobileAisle";
import { clampObjectToRoom, makeSmartObject } from "@/lib/growroom/smartObjects";
import { roomForBenches, benchColumnsOf, MAX_ROOM_DIM_FT } from "@/lib/growroom/design3d";
import { clampHeightY, getObjectHeightIn } from "@/lib/growroom/equipmentHeight";
import { defaultVisibility } from "@/lib/growroom/layers";
import { detectConflicts } from "@/lib/growroom/conflicts";
import { SlidersHorizontal, X, PlusSquare, Combine } from "lucide-react";
import LeafLoader from "@/components/landing/LeafLoader";
import PlacementBadge from "./PlacementBadge";
import { useIsMobile } from "@/hooks/use-mobile";


// Dev-only room-flow diagnostics. Flip to true to surface a tiny fixed overlay
// (and a [RoomMove] drop log) showing room selection / move / overlap / offset
// state. Hidden by default — keeps production clean.
const DEBUG_ROOM_FLOW = false;

function persistentLayoutSignature(d) {
  return JSON.stringify({
    name: d.name,
    customer: d.customer,
    units: d.units,
    room: d.room,
    settings: d.settings,
    benches: d.benches,
    lights: d.lights,
    doors: d.doors,
    objects: d.objects,
    rotationDeg: d.rotationDeg,
    activeRoomId: d.activeRoomId,
    rooms: d.rooms,
    equipment: d.equipment,
    models: d.models,
  });
}

export default function StudioEditor({ projectId, onBack, isSubscribed = false, initial3d = false, lockedMode = null, actions3d = null, loader3d = null }) {
  const { doc, setDoc, updatePresent, undo, redo, canUndo, canRedo } = useStudio();
  // The cart's grow-light line follows this layout in real time (lib/cart.js).
  useDesignCartSync(doc);
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Paid features are open to design, locked at export/share/3D. Prompt to upgrade.
  const requirePlan = useCallback(() => {
    toast.error("This is a paid feature", {
      description: "Subscribe to a plan to export, share, and use the 3D view.",
      action: { label: "View plans", onClick: () => navigate("/pricing") },
    });
  }, [navigate]);
  const containerRef = useRef(null);
  const capture3dRef = useRef(null); // set by Walkthrough3D → returns a PNG of the live scene
  const [showDimensions, setShowDimensions] = useState(true);
  // Starts in 3D when the studio was opened with ?view=3d (e.g. "View in 3D"
  // from the estimate builder). Defaults to 2D for every other entry point.
  const [mode3d, setMode3d] = useState(lockedMode === "3d" || initial3d);
  const [ad3dUnlocked, setAd3dUnlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  // True while Back is saving + refetching before navigating — drives the
  // full-screen "Saving your layout…" overlay so the wait reads as working, not frozen.
  const [leavingHome, setLeavingHome] = useState(false);
  const prefersReducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // mobile drawer open state
  // Which floating editor is expanded (mutually exclusive): "equipment" | "aisle"
  // | "tiers" | null. Opening one closes the others.
  const [activePanel, setActivePanel] = useState(null);
  const [cameraMode, setCameraMode] = useState("orbit"); // 3D camera: orbit | topdown | walkthrough (view-only)
  // Which room is highlighted/orbited in the 3D view. Starts null (nothing
  // selected) every time 3D is entered; tapping a room sets it. This is purely a
  // 3D-view concept — separate from doc.activeRoomId (the 2D editing context).
  const [selectedRoomId3D, setSelectedRoomId3D] = useState(null);
  // Explicit "Move" mode (3D): the selected room only drags when this is ON. Default
  // OFF so a one-finger touch orbits the camera and the room is locked — removing the
  // mobile zoom-vs-drag ambiguity.
  const [roomMoveMode, setRoomMoveMode] = useState(false);
  // Explicit "Move" mode (2D): the selected room only drags when this is ON. Default
  // OFF so tapping a room just selects it — preventing accidental moves and making
  // the 2D canvas behave like a professional floor-plan tool. Separate from the 3D
  // roomMoveMode above. Reset whenever the active room changes or we switch 2D↔3D.
  const [roomMoveMode2D, setRoomMoveMode2D] = useState(false);
  useEffect(() => { setRoomMoveMode2D(false); }, [doc.activeRoomId, mode3d]);
  // Merge / Draw Custom Room modes (2D only). Merge is a two-tap flow: tap
  // Merge, then tap the highlighted room. Draw enters a grid-snapped outline
  // drawing mode. Both reset when the active room or the 2D/3D mode changes.
  const [mergeMode, setMergeMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  useEffect(() => { setMergeMode(false); setDrawMode(false); }, [doc.activeRoomId, mode3d]);
  // Entering 3D always starts with NO room selected (no highlight, no auto-frame).
  // Tapping a room in 3D is the only thing that selects.
  useEffect(() => { setSelectedRoomId3D(null); }, [mode3d]);
  // Move mode never sticks across rooms or modes: reset to OFF whenever the selected
  // room changes/clears or we leave 3D.
  useEffect(() => { setRoomMoveMode(false); }, [selectedRoomId3D, mode3d]);
  // Explicit "Move" mode (3D) for equipment objects: the selected object only drags
  // when this is ON (mirrors roomMoveMode). Default OFF so a one-finger touch orbits
  // the camera and a tap just selects — no accidental drags.
  const [objectMoveMode, setObjectMoveMode] = useState(false);
  // Layer visibility — all layers visible (3D is view-only; no layers UI). Kept so
  // the 2D canvas + 3D render share the same all-visible filter.
  const layerVisibility = defaultVisibility;

  // Bench / light build settings — lifted to parent so both canvas interaction
  // (room resize → auto-layout) and the side panel share the same values.
  const [benchWidth, setBenchWidth] = useState(4);
  const [benchType, setBenchType] = useState("rolling");
  const [tiers, setTiers] = useState(1);
  const [lightsOn, setLightsOn] = useState(false);
  const [lightWidth, setLightWidth] = useState(4);
  const benchSettings = { benchWidth, benchType, tiers, lightsOn, lightWidth };

  const interaction = usePlanInteraction({
    doc, updatePresent, containerRef, benchSettings,
    roomMoveMode2D,
    onRoomMoveComplete: () => setRoomMoveMode2D(false),
    // Feedback after a room drop: a tiny overlap auto-nudges flush, a major
    // overlap snaps the room back to where the drag started. Never a silent
    // snap-back — the user always gets a clear cue.
    onRoomDropResult: (outcome) => {
      if (DEBUG_ROOM_FLOW) {
        console.log("[RoomMove]", {
          activeRoomId: doc.activeRoomId,
          offset: doc.rooms?.find((r) => r.id === doc.activeRoomId)?.offset || null,
          outcome,
          committed: outcome !== "blocked",
        });
      }
      if (outcome === "nudged") {
        toast.success("Room snapped flush to the neighboring room");
      } else if (outcome === "blocked") {
        toast.error("Room overlaps another room", {
          description: "Moved it back — drop it in an open spot instead.",
        });
      }
    },
  });
  const { selected, setSelected, multiSelected, setMultiSelected, guides, roomGuides, hoveredHandle, nudgeSelected, getClearanceViolations, setActiveRoom, placeObject, roomDragging, placement, startPlacement, endPlacement, lineGhosts } = interaction;

  // Placement mode never sticks across 2D↔3D switches.
  useEffect(() => { endPlacement(); }, [mode3d, endPlacement]);

  // 90° room rotation (eased, animated). `rotateBlocked` red-flashes the button
  // when a rotation would overlap a neighbor; `animating` drives the green canvas
  // highlight (rotateFlash) on PlanCanvas during the spin.
  const [rotateBlocked, setRotateBlocked] = useState(false);
  const { rotate: rotateRoom, animating: rotateAnimating } = useRoomRotation({
    doc,
    updatePresent,
    onBlocked: () => {
      setRotateBlocked(true);
      setTimeout(() => setRotateBlocked(false), 350);
    },
  });

  // Add a new room to the facility floor: commit the current room's flat fields
  // back into doc.rooms[], append a fresh empty room placed in a free slot, then
  // switch to it (which loads its geometry into the flat fields). Each room's
  // internal layout engine is untouched — only its offset/placement is new.
  const addRoom = useCallback(() => {
    // Cap the facility at 5 rooms — enough for a full flower/veg/drying setup
    // without overcrowding the canvas.
    if ((doc.rooms || []).length >= 5) {
      toast.error("Room limit reached", { description: "You can have up to 5 rooms in a facility." });
      return;
    }
    // ONE atomic update: commit the current flat fields into THIS room's slot,
    // append a fresh room, switch activeRoomId, and load the NEW room into the flat
    // fields — all in the same state change. No setTimeout/deferred setActiveRoom,
    // so a stale second commit can never smear the previous room's dims onto a
    // neighbor. The previous room is committed from its CURRENT (correct) dims.
    updatePresent((d) => {
      if ((d.rooms || []).length >= 5) return d;
      const committed = commitActiveRoom(d);
      const newRoom = makeNewRoom({ ...d, rooms: committed });
      return {
        ...d,
        rooms: [...committed, newRoom],
        activeRoomId: newRoom.id,
        room: newRoom.room,
        settings: newRoom.settings,
        benches: newRoom.benches || [],
        lights: newRoom.lights || [],
        doors: newRoom.doors || [],
        objects: newRoom.objects || [],
        rotationDeg: newRoom.rotationDeg || 0,
      };
    });
  }, [updatePresent, doc.rooms]);

  // Rename a room in the facility (id/offset/geometry untouched).
  const renameRoom = useCallback((roomId, name) => {
    updatePresent((d) => ({
      ...d,
      rooms: (d.rooms || []).map((r) => (r.id === roomId ? { ...r, name } : r)),
    }));
  }, [updatePresent]);

  // Delete a room from the facility. Never removes the last remaining room. If the
  // active room is deleted, switch to the first surviving room so the controls
  // (flat working fields) reload to a valid room. Other rooms are left untouched.
  const deleteRoom = useCallback((roomId) => {
    updatePresent((d) => {
      const rooms = Array.isArray(d.rooms) ? d.rooms : [];
      if (rooms.length <= 1) return d; // never delete the last room
      // Commit the active room's working fields first so no in-progress edits are lost.
      const committed = commitActiveRoom(d);
      const remaining = committed.filter((r) => r.id !== roomId);
      if (remaining.length === 0) return d;
      // If we deleted the active room, load the first survivor into the flat fields.
      if (d.activeRoomId === roomId) {
        const next = remaining[0];
        return {
          ...d,
          rooms: remaining,
          activeRoomId: next.id,
          room: next.room,
          settings: next.settings,
          benches: next.benches || [],
          lights: next.lights || [],
          doors: next.doors || [],
          objects: next.objects || [],
        };
      }
      return { ...d, rooms: remaining };
    });
  }, [updatePresent]);

  // Move a room in the 3D view: commit the dragged room's new facility offset.
  // Writes the SAME rooms[].offset that the 2D room-drag writes, so 2D reflects the
  // move immediately (single source of truth). Negative offsets allowed — the
  // facility floor auto-expands, matching 2D. One committed call = one undo step.
  const moveRoom3D = useCallback((roomId, offset) => {
    if (!roomId) return;
    updatePresent((d) => ({
      ...d,
      rooms: (d.rooms || []).map((r) => (r.id === roomId ? { ...r, offset: { x: offset.x, y: offset.y } } : r)),
    }));
  }, [updatePresent]);

  // Live, read-only layout conflict detection for the active room. Recomputes
  // whenever room dimensions, benches, objects, or aisle settings change — so
  // moving/rotating/adding/deleting clears or raises warnings in real time. This
  // NEVER mutates data, auto-layout, or the 2D↔3D sync; it only feeds highlights.
  const warnings = useMemo(
    () => detectConflicts(doc),
    [doc.room, doc.benches, doc.objects, doc.settings]
  );

  // Keep latest doc in a ref so the unmount auto-save captures current state.
  // Assign DURING render (not in a useEffect) so docRef.current is never one
  // render stale — an unmount/Back save fired right after an edit (placing a
  // door/object, adding a room) must see the just-committed doc, not the prior
  // one. The effect-based sync used before lagged by a render, which is exactly
  // why objects/doors and new rooms serialized empty.
  const docRef = useRef(doc);
  docRef.current = doc;

  // ── Merge adjacent rooms ──────────────────────────────────────────────────
  // Merges immediately on tap — one undo step restores both rooms, so an extra
  // confirmation dialog only added a step where the merge could get lost.
  const pickMergeTarget = useCallback((targetId) => {
    setMergeMode(false);
    try {
      const committed = commitActiveRoom(docRef.current);
      const a = committed.find((r) => r.id === docRef.current.activeRoomId);
      const b = committed.find((r) => r.id === targetId);
      const check = canMergeRooms(a, b);
      if (!check.ok) { toast.error(check.reason); return; }
      const merged = mergeRooms(a, b);
      if (!merged) { toast.error("Couldn't merge those two rooms."); return; }
      updatePresent((d) => {
        const rooms = commitActiveRoom(d)
          .filter((r) => r.id !== targetId)
          .map((r) => (r.id === merged.id ? merged : r));
        return {
          ...d, rooms, activeRoomId: merged.id,
          room: merged.room, settings: merged.settings,
          benches: merged.benches, lights: merged.lights,
          doors: merged.doors, objects: merged.objects,
          rotationDeg: 0,
        };
      });
      toast.success(`Merged into “${merged.name}” — the shared wall is gone`);
    } catch (e) {
      console.error("[merge] failed:", e);
      toast.error(e?.message || "Merge failed.");
    }
  }, [updatePresent]);

  // ── Draw Custom Room ──────────────────────────────────────────────────────
  // Turn the drawn outline into a new polygon room (starts with no benches) and
  // make it the active room.
  const completeDrawRoom = useCallback((points) => {
    setDrawMode(false);
    const newRoom = makePolygonRoom(points, (docRef.current.rooms || []).length);
    if (!newRoom) { toast.error("Outline the room with at least 3 corners"); return; }
    // Fill the drawn outline with benches on the shared layout pipeline, then
    // clip anything landing outside the shape (notches/cutouts).
    const { benches: laid } = autoLayoutByRoom(newRoom.room, newRoom.settings, benchWidth, benchType, tiers);
    const benches = Array.isArray(newRoom.polygon) && newRoom.polygon.length >= 3
      ? clipBenchesToPolygon(laid, newRoom.polygon)
      : laid;
    newRoom.benches = benches;
    updatePresent((d) => {
      const committed = commitActiveRoom(d);
      return {
        ...d, rooms: [...committed, newRoom], activeRoomId: newRoom.id,
        room: newRoom.room, settings: newRoom.settings,
        benches, lights: [], doors: [], objects: [],
        rotationDeg: 0,
      };
    });
  }, [updatePresent, benchWidth, benchType, tiers]);

  // Live shared model library — kept fresh so changing a .glb in the Model Library
  // re-renders the 3D scene immediately. Refetches whenever the studio remounts or
  // the cache is invalidated by the library screen.
  const { data: liveGlobalModels } = useQuery({
    queryKey: ["globalModels"],
    queryFn: getStudioModels,
  });

  // Sync the latest library models into the studio doc (transient → no undo entry,
  // never touches bench data). The 3D scene's docKey watches globalModels, so this
  // alone triggers a rebuild with the new .glb mapping.
  useEffect(() => {
    if (!liveGlobalModels) return;
    if (JSON.stringify(liveGlobalModels) === JSON.stringify(doc.globalModels || {})) return;
    updatePresent((d) => ({ ...d, globalModels: liveGlobalModels }), { transient: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGlobalModels]);

  // Build the models payload for a Project write. The GLB URLs live in the shared
  // global-models row (d.globalModels); merge them into the per-project models so
  // Project.models persists real URLs and never gets wiped by other edits. The
  // live library always wins over the project's own cached copy — otherwise a
  // stale d.models value (e.g. from before a model was removed in the Model
  // Library) would keep getting re-saved into the project forever, undoing the
  // removal on every autosave.
  const buildModelsPayload = (d) => {
    const merged = { ...(d.models || {}), ...(d.globalModels || {}) };
    // Drop empty slots so we don't write a payload of nulls.
    Object.keys(merged).forEach((k) => { if (!merged[k]) delete merged[k]; });
    return merged;
  };

  // Force-commit the active room's flat working fields into d.rooms[] right now
  // so the save payload always serializes the latest dimensions/benches/objects.
  // syncActiveRoom in the reducer already keeps rooms[] in lockstep on every
  // state update, so this only needs to build the committed doc for the save —
  // no dispatch (which would re-trigger the save watcher and loop).
  const commitActiveRoomNow = useCallback(() => {
    // Build the committed doc (flat fields synced into rooms[]) and use it
    // directly for the save payload. syncActiveRoom in the reducer already
    // keeps rooms[] in lockstep on every state update, so NO dispatch is
    // needed here — dispatching would re-trigger the save-watcher useEffect
    // and create an infinite save loop (save → transient update → useEffect →
    // scheduleSave → save → …).
    const committedDoc = { ...docRef.current, rooms: commitActiveRoom(docRef.current) };
    docRef.current = committedDoc;
    return committedDoc;
  }, []);

  // Reliable auto-save: persists the COMPLETE project state (full rooms[] +
  // facility + models) to the Project entity via an awaited write — debounced
  // after real user changes and forced on leave only when dirty. Drives the toolbar status.
  const hasUnsavedChanges = useRef(false);
  const savedLayoutSignatureRef = useRef(null);
  if (savedLayoutSignatureRef.current === null) savedLayoutSignatureRef.current = persistentLayoutSignature(doc);
  const hasRealUnsavedChanges = useCallback(
    () => hasUnsavedChanges.current || persistentLayoutSignature(docRef.current) !== savedLayoutSignatureRef.current,
    []
  );
  const { status: saveStatus, savedAt, errorMessage: saveError, scheduleSave, saveNow } = useAutoSave({
    projectId,
    docRef,
    buildModelsPayload,
    commitActiveRoomNow,
    onAfterSave: () => {
      hasUnsavedChanges.current = false;
      savedLayoutSignatureRef.current = persistentLayoutSignature(docRef.current);
    },
    shouldAutoSave: hasRealUnsavedChanges,
  });

  // Debounced auto-save after USER layout changes only. Never save immediately on
  // mount/open: the load/hydration path must not rewrite room dimensions, offsets,
  // or bench geometry just because the user opened the studio and went Home.
  const didMountSaveWatcher = useRef(false);
  useEffect(() => {
    if (!didMountSaveWatcher.current) {
      didMountSaveWatcher.current = true;
      return;
    }
    // Schedule a save on ANY doc change after mount (adding/deleting/renaming a
    // room, placing equipment, etc.) — not just room moves. The signature check
    // this used to gate on could miss changes; scheduling is cheap (debounced)
    // and saveNow() always serializes the current doc, so this is always correct.
    hasUnsavedChanges.current = true;
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Force a full save when leaving the studio (unmount / route-change). useAutoSave
  // also hooks beforeunload/pagehide/visibilitychange for refresh/close/background.
  useEffect(() => {
    return () => {
      // Blur the active input so MeasureInput commits its value before the unmount
      // save — same mobile blur-after-click issue as handleBack.
      try {
        flushSync(() => {
          const el = document.activeElement;
          if (el && el.tagName === "INPUT" && typeof el.blur === "function") el.blur();
        });
      } catch { /* flush during unmount may warn; best-effort */ }
      if (!hasRealUnsavedChanges()) return;
      // Commit the active room's flat fields into rooms[] BEFORE the unmount save
      // so the payload always includes the latest bench/door/object changes.
      if (commitActiveRoomNow) commitActiveRoomNow();
      saveNow().catch(() => { /* unmount save; best-effort, errors logged */ });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const key = selected.kind === "bench" ? "benches" : selected.kind === "light" ? "lights" : selected.kind === "object" ? "objects" : "equipment";
    updatePresent((d) => ({ ...d, [key]: (d[key] || []).filter((o) => o.id !== selected.id) }));
    setSelected(null);
  }, [selected, updatePresent, setSelected]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const key = selected.kind === "bench" ? "benches" : selected.kind === "light" ? "lights" : "equipment";
    updatePresent((d) => {
      const obj = d[key].find((o) => o.id === selected.id);
      if (!obj) return d;
      const copy = { ...JSON.parse(JSON.stringify(obj)), id: `${selected.kind[0]}_${Date.now().toString(36)}`, pos: { x: obj.pos.x + 24, y: obj.pos.y + 24 } };
      return { ...d, [key]: [...d[key], copy] };
    });
  }, [selected, updatePresent]);

  const rotateSelected = useCallback(() => {
    if (!selected) return;
    const key = selected.kind === "bench" ? "benches" : selected.kind === "light" ? "lights" : "equipment";
    updatePresent((d) => ({ ...d, [key]: d[key].map((o) => (o.id === selected.id ? { ...o, rotationDeg: ((o.rotationDeg || 0) + 90) % 360 } : o)) }));
  }, [selected, updatePresent]);

  // Rotate the SELECTED placed equipment object (door, fan, ducting, etc.) 90° and
  // re-clamp it so its rotated footprint stays inside the room walls.
  const rotateSelectedObject = useCallback(() => {
    if (selected?.kind !== "object") return;
    updatePresent((d) => ({
      ...d,
      objects: (d.objects || []).map((o) => {
        if (o.id !== selected.id) return o;
        const rotated = { ...o, rotationDeg: ((o.rotationDeg || 0) + 90) % 360 };
        const clamped = clampObjectToRoom(rotated, activeRoomDims(d));
        return { ...rotated, pos: { ...clamped, ...(typeof o.pos?.z === "number" ? { z: o.pos.z } : {}) } };
      }),
    }));
  }, [selected, updatePresent]);

  // Write one spec value on the SELECTED object (e.g. door hinge/swing) — used by
  // the floating door controls so hinge/swing flip right on the canvas.
  const setSelectedObjectSpec = useCallback((key, value) => {
    if (selected?.kind !== "object") return;
    updatePresent((d) => ({
      ...d,
      objects: (d.objects || []).map((o) =>
        o.id === selected.id ? { ...o, spec: { ...o.spec, [key]: value } } : o
      ),
    }));
  }, [selected, updatePresent]);

  // ── 3D EQUIPMENT interaction (equipment objects only; benches/lights stay 2D)
  // Which equipment object is selected in the 3D view. Separate from `selected`
  // (the 2D selection) and from selectedRoomId3D (the 3D room selection).
  const [selectedObjectId3D, setSelectedObjectId3D] = useState(null);
  // Selecting a room clears the object selection (and vice-versa) — the two 3D
  // selections are mutually exclusive.
  useEffect(() => { setSelectedObjectId3D(null); }, [selectedRoomId3D]);
  useEffect(() => { setSelectedObjectId3D(null); }, [mode3d]);
  // Object Move mode never sticks across selections or modes: reset to OFF whenever
  // the selected object changes/clears or we leave 3D.
  useEffect(() => { setObjectMoveMode(false); }, [selectedObjectId3D, mode3d]);

  // The currently-selected 3D equipment object record (live from doc.objects).
  const selectedObject3D = selectedObjectId3D
    ? (doc.objects || []).find((o) => o.id === selectedObjectId3D)
    : null;

  // If a tapped object lives in a NON-active room, switch the active room first so
  // all the data handlers (which operate on the flat top-level objects[]) target
  // the correct room. Active-room objects are the only draggable ones, so in
  // practice this is a no-op guard, but it keeps the contract explicit.
  const activateRoomForObject = useCallback((objId) => {
    const inActive = (doc.objects || []).some((o) => o.id === objId);
    if (inActive) return;
    const owner = (doc.rooms || []).find((r) => (r.objects || []).some((o) => o.id === objId));
    if (owner && owner.id !== doc.activeRoomId) setActiveRoom(owner.id);
  }, [doc.objects, doc.rooms, doc.activeRoomId, setActiveRoom]);

  // Move an equipment object: write pos.x/pos.y (room-local inches), re-clamp the
  // footprint inside the room walls, preserve pos.z. transient:true on every live
  // drag move (no undo entry), transient:false once on drop (one undo step).
  const dragObject = useCallback((objId, x, y, { transient = true } = {}) => {
    updatePresent((d) => ({
      ...d,
      objects: (d.objects || []).map((o) => {
        if (o.id !== objId) return o;
        const moved = { ...o, pos: { ...o.pos, x, y } };
        const clamped = clampObjectToRoom(moved, activeRoomDims(d));
        return { ...moved, pos: { x: clamped.x, y: clamped.y, ...(typeof o.pos?.z === "number" ? { z: o.pos.z } : {}) } };
      }),
    }), { transient });
  }, [updatePresent]);

  // Rotate an equipment object: +90° (or an explicit live angle), re-clamp the
  // rotated footprint, preserve pos.z. One undo step.
  const rotateObjectById = useCallback((objId, liveDeg) => {
    updatePresent((d) => ({
      ...d,
      objects: (d.objects || []).map((o) => {
        if (o.id !== objId) return o;
        const rotationDeg = typeof liveDeg === "number" ? liveDeg : ((o.rotationDeg || 0) + 90) % 360;
        const rotated = { ...o, rotationDeg };
        const clamped = clampObjectToRoom(rotated, activeRoomDims(d));
        return { ...rotated, pos: { x: clamped.x, y: clamped.y, ...(typeof o.pos?.z === "number" ? { z: o.pos.z } : {}) } };
      }),
    }));
  }, [updatePresent]);

  // Set an equipment object's height (pos.z, inches above floor), clamped to
  // [0, ceiling − objectHeight] so it never pokes through the ceiling.
  const setObjectHeight = useCallback((objId, heightIn) => {
    updatePresent((d) => ({
      ...d,
      objects: (d.objects || []).map((o) => {
        if (o.id !== objId) return o;
        const z = clampHeightY(heightIn, o, d.room?.ceilingIn || 144);
        return { ...o, pos: { ...o.pos, z } };
      }),
    }), { transient: true });
  }, [updatePresent]);

  // Set one spec value on a 3D-selected object (door hinge/swing).
  const setObjectSpecById = useCallback((objId, key, value) => {
    updatePresent((d) => ({
      ...d,
      objects: (d.objects || []).map((o) =>
        o.id === objId ? { ...o, spec: { ...o.spec, [key]: value } } : o
      ),
    }));
  }, [updatePresent]);

  // Delete an equipment object from objects[] and clear the 3D selection.
  const deleteObjectById = useCallback((objId) => {
    updatePresent((d) => ({ ...d, objects: (d.objects || []).filter((o) => o.id !== objId) }));
    setSelectedObjectId3D(null);
  }, [updatePresent]);

  // Shape-aware fill for merged/drawn polygon rooms: the auto-layout packs the
  // bounding box, then benches landing outside the outline (in a notch/cutout)
  // are dropped so nothing renders through a wall.
  const clipToActivePolygon = (d, benches) => {
    const poly = (d.rooms || []).find((r) => r.id === d.activeRoomId)?.polygon;
    return Array.isArray(poly) && poly.length >= 3 ? clipBenchesToPolygon(benches, poly) : benches;
  };

  // Apply new aisle/clearance settings to the SELECTED room only: store the
  // settings and re-run that room's bench auto-layout so its footprint/benches
  // update live. Writes the flat working fields, which mirror to rooms[] on save.
  const applyAisles = useCallback((newSettings) => {
    updatePresent((d) => {
      const settings = { ...d.settings, ...newSettings };
      const curTiers = Math.max(1, Math.round(d.benches?.[0]?.tiers || tiers || 1));
      const { benches: laid } = autoLayoutByRoom(d.room, settings, benchWidth, benchType, curTiers);
      const benches = clipToActivePolygon(d, laid);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      return { ...d, settings, benches, lights };
    }, { transient: true });
  }, [updatePresent, benchWidth, benchType, tiers, lightsOn, lightWidth]);

  // Set the SELECTED room's bench tier level (1/2/3): re-run that room's layout so
  // every bench carries the new tier on the shared pipeline (same floor footprint).
  // Tiers feed the canopy/yield math (length × width × tiers). Flat fields mirror
  // to rooms[] on save, so it survives reload and 2D + 3D + calcs stay in sync.
  const setRoomTiers = useCallback((t) => {
    const lvl = Math.max(1, Math.min(3, Math.round(t)));
    setTiers(lvl);
    updatePresent((d) => {
      const { benches: laid } = autoLayoutByRoom(d.room, d.settings, benchWidth, benchType, lvl);
      const benches = clipToActivePolygon(d, laid);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      // Walls follow the tiers: 16ft for double tier, 20ft for triple.
      const room = { ...d.room, ceilingIn: ceilingForTiers(lvl, d.room?.ceilingIn) };
      return { ...d, room, benches, lights };
    });
  }, [updatePresent, benchWidth, benchType, lightsOn, lightWidth]);

  // Set the SELECTED room's bench type AND tier level in one atomic update —
  // used by the Tiers dropdown (Single / Double / Triple Tier) so a single
  // pick rebuilds the layout without two separate history entries.
  const setRoomBenchConfig = useCallback((bt, t) => {
    setBenchType(bt);
    setTiers(t);
    updatePresent((d) => {
      const lvl = Math.max(1, Math.min(3, Math.round(t)));
      const { benches: laid } = autoLayoutByRoom(d.room, d.settings, benchWidth, bt, lvl);
      const benches = clipToActivePolygon(d, laid);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      const room = { ...d.room, ceilingIn: ceilingForTiers(lvl, d.room?.ceilingIn) };
      return { ...d, room, benches, lights };
    });
  }, [updatePresent, benchWidth, lightsOn, lightWidth]);

  // Set the SELECTED room's bench width (in feet): re-run that room's layout so
  // every bench rebuilds at the new width on the shared pipeline. Flat fields
  // mirror to rooms[] on save, so 2D + 3D + calcs stay in sync.
  const setRoomBenchWidth = useCallback((w) => {
    const wf = Math.max(2, Math.min(8, Math.round(w)));
    setBenchWidth(wf);
    updatePresent((d) => {
      const curTiers = Math.max(1, Math.round(d.benches?.[0]?.tiers || tiers || 1));
      const { benches: laid } = autoLayoutByRoom(d.room, d.settings, wf, benchType, curTiers);
      const benches = clipToActivePolygon(d, laid);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      return { ...d, benches, lights };
    });
  }, [updatePresent, benchType, tiers, lightsOn, lightWidth]);

  // Set the SELECTED room's bench type: re-run that room's layout
  // so every bench rebuilds as the new type on the shared pipeline. Flat fields
  // mirror to rooms[] on save, so 2D + 3D + calcs stay in sync.
  const setRoomBenchType = useCallback((bt) => {
    setBenchType(bt);
    updatePresent((d) => {
      const curTiers = Math.max(1, Math.round(d.benches?.[0]?.tiers || tiers || 1));
      const { benches: laid } = autoLayoutByRoom(d.room, d.settings, benchWidth, bt, curTiers);
      const benches = clipToActivePolygon(d, laid);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      return { ...d, benches, lights };
    });
  }, [updatePresent, benchWidth, tiers, lightsOn, lightWidth]);

  // Set the SELECTED room's grow-light MODEL (visual fixture only — placement,
  // wattage/PPFD/yield math untouched). Written straight into that room's rooms[]
  // entry so it commits atomically (commitActiveRoom preserves it) and persists;
  // the 3D scene crossfades only that room's fixtures. One call = one undo step.
  const setRoomLightModel = useCallback((key) => {
    updatePresent((d) => {
      const rid = d.activeRoomId;
      if (rid && (d.rooms || []).some((r) => r.id === rid)) {
        return { ...d, rooms: d.rooms.map((r) => (r.id === rid ? { ...r, lightModel: key } : r)) };
      }
      // Multi-room doc with no selected room: never write a shared value that
      // would change every room — require a room selection instead.
      if ((d.rooms || []).length > 0) return d;
      return { ...d, lightModel: key }; // legacy single-room doc only
    });
  }, [updatePresent]);

  // Set the SELECTED room's light spectrum ([uva, blue, red, farred], % of
  // factory). Visual only. transient: no history entry; all: every room.
  const setRoomSpectrum = useCallback((levels, { transient = false, all = false } = {}) => {
    updatePresent((d) => {
      const rid = d.activeRoomId;
      if (!(d.rooms || []).length) return d;
      if (!all && !(rid && d.rooms.some((r) => r.id === rid))) return d;
      return { ...d, rooms: d.rooms.map((r) => (all || r.id === rid ? { ...r, spectrum: levels.slice() } : r)) };
    }, { transient });
  }, [updatePresent]);

  // Set the SELECTED room's canopy display mode (visual only — placement, wattage,
  // yield math untouched). "canopy" (default) shows the canopy light fixtures,
  // "none" hides them, "air" replaces them with the Air Circulation .glb. Written
  // into that room's rooms[] entry so it commits atomically and persists; the 3D
  // scene rebuilds only the affected fixtures. One call = one undo step.
  // Mobile aisle (a tapped bench column in 3D — see mobileAisle.js): store the
  // aisle's new gap as settings.aisleAt on the SELECTED room and re-run its
  // layout, the same pipeline every room control above uses. 2D, 3D and the
  // calcs therefore stay in sync, and every later re-layout (tiers, bench
  // width, aisle settings, room size) keeps the aisle where the user slid it.
  // One undo step. Returns false (and changes nothing) when the slid layout
  // can't be laid out — checked on the current doc first, because the store's
  // updater runs later, inside the reducer.
  const slidAisleDoc = (d, plan) => {
    const curTiers = Math.max(1, Math.round(d.benches?.[0]?.tiers || tiers || 1));
    const laid = new Map();
    const benchesFor = (k) => {
      if (!laid.has(k)) {
        laid.set(k, clipToActivePolygon(d, autoLayoutByRoom(d.room, { ...d.settings, aisleAt: k }, benchWidth, benchType, curTiers).benches));
      }
      return laid.get(k);
    };
    const aisleAt = resolveAisleAt(plan, (k) => columnsOf(benchesFor(k), plan.axis).map((c) => c.lo), plan.columnStarts.length + 2);
    const benches = benchesFor(aisleAt);
    if (!benches.length) return null;
    const settings = { ...d.settings, aisleAt };
    const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
    return { ...d, settings, benches, lights };
  };
  const slideRoomAisle = useCallback((plan) => {
    if (!plan || !Array.isArray(plan.columnStarts) || !slidAisleDoc(doc, plan)) return false;
    updatePresent((d) => slidAisleDoc(d, plan) || d);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, updatePresent, benchWidth, benchType, tiers, lightsOn, lightWidth]);

  const setRoomCanopyMode = useCallback((key) => {
    updatePresent((d) => {
      const rid = d.activeRoomId;
      if (rid && (d.rooms || []).some((r) => r.id === rid)) {
        return { ...d, rooms: d.rooms.map((r) => (r.id === rid ? { ...r, canopyMode: key } : r)) };
      }
      if ((d.rooms || []).length > 0) return d;
      return { ...d, canopyMode: key }; // legacy single-room doc only
    });
  }, [updatePresent]);

  // Set the SELECTED room's ceiling height (inches). Only changes the room's
  // vertical extent — the 3D walls build from ceilingIn, so they grow/shrink — and
  // never touches the floor footprint, so no bench auto-layout re-run is needed.
  const setRoomCeiling = useCallback((inches) => {
    if (!Number.isFinite(inches) || inches <= 0) return;
    const capped = Math.min(inches, MAX_ROOM_DIM_FT * 12);
    updatePresent((d) => ({ ...d, room: { ...d.room, ceilingIn: capped } }));
  }, [updatePresent]);

  // Resize the SELECTED room — from the 3D Design panel's Length / Width fields
  // (`room`: either side, the other read INSIDE the update so two quick edits
  // can't undo each other) or from a bench count × run (`qty`, `lengthFt`,
  // design3d.roomForBenches: exactly what autoLayoutByRoom reserves). Benches
  // re-lay out on the same pipeline as every other room control; doors and
  // equipment keep their relative place (rescaleObjects, the wall-drag rule).
  // A size the layout engine can't fill is refused, with the reason.
  const resizeActiveRoom = useCallback(({ room, qty, lengthFt }) => {
    const d0 = doc;
    const poly = (d0.rooms || []).find((r) => r.id === d0.activeRoomId)?.polygon;
    if (Array.isArray(poly) && poly.length >= 3) return;
    const derived = room
      ? { widthIn: room.widthIn ?? d0.room?.widthIn, lengthIn: room.lengthIn ?? d0.room?.lengthIn }
      : roomForBenches({ qty, lengthFt }, benchWidth, d0.settings || {});
    if (!derived || !(derived.widthIn > 0) || !(derived.lengthIn > 0)) return;
    const maxIn = MAX_ROOM_DIM_FT * 12;
    if (derived.widthIn > maxIn + 0.5 || derived.lengthIn > maxIn + 0.5) {
      toast.error(`A room can be at most ${MAX_ROOM_DIM_FT} ft long and wide`, {
        description: "Use fewer rows or a shorter run.",
      });
      return;
    }
    const curTiers = Math.max(1, Math.round(d0.benches?.[0]?.tiers || tiers || 1));
    const test = autoLayoutByRoom({ ...d0.room, ...derived }, d0.settings, benchWidth, benchType, curTiers);
    if (!test.benches.length) {
      toast.error("Those benches don't fit this room", {
        description: test.warnings?.[0] || "Adjust the aisle clearances and try again.",
      });
      return;
    }
    updatePresent((d) => {
      const dims = room
        ? { widthIn: room.widthIn ?? d.room?.widthIn, lengthIn: room.lengthIn ?? d.room?.lengthIn }
        : derived;
      const newRoom = { ...d.room, ...dims };
      const lvl = Math.max(1, Math.round(d.benches?.[0]?.tiers || tiers || 1));
      const laid = autoLayoutByRoom(newRoom, d.settings, benchWidth, benchType, lvl).benches;
      if (!laid.length) return d;
      const lights = lightsOn ? autoLayoutLights(laid, lightWidth) : [];
      const objects = rescaleObjects(d.objects, d.room, newRoom);
      return { ...d, room: newRoom, benches: laid, lights, objects };
    });
  }, [doc, updatePresent, benchWidth, benchType, tiers, lightsOn, lightWidth]);

  // Add / remove a ZATLA controller in the SELECTED room. A new one goes on the
  // front wall's centre; the 3D seats a controller flush on its nearest wall.
  const addController = useCallback(() => {
    updatePresent((d) => {
      const obj = makeSmartObject("controller", { x: 0, y: 0 });
      if (!obj) return d;
      const n = (d.objects || []).filter((o) => o.type === "controller").length;
      const x = (d.room?.widthIn || 0) / 2 - 8 + n * 24;
      const pos = clampObjectToRoom({ ...obj, pos: { x, y: 0 } }, activeRoomDims(d));
      return { ...d, objects: [...(d.objects || []), { ...obj, pos }] };
    });
  }, [updatePresent]);
  // Removes the most recently added one.
  const removeController = useCallback(() => {
    const last = (doc.objects || []).filter((o) => o.type === "controller").pop();
    if (!last) return;
    if (last.id === selectedObjectId3D) setSelectedObjectId3D(null);
    updatePresent((d) => ({ ...d, objects: (d.objects || []).filter((o) => o.id !== last.id) }));
  }, [doc.objects, updatePresent, selectedObjectId3D]);

  // The selected room's current tier level (from its benches), for the Tiers UI.
  const activeTiers = Math.max(1, Math.round(doc.benches?.[0]?.tiers || tiers || 1));
  // Merged/drawn rooms carry a polygon outline — 90° rotation doesn't apply to
  // them (the outline IS the shape), so the rotate button is hidden.
  const activeRoomEntry = (doc.rooms || []).find((r) => r.id === doc.activeRoomId);
  const activeHasPolygon = Array.isArray(activeRoomEntry?.polygon) && activeRoomEntry.polygon.length >= 3;
  const activeCanopyMode = ((doc.rooms || []).find((r) => r.id === doc.activeRoomId)?.canopyMode)
    || doc.canopyMode
    || "canopy";

  // The selected room's current bench TYPE, read from its benches so the Bench-type
  // control always reflects the room on screen — not the stale local state after a
  // remount. Mirrors activeTiers / activeBenchWidth. Falls back to local state, then "rolling".
  const activeBenchType = doc.benches?.[0]?.type || benchType || "rolling";

  // When the on-screen room's bench type differs from local state (e.g. after
  // navigating away and back, or switching rooms), adopt the room's type.
  useEffect(() => {
    const roomType = doc.benches?.[0]?.type;
    if (roomType && roomType !== benchType) setBenchType(roomType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.benches]);

  // The selected room's current bench width (ft), read from its benches so the
  // Bench Width control always reflects the room on screen — not the last value set.
  const activeBenchWidth = (() => {
    const w = doc.benches?.[0]?.widthIn;
    if (w && Number.isFinite(w)) return Math.max(2, Math.min(8, Math.round(w / 12)));
    return benchWidth || 4;
  })();

  // The 3D view's Design panel (View3DOverlay → Design3DPanel) edits the
  // SELECTED room through these — the same layout pipeline as every room
  // control above, so the scene, the counts and the cart always agree.
  const activeIsPolygon = (() => {
    const poly = (doc.rooms || []).find((r) => r.id === doc.activeRoomId)?.polygon;
    return Array.isArray(poly) && poly.length >= 3;
  })();
  const gate3d = (fn) => (...args) => (isSubscribed ? fn(...args) : requirePlan());
  const design3d = {
    benchWidthFt: activeBenchWidth,
    tiers: activeTiers,
    benchColumns: benchColumnsOf(doc.benches),
    roomIsPolygon: activeIsPolygon,
    onSetBenchWidth: gate3d(setRoomBenchWidth),
    onSetTiers: gate3d((t) => setRoomBenchConfig("rolling", t)),
    onApplyAisles: gate3d(applyAisles),
    onResizeRoom: gate3d((room) => resizeActiveRoom({ room })),
    onSizeByBenches: gate3d(({ qty, lengthFt }) => resizeActiveRoom({ qty, lengthFt })),
    onAddController: gate3d(addController),
    onRemoveController: gate3d(removeController),
  };
  // The dock's Move toggle: the selected equipment's when one is selected,
  // otherwise the selected room's. Never in walkthrough.
  const move3d = cameraMode === "walkthrough"
    ? null
    : selectedObjectId3D
      ? { what: "item", active: objectMoveMode, onToggle: () => (isSubscribed ? setObjectMoveMode((v) => !v) : requirePlan()) }
      : selectedRoomId3D
        ? { what: "room", active: roomMoveMode, onToggle: () => setRoomMoveMode((v) => !v) }
        : null;

  // The currently-selected placed equipment object (if any) — drives the floating
  // canvas Remove button so equipment can be deleted right where it's selected.
  const selectedObject = selected?.kind === "object"
    ? (doc.objects || []).find((o) => o.id === selected.id)
    : null;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
      else if (e.key.toLowerCase() === "d" && !mod) { duplicateSelected(); }
      else if (e.key.toLowerCase() === "r" && !mod) { rotateSelected(); }
      else if (e.key === "0") { interaction.fitToScreen(); }
      else if (e.key === ";") { setShowDimensions((v) => !v); }
      else if (e.key === "Escape") { setSelected(null); setMultiSelected([]); }
      // Arrow key nudge (12" grid)
      else if (e.key === "ArrowUp") { e.preventDefault(); nudgeSelected(0, -12); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudgeSelected(0, 12); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); nudgeSelected(-12, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudgeSelected(12, 0); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, deleteSelected, duplicateSelected, rotateSelected, setSelected, setMultiSelected, nudgeSelected]);

  // Manual save (button / ⌘S) — routes through the same awaited auto-save write so
  // there's a single persistence path. Adds toast feedback for the explicit action.
  const save = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveNow();
      hasUnsavedChanges.current = false;
      toast.success("Project saved");
    } catch (e) {
      console.error("[Project] save failed:", e);
      toast.error("Save failed");
    }
    setSaving(false);
  };

  const getCursorStyle = (handle) => {
    if (!handle) return undefined;
    const cursors = {
      "rotate": "crosshair",
      "room-e": "ew-resize", "room-w": "ew-resize",
      "room-n": "ns-resize", "room-s": "ns-resize",
      "room-nw": "nwse-resize", "room-se": "nwse-resize",
      "room-ne": "nesw-resize", "room-sw": "nesw-resize",
    };
    return { cursor: cursors[handle] || "move" };
  };

  const exportPng = () => {
    if (!isSubscribed) { requirePlan(); return; }
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `${doc.name.replace(/\s+/g, "_")}.png`; a.click();
    toast.success("Exported PNG");
  };

  const exportCsv = () => {
    if (!isSubscribed) { requirePlan(); return; }
    const rate = typeof user?.electricity_rate === "number" ? user.electricity_rate : undefined;
    exportRoomReportCsv(doc, { rate });
    toast.success("Exported report");
  };

  const exportPdf = () => {
    if (!isSubscribed) { requirePlan(); return; }
    exportRoomPdf(doc);
    toast.success("Exported PDF");
  };

  // Back / leave-studio: AWAIT the full save (cancel pending debounce → force-commit
  // → awaited Project.update) BEFORE navigating, so the dashboard loads the
  // just-saved record on its first view (not the pre-save snapshot). Navigation is
  // blocked until the DB write resolves; the Back button shows "Saving…" meanwhile.
  // On save ERROR we do NOT navigate — we warn the user and stay so the work isn't lost.
  const handleBack = useCallback(async () => {
    // Show the full-screen saving overlay while we AWAIT the full save BEFORE
    // navigating + refetching, so the dashboard loads the just-saved record — not
    // the pre-save snapshot. Invalidating queries before the write resolved was
    // refetching stale data and clobbering the cache, which read as "nothing saved"
    // after leaving the studio.
    setLeavingHome(true);
    try {
      // CRITICAL: Blur the active input BEFORE saving. MeasureInput (room dims,
      // aisles) commits its value on blur — but on mobile, the blur event can fire
      // AFTER the click event that triggered this handler. Without this, dimension
      // changes made right before tapping Home are never dispatched and the save
      // captures stale state. flushSync forces the blur's dispatch to be processed
      // synchronously so docRef.current has the latest value when saveNow runs.
      flushSync(() => {
        const el = document.activeElement;
        if (el && el.tagName === "INPUT" && typeof el.blur === "function") el.blur();
      });
      try {
        if (commitActiveRoomNow) commitActiveRoomNow();
        await saveNow();
        hasUnsavedChanges.current = false;
        savedLayoutSignatureRef.current = persistentLayoutSignature(docRef.current);
      } catch (e) {
        console.error("[Back] save failed:", e);
      }
      // Force the dashboard + project queries to REFETCH (not just mark stale) and
      // wait for the projects list to reload BEFORE navigating, so the card shows the
      // just-saved layout on the first view instead of a pre-save cached snapshot.
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      await qc.refetchQueries({ queryKey: ["projects"] });
      onBack?.();
    } finally {
      setLeavingHome(false); // safety: clear if navigation doesn't unmount fast enough
    }
  }, [saveNow, onBack, qc, projectId]);

  const panelContent = (
    <PanelErrorBoundary>
      <LandscapeSidePanel
        doc={doc}
        updatePresent={updatePresent}
        benchWidth={benchWidth} setBenchWidth={setBenchWidth}
        benchType={benchType} setBenchType={setBenchType}
        tiers={tiers} setTiers={setTiers}
        canopyLightsOn={activeCanopyMode === "canopy"}
        onSetCanopyLights={(on) => setRoomCanopyMode(on ? "canopy" : "none")}
        lightsOn={lightsOn} setLightsOn={setLightsOn}
        lightWidth={lightWidth} setLightWidth={setLightWidth}
        projectId={projectId}
        onSelectRoom={(id) => { setActiveRoom(id); }}
        onRenameRoom={renameRoom}
        onDeleteRoom={deleteRoom}
        onPlaceObject={(type) => { placeObject(type); setPanelOpen(false); }}
      />
    </PanelErrorBoundary>
  );

  return (
    <div className={`flex flex-col w-full max-w-full overflow-hidden ${lockedMode ? "h-full" : "phone-safe-frame h-[100dvh]"} ${lockedMode === "3d" ? "bg-[#151517]" : "bg-background"}`}>
      {/* Saving-before-Home overlay — reuses the cannabis-leaf loader so the
          save+refetch wait reads as working, not frozen. */}
      {leavingHome && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <LeafLoader label="Saving your layout…" reducedMotion={prefersReducedMotion} />
        </div>
      )}

      {/* Dev-only room-flow diagnostics (OFF by default). */}
      {DEBUG_ROOM_FLOW && (
        <div className="fixed bottom-2 left-2 z-[300] pointer-events-none rounded bg-black/70 text-white text-[10px] font-mono p-2 max-w-[260px] leading-tight">
          <div>activeRoomId: {doc.activeRoomId || "null"}</div>
          <div>selectedRoomId3D: {selectedRoomId3D || "null"}</div>
          <div>roomMoveMode2D: {String(roomMoveMode2D)}</div>
          <div>roomMoveMode3D: {String(roomMoveMode)}</div>
          <div>roomDragging: {String(roomDragging)}</div>
          <div>mode3d: {String(mode3d)}</div>
          <div>saving: {String(saving)} · leavingStudio: {String(leavingHome)}</div>
          <div>saveStatus: {String(saveStatus)}</div>
          <div>offset: {JSON.stringify(doc.rooms?.find((r) => r.id === doc.activeRoomId)?.offset || null)}</div>
        </div>
      )}
      {!lockedMode && <TopToolbar
        canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo}
        zoomBy={interaction.zoomBy} fitToScreen={interaction.fitToScreen}
        showDimensions={showDimensions} setShowDimensions={setShowDimensions}
        onDuplicate={duplicateSelected} onDelete={deleteSelected} onRotate={rotateSelected}
        hasSelection={!!selected} mode3d={mode3d} lockedMode={lockedMode}
        setMode3d={async (v) => {
          if (lockedMode) return;
          if (v && !isSubscribed) { requirePlan(); return; }
          if (v) saveNow().catch((e) => console.error("[3D] pre-switch save failed:", e));
          setMode3d(v);
        }}
        onAddRoom={addRoom}
        onSave={save} onExport={exportPng} onExportCsv={exportCsv} onExportPdf={exportPdf} saving={saving}
        saveStatus={saveStatus} savedAt={savedAt} saveError={saveError} onRetrySave={saveNow}
        onBack={onBack ? handleBack : null} projectName={doc.name} projectCustomer={doc.customer}
        onChangeName={(v) => updatePresent((d) => ({ ...d, name: v }), { transient: true })}
        onChangeCustomer={(v) => updatePresent((d) => ({ ...d, customer: v }), { transient: true })}
        fullscreen={fullscreen} setFullscreen={setFullscreen}
        warnings={warnings}
        isSubscribed={isSubscribed}
        adUnlocked3d={ad3dUnlocked}
        onUpgrade={() => navigate("/pricing")}
      />}

      <div className="flex flex-1 min-h-0 w-full max-w-full min-w-0 overflow-x-hidden relative">
        <main className={`flex flex-col min-w-0 flex-1`}>
          <div ref={containerRef}
            className="relative flex-1 min-h-0 overflow-hidden touch-none"
            style={getCursorStyle(hoveredHandle)}
            onMouseDown={!mode3d ? interaction.onPointerDown : undefined}
            onMouseMove={!mode3d ? interaction.onPointerMove : undefined}
            onMouseUp={!mode3d ? interaction.onPointerUp : undefined}
            onMouseLeave={!mode3d ? interaction.onPointerUp : undefined}
            onWheel={!mode3d ? interaction.onWheel : undefined}
            onTouchStart={!mode3d ? interaction.onPointerDown : undefined}
            onTouchMove={!mode3d ? interaction.onPointerMove : undefined}
            onTouchEnd={!mode3d ? interaction.onPointerUp : undefined}
          >

            {mode3d ? (
              <>
              <Walkthrough3D
                doc={doc}
                mode="orbit"
                lightMode="grow"
                captureRef={capture3dRef}
                updatePresent={updatePresent}
                projectId={projectId}
                onExit2D={() => setMode3d(false)}
                visibility={layerVisibility}
                selectedRoomId={selectedRoomId3D || doc.activeRoomId}
                roomMoveMode={roomMoveMode}
                objectMoveMode={objectMoveMode}
                onSelectRoom={(id) => { setSelectedObjectId3D(null); setSelectedRoomId3D(id); setActiveRoom(id); }}
                onMoveRoom={(roomId, offset) => isSubscribed ? moveRoom3D(roomId, offset) : requirePlan()}
                selectedObjectId={selectedObjectId3D}
                onSelectObject={(id) => { setSelectedRoomId3D(null); setSelectedObjectId3D(id); }}
                activateRoomForObject={activateRoomForObject}
                onDragObject={(objId, x, y, opts) => isSubscribed ? dragObject(objId, x, y, opts) : requirePlan()}
                onRotateObject={(objId, deg) => isSubscribed ? rotateObjectById(objId, deg) : requirePlan()}
                onSetObjectHeight={(objId, h) => isSubscribed ? setObjectHeight(objId, h) : requirePlan()}
                onSetObjectSpec={(objId, k, v) => isSubscribed ? setObjectSpecById(objId, k, v) : requirePlan()}
                onDeleteObject={(objId) => isSubscribed ? deleteObjectById(objId) : requirePlan()}
                selectedObject3D={selectedObject3D}
                cameraMode={cameraMode}
                onChangeCameraMode={setCameraMode}
                benchType={activeBenchType}
                onSetBenchType={setRoomBenchType}
                onSetLightModel={(key) => isSubscribed ? setRoomLightModel(key) : requirePlan()}
                onSetSpectrum={(levels, opts) => isSubscribed ? setRoomSpectrum(levels, opts) : requirePlan()}
                onSetCanopyMode={(key) => isSubscribed ? setRoomCanopyMode(key) : requirePlan()}
                onSlideAisle={(plan) => { if (!isSubscribed) { requirePlan(); return false; } return slideRoomAisle(plan); }}
                onSetCeiling={(inches) => isSubscribed ? setRoomCeiling(inches) : requirePlan()}
                onSetTiers={(tiers) =>
                  updatePresent((d) => ({ ...d, benches: (d.benches || []).map((b) => ({ ...b, tiers })) }))
                }
                // The Design panel's room / aisle / bench / controller handlers, and
                // the Move toggle the dock shows for the selected room or item.
                design={design3d}
                move={move3d}
                actions={actions3d}
                loader={loader3d}
              />
              </>
            ) : null}

            {!mode3d ? (
              <PlanCanvas
                doc={doc}
                viewport={interaction.viewport}
                selected={selected}
                multiSelected={multiSelected}
                showDimensions={showDimensions}
                containerRef={containerRef}
                guides={guides}
                roomGuides={roomGuides}
                hoveredHandle={hoveredHandle}
                clearanceViolations={getClearanceViolations()}
                visibility={layerVisibility}
                warnings={warnings}
                roomDragging={roomDragging}
                rotateFlash={rotateAnimating}
                roomMoveMode2D={roomMoveMode2D}
                lineGhosts={lineGhosts}
              />
            ) : null}

            {/* Placement Mode indicator — 2D only. Tap places one; drag lays a row. */}
            {!mode3d && placement && (
              <PlacementBadge type={placement} onDone={endPlacement} />
            )}

            {/* Merge mode — tap the adjacent room to merge with the active one. */}
            {!mode3d && mergeMode && (
              <MergeRoomsOverlay
                doc={doc}
                viewport={interaction.viewport}
                onPick={pickMergeTarget}
                onCancel={() => setMergeMode(false)}
              />
            )}

            {/* Draw Custom Room mode — grid-snapped rectilinear outline drawing. */}
            {!mode3d && drawMode && (
              <DrawRoomOverlay
                viewport={interaction.viewport}
                onComplete={completeDrawRoom}
                onCancel={() => setDrawMode(false)}
              />
            )}

            {/* Floating top-left controls — 2D only.
                Row: Add Equipment + Aisle (between Add Equipment and Controls).
                Directly under Add Equipment: Tiers. One editor open at a time;
                opening any closes the others. */}
            {!mode3d && (
              <div
                className={`absolute left-3 ${isMobile ? "right-1" : "right-auto"} ${activePanel ? "z-50" : "z-30"} flex flex-col gap-3 items-start ${!isSubscribed ? "opacity-60" : ""}`}
                style={{ top: "10px" }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <div className="flex w-full items-start justify-between gap-1 pr-2">
                  <div />
                  <div className="flex items-start justify-end gap-1">
                    <AisleEditor
                      open={activePanel === "aisle"}
                      onOpen={() => isSubscribed ? setActivePanel("aisle") : requirePlan()}
                      onClose={() => setActivePanel(null)}
                      settings={doc.settings}
                      onApply={applyAisles}
                    />
                    <TiersButton
                      open={activePanel === "tiers"}
                      onOpen={() => isSubscribed ? setActivePanel("tiers") : requirePlan()}
                      onClose={() => setActivePanel(null)}
                      tiers={activeTiers}
                      benchType={activeBenchType}
                      onSet={(bt, t) => { setRoomBenchConfig(bt, t); }}
                    />
                    {!fullscreen && (
                      <button
                        onClick={() => setPanelOpen(true)}
                        className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold leading-none ${isMobile ? "w-10 px-0" : "px-4"} shadow-lg active:scale-95 transition-transform`}
                        aria-label="Open rooms"
                      >
                        <SlidersHorizontal className="w-4 h-4 shrink-0" />
                        {!isMobile && <span className="leading-none">Rooms</span>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Floating bottom toolbar — Add Room / Rotate / Delete. 2D only.
                CRITICAL: the canvas hit-test fires on pointer-DOWN/touch-START
                underneath this bar. Stopping those events at the wrapper keeps any
                button press from reaching the canvas and re-selecting whichever
                room sits beneath the button — so Rotate/Delete always act on the
                already-selected (active) room. */}
            {!mode3d && (
              <div
                // Wraps on narrow phones — a single non-wrapping row pushed the
                // Merge / Draw / Rotate / Delete buttons off the right edge.
                className="absolute left-3 right-3 bottom-3 z-30 flex flex-wrap items-center gap-2"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); isSubscribed ? addRoom() : requirePlan(); }}
                    className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold leading-none px-4 shadow-2xl active:scale-95 transition-transform ${!isSubscribed ? "opacity-60" : ""}`}
                    aria-label="Add room to facility"
                  >
                    <PlusSquare className="w-4 h-4 shrink-0" />
                    <span className="leading-none">Add Room</span>
                  </button>
                  {(doc.rooms?.length || 0) >= 2 && doc.activeRoomId && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); isSubscribed ? setMergeMode(true) : requirePlan(); }}
                      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full border-2 border-primary/60 bg-card text-primary text-xs font-bold leading-none px-3.5 shadow-2xl active:scale-95 transition-transform ${!isSubscribed ? "opacity-60" : ""}`}
                      aria-label="Merge with an adjacent room"
                    >
                      <Combine className="w-4 h-4 shrink-0" />
                      <span className="leading-none">Merge</span>
                    </button>
                  )}
                  {/* Draw and Rotate buttons removed from the 2D plan (owner request). */}
                  <DeleteRoomButton
                    roomName={doc.rooms?.find((r) => r.id === doc.activeRoomId)?.name || doc.name}
                    onDelete={() => isSubscribed ? deleteRoom(doc.activeRoomId) : requirePlan()}
                    disabled={(doc.rooms?.length || 0) <= 1}
                  />
                  {/* Explicit 2D Move toggle — only while a room is selected. OFF = the
                      room is locked (tap to select); ON = drag the selected room. Turns
                      OFF automatically after a successful drop. */}
                  {doc.activeRoomId && (
                    <MoveRoomToggle
                      active={roomMoveMode2D}
                      onToggle={() => isSubscribed ? setRoomMoveMode2D((v) => !v) : requirePlan()}
                    />
                  )}
              </div>
            )}

            {/* Floating Remove button — appears when a placed equipment object is
                selected, 2D only. Deletes that object right on the canvas. */}
            {!mode3d && selectedObject && (
              <SelectedObjectRemove object={selectedObject} onRemove={deleteSelected} onRotate={rotateSelectedObject} onSetSpec={setSelectedObjectSpec} />
            )}



          </div>

        </main>

        {/* Rooms panel is a slide-over drawer on every screen size, opened by the
            "Rooms" button, so the 2D plan gets the full width. */}
        {!fullscreen && !mode3d && (
          <>
            <div
              onClick={() => setPanelOpen(false)}
              className={`absolute inset-0 z-30 bg-black/40 transition-opacity duration-300 ${panelOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            />
            <aside
              className={`absolute top-0 right-0 bottom-0 z-40 w-[88%] max-w-[360px] overflow-x-hidden bg-card border-l shadow-2xl flex flex-col transition-transform duration-300 ease-out ${panelOpen ? "translate-x-0" : "translate-x-full"}`}
            >
              <div className="flex items-center justify-between px-4 h-12 border-b shrink-0">
                <span className="text-sm font-semibold">Rooms</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted touch-target"
                  aria-label="Close controls"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
                {panelContent}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}