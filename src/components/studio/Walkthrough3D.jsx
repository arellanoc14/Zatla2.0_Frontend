import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { benchRect, computeClearances } from "@/lib/growroom/clearances";
import { containDoc } from "@/lib/growroom/containment";

import { buildDimensions, buildClearanceDimensions, buildPolygonDimensions } from "@/lib/growroom/dimensions";
import { formatLength } from "@/lib/growroom/units";
import { loadGLB, fitModelToFootprint } from "@/lib/growroom/glbModel";
import { growLightPlacements, BENCH_HAS_BUILTIN_LIGHT, TIER_GLB_HAS_BUILTIN_LIGHT, getTierLightYLevels, getTierLightWidthScales, getTierRackTargetH, TIER_VERTICAL_PITCH_IN, minCeilingForTiers } from "@/lib/growroom/growLightFit";
import { WALL_FACE_OUT_IN } from "@/lib/growroom/walls";
import { canopyLightPlacements, BENCH_HAS_BUILTIN_CANOPY, renderCanopyLayer, deckYForTier, UCL_BAR } from "@/lib/growroom/canopyLightFit";
import { plantGrid, deckWidthScale, plantYawJitter, RENDER_PLANTS_IN_3D } from "@/lib/growroom/plantLayout";
import { renderPlantField, resolvePlantUrl } from "@/lib/growroom/plantField";
import { createPerfHud, perfHudEnabled, startLongTaskWatch, getLongTasks } from "@/lib/growroom/perfHud";
import { runSpeedTest } from "@/lib/growroom/speedTest";
import { capModelTriangles } from "@/lib/growroom/glbSimplify";
import { canopyTrisPerFixture } from "@/lib/growroom/lightLod";
import { applyBenchMaterials, applyZatlaBenchFinish } from "@/lib/growroom/benchMaterials";
import { flattenGroupByMaterial, instanceParts, bakePartsPerBench } from "@/lib/growroom/instanceGroup";
import { buildScaffoldBench } from "@/lib/growroom/scaffoldBench";
import { loadLightTexture, buildLightTexturePlane } from "@/lib/growroom/lightTexture";
import { buildRoomWalls } from "@/lib/growroom/walls";
import { roomCollides } from "@/lib/growroom/facility";
import { snapToWall, clampPosToRoom, containBoxInRoom, HALF_WALL, WALL_SNAP_NEAR } from "@/lib/growroom/room3dGeom";
import { buildEquipmentMesh, FAN_MOUNT_Y } from "@/lib/growroom/equipment3d";
import { effectiveHeightY, clampHeightY } from "@/lib/growroom/equipmentHeight";
import { smartObjectSize } from "@/lib/growroom/smartObjects";
import { swapFloorEquipmentGlb, swapWallEquipmentGlb, swapDuctingGlb } from "@/lib/growroom/equipmentGlbSwap";
import { equipmentGlbUrlForType } from "@/lib/growroom/equipmentGlbUrl";
import { LAYER_IDS, isLayerHidden, isObjectHidden } from "@/lib/growroom/layers";
import { buildRoomHighlight } from "@/lib/growroom/roomHighlight";
import { addWalkthroughLightingRig } from "@/lib/growroom/lightingRig";
import { setSceneBackdrop } from "@/lib/growroom/sceneBackdrop";
import { setShadowFlags } from "@/lib/growroom/shadowFlags";
import { buildFacilityFloor, getBenchContactMaterial } from "@/lib/growroom/facilityFloor";
import { defaultCamDir, fitCameraToBox } from "@/lib/growroom/cameraFit";
import { buildRoomCeiling } from "@/lib/growroom/roof";
import { addRoomFloor } from "@/lib/growroom/roomFloor";
import { computeDocKey, computeRoomOffsetsKey, computeTierMode } from "@/lib/growroom/docKeys";
import { createRoomDragOverlay } from "@/lib/growroom/roomDragOverlay";
import { createRoomLights } from "@/lib/growroom/roomLights";
import { createRoomEmission } from "@/lib/growroom/roomEmission";
import { createUclEmission } from "@/lib/growroom/uclEmission";
import { createEquipmentInteraction } from "@/lib/growroom/equipmentInteraction";
import { aisleOf, planColumnSlide } from "@/lib/growroom/mobileAisle";
import { createColumnSlide } from "@/lib/growroom/columnSlide3d";
import { createWalkthroughPointer } from "@/lib/growroom/walkthroughPointer";
import View3DOverlay from "./View3DOverlay";
import { heatRgbVivid } from "@/lib/lighting/ppfdColor";
import { specSheetFor, fillGrid, gridStats } from "@/lib/lighting/ppfdMaps";
import Equipment3DControls from "./Equipment3DControls";
import Zoom3DControls from "./Zoom3DControls";
import ZatlaLoader3D from "@/components/studio/ZatlaLoader3D";
import useBenchSwapFade from "@/components/studio/useBenchSwapFade";

// Display scale applied to the fan / controller .glb fits (same as GrowStudios).
const AUTO_FAN_SCALE = 0.7;
const AUTO_CONTROLLER_SCALE = 0.7;

// 3D walkthrough rendered from the same doc model with plain three.js.
// Orbit + first-person (WASD + drag-look) navigation.
export default function Walkthrough3D({ doc: docRaw, mode, lightMode, onSetTiers, updatePresent, projectId, onExit2D, captureRef, visibility, cameraMode = "orbit", onChangeCameraMode, onSceneReady, onSelectRoom, selectedRoomId = null, roomMoveMode = false, objectMoveMode = false, benchType, onSetBenchType, onSetLightModel, onSetSpectrum, onSetCanopyMode, onSetCeiling, onMoveRoom, onSlideAisle, selectedObjectId = null, onSelectObject, activateRoomForObject, onDragObject, onRotateObject, onSetObjectHeight, onSetObjectSpec, onDeleteObject, selectedObject3D = null, design = null, move = null, actions = null, loader = null }) {
  // Keep the latest handlers in refs so the stable build() closure always calls the
  // current handler without needing a scene rebuild.
  const onSelectRoomRef = useRef(onSelectRoom);
  useEffect(() => { onSelectRoomRef.current = onSelectRoom; }, [onSelectRoom]);
  const onMoveRoomRef = useRef(onMoveRoom);
  useEffect(() => { onMoveRoomRef.current = onMoveRoom; }, [onMoveRoom]);
  // Mobile aisle: commits a tapped column's slide (mobileAisle.js). Returns false
  // when the commit was refused, so the animation is put back.
  const onSlideAisleRef = useRef(onSlideAisle);
  useEffect(() => { onSlideAisleRef.current = onSlideAisle; }, [onSlideAisle]);
  // Bumped right before a slide commits. It rides in benchSwapKey, so the
  // rebuild that commit triggers is masked by the bench-swap snapshot fade —
  // the snapshot is the slide's last frame, which the rebuild then matches.
  const slideSeqRef = useRef(0);
  // Equipment interaction handlers — kept in refs so the stable build() closure
  // always calls the current handler without a scene rebuild.
  const onSelectObjectRef = useRef(onSelectObject);
  useEffect(() => { onSelectObjectRef.current = onSelectObject; }, [onSelectObject]);
  const activateRoomForObjectRef = useRef(activateRoomForObject);
  useEffect(() => { activateRoomForObjectRef.current = activateRoomForObject; }, [activateRoomForObject]);
  const onDragObjectRef = useRef(onDragObject);
  useEffect(() => { onDragObjectRef.current = onDragObject; }, [onDragObject]);
  // Live selected equipment id so the build() closure can ignore taps on the
  // already-selected object and drive the selection outline.
  const selectedObjectIdRef = useRef(selectedObjectId);
  useEffect(() => { selectedObjectIdRef.current = selectedObjectId; }, [selectedObjectId]);
  // Exposed by build() → the equipment interaction API (register/unregister/
  // outline/pick/drag). Used by both the build path and the selection effect.
  const equipApiRef = useRef(null);
  // Published by build() → per-room grow-light fixture groups; a light-model
  // change crossfades the changed room's fixtures in place (no rebuild).
  const lightApiRef = useRef(null);
  const emissionApiRef = useRef(null);
  const uclEmissionsRef = useRef(null);
  // Published by build(): the PPFD layer — the grow light's printed spec-sheet
  // map laid over every fixture (setVisible / tick / recompute / dispose).
  const ppfdApiRef = useRef(null);
  // PPFD layer on/off (the dock's PPFD button), read by build() for new tiles.
  const ppfdOverlayRef = useRef(false);
  const onPpfdOpenChange = useCallback((on) => {
    ppfdOverlayRef.current = on;
    ppfdApiRef.current?.setVisible(on);
  }, []);
  const [beamsOn, setBeamsOn] = useState(true);
  const beamsOnRef = useRef(true);
  // The photons are the only thing in the scene that animates continuously, and a
  // continuous animation forces a full-scene redraw every frame. So they run only
  // while the Spectrum panel is open or the Photons toggle is on (otherwise the
  // scene renders on demand and idles at zero GPU work). See roomEmission.js.
  const [photonsOn, setPhotonsOn] = useState(false);
  const [spectrumOpen, setSpectrumOpen] = useState(false);
  const animatingRef = useRef(false);
  // "Stats" readout (draw calls, triangles, redraws/s) — measure lag, don't guess.
  const [perfOn, setPerfOn] = useState(() => perfHudEnabled());
  const perfHudRef = useRef(null);
  // Set by build(): runs the in-app rendering speed test on the live scene.
  const speedApiRef = useRef(null);
  useEffect(() => { startLongTaskWatch(); }, []);
  // Phones get the same Light beams / Photons toggles as desktop (the scene is
  // the same scene everywhere now).
  const isMobileUi = false;
  // True while a room drag is in progress — the docKey rebuild effect SKIPS
  // rebuilding mid-drag (no blink); only the post-release commit rebuilds.
  const draggingRef = useRef(false);
  // Loading overlay shows ONLY on the first mount build.
  const hasBuiltOnceRef = useRef(false);
  // Set by build(): resolves when every model it queued (benches, lights, UCLs,
  // fans) has loaded, so the first reveal and every bench-swap crossfade wait for
  // all of them together.
  const allModelsReadyRef = useRef(null);
  // The loading screen is still up and waiting for the current build's models.
  const revealPendingRef = useRef(false);
  const revealDeadlineRef = useRef(0);
  const revealCapsRef = useRef([]);
  // WebGL renderer + canvas reused across rebuilds, disposed only on unmount.
  const rendererRef = useRef(null);
  // Saved camera pose preserved across rebuilds so adding equipment never re-frames.
  const camPoseRef = useRef(null);
  // Pending cinematic intro glide — set on the FIRST build only (when there's no
  // saved pose), consumed once the scene/controls are ready to kick the fly-in.
  const introPendingRef = useRef(null);
  // Exposed by build() → selection effect toggles highlight + re-frames camera in place.
  const selectApiRef = useRef(null);
  // Exposed by build() → reconciles each room's committed rooms[].offset onto its
  // pivot group's position IN PLACE (no rebuild), after a commit/undo.
  const roomGroupsApiRef = useRef(null);
  // Live ref of the selected/active room id so build() can ignore a tap on the
  // already-selected room.
  const selectedRoomIdRef = useRef(selectedRoomId);
  useEffect(() => { selectedRoomIdRef.current = selectedRoomId; }, [selectedRoomId]);
  // Explicit "Move" mode: room only drags when true (mobile gesture gate).
  const roomMoveModeRef = useRef(roomMoveMode);
  useEffect(() => { roomMoveModeRef.current = roomMoveMode; }, [roomMoveMode]);
  // Explicit "Move" mode for equipment objects: a selected object only drags when
  // this is ON (mirrors roomMoveMode). Kept in a ref so the stable pointer closure
  // reads the live value without a scene rebuild.
  const objectMoveModeRef = useRef(objectMoveMode);
  useEffect(() => { objectMoveModeRef.current = objectMoveMode; }, [objectMoveMode]);
  // Exposed by build() → Move-mode effect swaps the one-finger touch mapping in place.
  const touchModeApiRef = useRef(null);
  const doc = docRaw; // overlay/stats UI; build() uses a containment-clamped copy.
  // Live ref to the current doc so the stable build() closures (the room drag
  // handler) always read the just-committed data without a scene rebuild.
  const docRef = useRef(docRaw);
  useEffect(() => { docRef.current = docRaw; }, [docRaw]);
  const mountRef = useRef(null);
  // Camera mode ("orbit" | "topdown" | "walkthrough") kept in a ref so the stable
  // build() closure always reads the current mode, and an outer effect can trigger
  // a smooth animated transition without rebuilding the scene.
  const cameraModeRef = useRef(cameraMode);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  // Exposed by build() → lets the camera-mode effect animate the camera between
  // modes (perspective orbit ↔ ortho top-down ↔ first-person walkthrough).
  const cameraApiRef = useRef(null);
  const zoomApiRef = useRef(null);
  const sceneApiRef = useRef(null);
  // Published by build() → shows ONLY the selected room's dimension holder while
  // the Dimensions toggle is ON (dimensions are room-scoped in 3D, like lights/tiers).
  const dimsApiRef = useRef(null);
  const showDimensionsRef = useRef(true);
  const [loading, setLoading] = useState(true);
  // The ZATLA loading screen stays mounted just long enough to fade out over the finished scene.
  const [loaderGone, setLoaderGone] = useState(false);
  useEffect(() => {
    if (loading) { setLoaderGone(false); return undefined; }
    const t = setTimeout(() => setLoaderGone(true), 1000);
    return () => clearTimeout(t);
  }, [loading]);
  // OS reduced-motion preference — drives the branded loader's spin vs. pulse.
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [showDimensions, setShowDimensions] = useState(true);
  // "Cut" view: when on, the near walls are culled so you can see straight into the
  // room (display-only). Off (default) = all four walls solid. Kept in a ref so the
  // stable render loop reads the live value without a scene rebuild.
  const [cutWalls, setCutWalls] = useState(true);
  const cutWallsRef = useRef(true);
  useEffect(() => {
    cutWallsRef.current = cutWalls;
    sceneApiRef.current?.invalidate?.();
  }, [cutWalls]);
  const [stats, setStats] = useState(null);
  // Surfaces any error thrown during the synchronous scene build so a failure
  // shows a readable message instead of a silent blank canvas.
  const [buildError, setBuildError] = useState(null);
  // Set when the GPU drops the WebGL context — almost always a memory-pressured
  // phone. Once lost, the canvas is dead: every later frame draws nothing, which
  // reads as an unexplained black viewport. Surface a message + reload instead.
  const [contextLost, setContextLost] = useState(false);
  // Bench-swap crossfade (see useBenchSwapFade): masks a bench type/tier rebuild
  // with a snapshot overlay that fades out once the new bench GLBs are loaded.
  const { benchFade, maybeBeginFade, onBenchesReadyRef, disposeFadeTimer } = useBenchSwapFade();
  // Current tier value shown in the toggle (most common tier among benches).
  const tierMode = computeTierMode(doc.benches);
  // Stable serialized keys (see docKeys.js): docKey rebuilds the scene only on
  // structural data changes; roomOffsetsKey reconciles pure offset moves in place.
  const docKey = computeDocKey(doc, visibility);
  const roomOffsetsKey = computeRoomOffsetsKey(doc);

  // Per-room grow-light model signature — kept OUT of docKey (like offsets) so a
  // model change crossfades that room's fixtures in place instead of rebuilding.
  const roomLightKey = JSON.stringify([
    (doc.rooms || []).map((rm) => [rm.id, rm.lightModel || "phoenix", rm.spectrum || null]),
    doc.lightModel || "phoenix",
  ]);

  // Bench type/tier signature — when THIS changes across a rebuild, the rebuild
  // was driven by a bench swap, so the snapshot crossfade masks it.
  // A committed column slide (slideSeqRef) counts as a swap too: the active
  // room's bench positions ride in the key, so the rebuild is masked.
  const benchSwapKey = JSON.stringify([
    (doc.benches || []).map((b) => [b.type || "rolling", b.tiers || 1, Math.round(b.pos?.x || 0), Math.round(b.pos?.y || 0)]),
    (doc.rooms || []).map((rm) => (rm.benches || []).map((b) => [b.type || "rolling", b.tiers || 1])),
    slideSeqRef.current,
  ]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    // A drag moves the mesh directly — never rebuild mid-drag; the release commit
    // clears this flag before changing doc.objects so the next docKey rebuilds clean.
    if (draggingRef.current) return;

    const isFirstBuild = !hasBuiltOnceRef.current;
    // Bench TYPE/TIER swap → snapshot-crossfade this rebuild (no-op otherwise).
    maybeBeginFade(benchSwapKey, rendererRef.current, isFirstBuild);
    if (isFirstBuild) setLoading(true); // spinner only on the initial mount build
    let disposed = false;
    let cleanup = () => {};

    // Defer the heavy scene build one frame so the spinner paints first.
    const initTimer = setTimeout(() => {
      if (disposed) return;
      try {
        cleanup = build();
      } catch (err) {
        console.error("[Walkthrough3D] scene build failed:", err);
        setBuildError(err?.message || String(err));
      }
      hasBuiltOnceRef.current = true;
      // The loading screen stays up until EVERY model of the first build — benches,
      // grow lights, under-canopy lights, fans — is on screen, so the scene appears
      // all at once instead of lights floating before their benches arrive. A hard
      // cap so a stalled download can never leave the screen up for good.
      //
      // The scene is usually built TWICE on load: once straight away, then again
      // when the model library arrives (that rebuild swaps in the real benches).
      // So the screen waits on whichever build is CURRENT: a build that is torn
      // down before its models finish never reveals, and the rebuild that
      // replaced it takes over the wait. Benches, grow lights and UCLs then all
      // fade in together.
      if (isFirstBuild) { revealPendingRef.current = true; revealDeadlineRef.current = performance.now() + 25000; }
      if (revealPendingRef.current) {
        const ready = allModelsReadyRef.current;
        const reveal = () => {
          if (disposed || !revealPendingRef.current) return;
          revealPendingRef.current = false;
          setLoading(false);
        };
        // A short beat so the GPU draws the finished scene under the cover first.
        // A build made before the model library arrived draws placeholder benches
        // and is about to be replaced - it never lifts the screen (the cap still can).
        if (docRaw?.globalModels && allModelsReadyRef.current) ready.then(() => setTimeout(reveal, 120), reveal);
        const left = Math.max(0, revealDeadlineRef.current - performance.now());
        const cap = setTimeout(() => { revealPendingRef.current && !disposed && (revealPendingRef.current = false, setLoading(false)); }, left);
        revealCapsRef.current.push(cap);
      }
      if (!disposed) onSceneReady?.();
    }, 0);

    function build() {
    // Render-time containment pass: clamp every bench/light/equipment fully inside
    // the room envelope (with wall clearance) so no geometry clips through walls.
    const doc = containDoc(docRaw);
    // Layer visibility (view-only). Hidden layers skip mesh creation entirely so
    // their objects are invisible AND unselectable, without ever touching data.
    const vis = visibility || {};
    const benchesHidden = isLayerHidden(vis, LAYER_IDS.BENCHES);
    const lightsHidden = isLayerHidden(vis, LAYER_IDS.LIGHTS);
    // Model resolution: the live GlobalModels library is the SINGLE SOURCE OF TRUTH
    // for every shared model slot (the five bench-type GLBs, wall, light texture).
    // We intentionally do NOT merge docRaw.models on top — a project's stored copy
    // of those URLs goes stale the moment the library model is swapped, which would
    // pin the old mesh. By reading globalModels at render time, changing a model in
    // the library updates what renders here on the next view rebuild, with no manual
    // re-save. We still fall back to any project-level value ONLY for a slot the
    // library leaves empty, so nothing that used to render disappears.
    // liveModels is left undefined (not defaulted to {}) so we can tell "library
    // hasn't loaded yet" apart from "library loaded and this slot is empty" — both
    // look the same once you default to {} or use `||`, which used to make an
    // explicit removal (set to null) fall back to the project's stale cached copy
    // instead of actually clearing the model.
    const liveModels = docRaw.globalModels;
    const projModels = docRaw.models || {};
    const SHARED_SLOTS = ["rollingBenchUrl", "doubleTierUrl", "tripleTierUrl", "frontBenchUrl", "wallUrl", "lightTextureUrl", "fanUrl", "acUrl", "co2TankUrl", "dehumidifierUrl", "ductingUrl", "growLightUrl", "uclUrl", "uclStandUrl", "canopyLightUrl", "airCirculationUrl", "griffinUrl", "ultraUrl", "chameleonUrl", "eagleUrl", "akHbUrl", "controllerUrl", "cannabisPlantUrl"];
    const models = { ...projModels };
    SHARED_SLOTS.forEach((slot) => {
      // Once the library has loaded, it is the single source of truth for this
      // slot — including an explicit removal (null). Only fall back to the
      // project's cached copy before the library has loaded at all.
      models[slot] = liveModels ? (liveModels[slot] || null) : (projModels[slot] || null);
    });
    // Test hook (scripts/perf): lets the speed tests inject model URLs (e.g. a canopy
    // light) without uploading anything. Unset in normal use.
    if (typeof window !== "undefined" && window.__zatlaTestModels) Object.assign(models, window.__zatlaTestModels);
    const scene = new THREE.Scene();
    // Async GLB loads may resolve after unmount — guard adds against a torn-down scene.
    let sceneDisposed = false;

    // Optional grow-light image texture applied as the top-facing surface of each
    // fixture. Loaded once; its native aspect ratio is measured so the plane fits
    // the fixture footprint without distortion. Falls back to default when absent.
    const lightTexUrl = models.lightTextureUrl || null;
    // Under-canopy: the ZATLA UCL (uclUrl) — or a legacy canopyLightUrl import —
    // and the UCL on stands (uclStandUrl) for the "canopyStand" mode.
    const canopyLightUrl = models.uclUrl || models.canopyLightUrl || null;
    const uclStandUrl = models.uclStandUrl || null;
    const airCirculationUrl = models.airCirculationUrl || null;
    let lightTex = null;
    let lightTexAspect = 1;
    const lightTexReady = lightTexUrl
      ? new Promise((resolve) => {
          lightTex = loadLightTexture(lightTexUrl);
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { lightTexAspect = (img.naturalWidth || 1) / (img.naturalHeight || 1); resolve(); };
          img.onerror = () => resolve();
          img.src = lightTexUrl;
        })
      : Promise.resolve();
    // Place an uploaded .glb at each placement, auto-fit to the given footprint.
    // Geometry is untouched — only the wrapping group is scaled/positioned, so the
    // model drops into the SAME spot/size as the procedural object it replaces.
    // Bench-swap crossfade support: every bench/canopy GLB load promise is
    // collected so the snapshot overlay fades out only once the new models are
    // actually on screen (no blank gap, no hard pop).
    const benchLoadPromises = [];
    const placeModel = (url, footprintW, footprintL, placements, baseY, group, opts = {}) => {
      benchLoadPromises.push(loadGLB(url).then((sceneObj) => {
        if (sceneDisposed) return;
        placements.forEach((p) => {
          const holder = fitModelToFootprint(sceneObj, footprintW, footprintL, opts);
          holder.position.set(p.x, (p.y ?? baseY ?? 0), p.z);
          if (p.rotationY) holder.rotation.y = p.rotationY;
          if (p.benchId) holder.userData.benchId = p.benchId; // a column slide moves it with its bench
          // Assign realistic grow-room PBR materials by mesh name (the GLB ships
          // untextured), then track each new material for disposal.
          applyBenchMaterials(holder);
          if (opts.benchFinish) applyZatlaBenchFinish(holder);
          holder.traverse((o) => {
            if (o.isMesh) trackMat(o.material);
          });
          group.add(holder);
        });
        console.log("[GLB] model rendered", { url: url.substring(url.lastIndexOf("/") + 1), count: placements.length });
        invalidate();
      }).catch((err) => {
        console.error("[GLB] render failed", { url: url.substring(url.lastIndexOf("/") + 1), message: err?.message || err?.toString?.() });
        console.error(err);
      }));
    };
    // Canopy layer batching. renderCanopyLayer used to call placeModel for every bench
    // and tier, which CLONES the canopy model per fixture (2 per bench per tier, each a
    // set of draw calls). Instead each call just records its placements here, and
    // flushCanopyBatches() (after the bench loop) draws every identical fixture as ONE
    // InstancedMesh per material (merged meshes on phones) from a model capped to its
    // share of the canopy triangle budget.
    const canopyBatches = new Map();
    // UCL LED chase layers (one per canopy batch) — see uclEmission.js.
    const uclEmissions = [];
    const placeCanopyBatched = (url, fw, fl, placements, baseY, group, opts = {}) => {
      const key = `${url}|${fw}|${fl}|${JSON.stringify(opts)}|${group.uuid}`;
      let b = canopyBatches.get(key);
      if (!b) { b = { url, fw, fl, opts, group, list: [] }; canopyBatches.set(key, b); }
      placements.forEach((p) => b.list.push({ x: p.x, y: p.y ?? baseY ?? 0, z: p.z, rotationY: p.rotationY || 0, benchId: p.benchId }));
    };
    const flushCanopyBatches = () => {
      let total = 0;
      canopyBatches.forEach((b) => { total += b.list.length; });
      const perFixture = canopyTrisPerFixture(total, isMobile);
      // Wait for every bench queued so far, then cast a ray straight down at each
      // bar's spot and set its height to the first bench surface hit, so the bar
      // sits ON the table (never floating, never sunk into it).
      const benchesReady = Promise.allSettled(benchLoadPromises.slice());
      const ray = new THREE.Raycaster();
      const DOWN = new THREE.Vector3(0, -1, 0);
      const seatOnBench = (b) => {
        b.group.updateMatrixWorld(true);
        const targets = [];
        // Only bench geometry — skip anything under a light / beam / plant / canopy group.
        const SKIP = new Set(["canopy", "lights", "beams", "plants"]);
        const skipped = (o) => { for (let n = o; n && n !== b.group; n = n.parent) if (SKIP.has(n.userData?.perfTag)) return true; return false; };
        b.group.traverse((o) => { if (o.isMesh && o.visible && !skipped(o)) targets.push(o); });
        if (!targets.length) return;
        const inv = new THREE.Matrix4().copy(b.group.matrixWorld).invert();
        // Start just above this tier's nominal deck and look only a short way
        // down, so a bar can only seat on ITS OWN tray: from 45" up the single-
        // tier bar landed on the 54" top rails and the triple-tier bottom bar on
        // the second deck. Nominal decks are 14 (single / TT bottom), 6 and 60
        // (DT), 60 and 114 (TT); the real tray tops measure 18, 10/60, 14/62/114.
        // Seat the bar on the surface MOST of its footprint rests on.
        // Sample a 7 x 3 grid - along the bar AND across its width - because a
        // mesh-grid tray has holes and a rolling bench has a roller gap down one
        // side: a bar sampled only on its centre line can miss the tray entirely.
        //
        // Take the MEDIAN of the hits, never the highest. A few rays catch something
        // well above the tray - a rolling bench's top rail, a cross brace - and on
        // `Math.max` that single stray hit lifted the whole bar up to rail height,
        // which read as a fixture floating in mid-air (or missing, once it was out of
        // frame). The tray is whatever the majority of the rays land on.
        const median = (a) => {
          const s = a.slice().sort((x, y) => x - y);
          return s.length ? s[(s.length - 1) >> 1] : null;
        };
        // COST GUARD: every ray tests against every bench mesh in the room, and a
        // batch holds one entry per bar per tier per bench - so probing all of them
        // scales with room size and can stall the whole scene on a large layout.
        // Every bench in a batch is the SAME model at the SAME scale, so a handful of
        // probes per deck describes them all; the rest take that deck's median below.
        const PROBES_PER_DECK = 8;
        const SEAT_LOOK_UP_IN = 10, SEAT_LOOK_DOWN_IN = 14;
        const probed = new Map();
        const tops = b.list.map((p) => {
          const deckKey = Math.round(p.y || 0);
          const n = probed.get(deckKey) || 0;
          if (n >= PROBES_PER_DECK) return null;
          probed.set(deckKey, n + 1);
          const rot = p.rotationY || 0;
          const ux = Math.sin(rot), uz = Math.cos(rot);   // the bar's long axis (local Z)
          const wx = Math.cos(rot), wz = -Math.sin(rot);  // across the bar (local X)
          const hits = [];
          for (let k = -3; k <= 3; k++) {
            const s = (k / 3) * 0.45 * (b.fl || 0);
            for (let j = -1; j <= 1; j++) {
              const t = j * 0.3 * (b.fw || 0);
              const origin = new THREE.Vector3(
                p.x + ux * s + wx * t,
                (p.y || 0) + SEAT_LOOK_UP_IN,
                p.z + uz * s + wz * t,
              ).applyMatrix4(b.group.matrixWorld);
              ray.set(origin, DOWN);
              ray.far = SEAT_LOOK_UP_IN + SEAT_LOOK_DOWN_IN;
              const hit = ray.intersectObjects(targets, false)[0];
              if (hit) hits.push(hit.point.clone().applyMatrix4(inv).y);
            }
          }
          return median(hits);
        });
        // A bar that found NO surface would otherwise stay at the nominal deck height
        // and sink inside the bench, reading as a missing fixture. Fall back to the
        // typical seat its siblings found ON THE SAME DECK - keyed by the nominal Y it
        // was placed at, since one batch holds every tier of every bench that shares
        // this footprint, and tier 2's seat must never be used for a tier 1 bar.
        const byDeck = new Map();
        b.list.forEach((p, i) => {
          if (tops[i] === null) return;
          const k = Math.round(p.y || 0);
          if (!byDeck.has(k)) byDeck.set(k, []);
          byDeck.get(k).push(tops[i]);
        });
        const deckSeat = new Map();
        byDeck.forEach((v, k) => deckSeat.set(k, median(v)));
        b.list.forEach((p, i) => {
          const top = tops[i] ?? deckSeat.get(Math.round(p.y || 0)) ?? null;
          if (top !== null) p.y = top + 0.1;
        });
      };
      canopyBatches.forEach((b) => {
        // Canopy fixtures use the uploaded .glb exactly as authored (no triangle cap) —
        // chosen by the owner knowing the canopy file is ~715k triangles per fixture.
        void perFixture;
        benchLoadPromises.push(Promise.all([loadGLB(b.url), benchesReady]).then(([sceneObj]) => {
          if (sceneDisposed) return;
          if (b.opts?.sitOnBench) seatOnBench(b);
          const template = fitModelToFootprint(sceneObj, b.fw, b.fl, b.opts);
          applyBenchMaterials(template);
          const parts = flattenGroupByMaterial(template);
          const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
          let srcTris = 0;
          template.traverse((o) => { if (o.isMesh && o.geometry) srcTris += triCount(o.geometry); });
          let partTris = 0;
          parts.forEach(({ geometry }) => { partTris += triCount(geometry); });
          if (!parts.length || partTris < srcTris - 1) {
            // Merging lost geometry: keep every part by drawing one clone per fixture.
            parts.forEach(({ geometry }) => geometry.dispose());
            placeModel(b.url, b.fw, b.fl, b.list, 0, b.group, b.opts);
            return;
          }
          // Phones: merged per bench (benchId) so a column slide moves them; desktop: instanced.
          const meshes = isMobile ? bakePartsPerBench(parts, b.list) : instanceParts(parts, b.list);
          meshes.forEach((mesh) => {
            mesh.userData.perfTag = "canopy";
            if (mesh.isInstancedMesh) mesh.userData.instanceBenchIds = b.list.map((p) => p.benchId); // column slide: only moving benches' instances travel
            trackMat(mesh.material);
            mesh.castShadow = mesh.receiveShadow = true;
            b.group.add(mesh);
          });
          // The UCL's LED chase + magenta spill (desktop only, like the beams).
          if (!isMobile && b.opts?.sitOnBench) {
            uclEmissions.push(createUclEmission({
              group: b.group, bars: b.list, w: UCL_BAR.w, len: b.fl, h: b.opts.targetH || 0,
              reducedMotion, enabled: beamsOnRef.current,
            }));
          }
          invalidate();
        }).catch((err) => {
          console.error("[GLB] canopy render failed", err?.message || err);
        }));
      });
      canopyBatches.clear();
    };
    // Gradient backdrop, not a flat clear colour: a flat 0xeef1f4 skipped tone
    // mapping and sat in the same value band as the floor, so the scene had no
    // horizon and nothing to read depth against.
    setSceneBackdrop(scene);

    // Guard against a zero-size container at build time (the 3D pane can mount
    // before layout settles). A 0×0 renderer/NaN aspect renders nothing — fall
    // back to a sane size and re-measure via ResizeObserver once laid out.
    const W = mount.clientWidth || 1, H = mount.clientHeight || 1;
    // Far clip scales with room size so large rooms aren't clipped out of view.
    // The orbit camera can sit up to ~max(roomW,roomL)*2.5 away, so give generous
    // headroom (×6) plus a floor of 5000" for small rooms.
    // Facility span — bounding box across every room so large multi-room layouts
    // aren't clipped. Recomputed here (pre-build) directly from rooms[].
    const _rr = Array.isArray(doc.rooms) && doc.rooms.length > 0 ? doc.rooms : null;
    const roomSpan = _rr
      ? _rr.reduce((m, rm) => {
          const off = rm.offset || { x: 0, y: 0 };
          const r = rm.room || doc.room;
          return Math.max(m, (off.x || 0) + (r?.widthIn || 0), (off.y || 0) + (r?.lengthIn || 0));
        }, 0)
      : Math.max(doc.room.widthIn, doc.room.lengthIn);
    const cameraFar = Math.max(5000, roomSpan * 6);
    // A longer lens for orbit (less perspective distortion on the racks), a
    // wider one at eye level in walkthrough; setCameraMode swaps them.
    const ORBIT_FOV = 50, WALK_FOV = 65;
    const camera = new THREE.PerspectiveCamera(ORBIT_FOV, W / H, 1, cameraFar);
    // On phones a high pixel ratio multiplies framebuffer memory and is a common
    // trigger for the tab being killed (OOM) right as the scene first renders.
    // A PHONE / tablet (small screen or a mobile browser) — not merely a device
    // with a touchscreen. "ontouchstart" is true on touchscreen laptops and with
    // Chrome's touch emulation, and it put those on the phone path: merged
    // static benches (nothing for a column slide to move), no instancing, no
    // beams, no anti-aliasing.
    // A narrow desktop window is NOT a phone either: the width test alone put a
    // half-screen browser on the phone path.
    const isPhone = typeof window !== "undefined" &&
      (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ||
        (window.matchMedia?.("(pointer: coarse)").matches && window.matchMedia?.("(max-width: 1024px)").matches));
    // Phones render the SAME scene as desktop: full-detail models, instancing,
    // beams, the UCL chase, anti-aliasing and the real pixel ratio. The stripped
    // phone path (inherited from GrowStudios) made the phone look like a
    // different, older app. `isPhone` now only scales the dimension labels.
    const isMobile = false;
    // Low-memory devices can't safely decode the multi-MB bench GLBs (the front
    // bench alone is ~18MB and balloons in GPU memory). On those, skip GLB loads
    // entirely and render the lightweight procedural scaffold benches instead —
    // same placements/sizes, just a cheaper mesh — so the tab doesn't get killed.
    // (navigator.deviceMemory is capped/rounded by Android Chrome, so flagship
    // phones reported 4 and got the stick-frame placeholder benches - narrower
    // than the real racks, which read as gaps between columns. The ZATLA room
    // models are Draco-packed and small, so every device loads the real ones.)
    const lowMem = false;
    // Renderer + canvas created ONCE and reused on every rebuild (recreating the
    // WebGL context is what flashed). preserveDrawingBuffer keeps thumbnail capture.
    let renderer = rendererRef.current;
    if (!renderer) {
      // MSAA is skipped on phones AND on high-DPI screens: at a pixel ratio of 2 the
      // image is already smooth, and 4x MSAA on a 4x-pixel canvas is the most
      // expensive setting in the scene for almost no visible gain.
      renderer = new THREE.WebGLRenderer({ antialias: !isMobile && window.devicePixelRatio < 2, preserveDrawingBuffer: true, powerPreference: "high-performance" });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      // 0.95, down from 1.05: r171's ACES pre-multiplies by exposure/0.6, so 1.05
      // was a 1.75x gain that pushed every near-white surface into the same band
      // as the backdrop.
      renderer.toneMappingExposure = 0.95;
      // The scene's one shadow map (the key light in addWalkthroughLightingRig).
      // Set at creation: materials compile their shadow defines on the first
      // render, and the renderer is reused across every rebuild. autoUpdate is
      // off: the map is redrawn only when shadowsDirty says the geometry changed
      // (see invalidate and the render loop), never per orbit frame.
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      rendererRef.current = renderer;
      mount.appendChild(renderer.domElement); // append the canvas ONCE
    }
    // If the mount div was ever remounted, re-home the canvas instead of leaving
    // the view dead.
    if (renderer.domElement.parentNode !== mount) mount.appendChild(renderer.domElement);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
    renderer.setSize(W, H);

    // ── Multi-room render list ──────────────────────────────────────────────
    // The ACTIVE room is edited through the flat top-level doc fields, so its 3D
    // must come from those (not the possibly-stale rooms[] entry). Every OTHER
    // room renders from its own stored geometry. Each room carries its facility
    // offset {x,y} → world origin { x, z:y }. Falls back to a single room at the
    // origin for legacy/un-migrated projects. This keeps each room's 2D↔3D in sync.
    const roomsArr = Array.isArray(doc.rooms) && doc.rooms.length > 0 ? doc.rooms : null;
    const activeId = doc.activeRoomId;
    const renderRooms = roomsArr
      ? roomsArr.map((rm) => {
          const isActive = rm.id === activeId;
          const off = rm.offset || { x: 0, y: 0 };
          return {
            id: rm.id,
            isActive,
            origin: { x: off.x || 0, z: off.y || 0 },
            room: isActive ? doc.room : (rm.room || doc.room),
            settings: isActive ? (doc.settings || {}) : (rm.settings || {}),
            benches: isActive ? (doc.benches || []) : (rm.benches || []),
            lights: isActive ? (doc.lights || []) : (rm.lights || []),
            objects: isActive ? (doc.objects || []) : (rm.objects || []),
            // The active room's rotation comes from the live top-level field (driven
            // by the rotate animation/commit); other rooms use their stored angle.
            // Same source as 2D → 3D always matches the 2D angle.
            rotationDeg: isActive ? (doc.rotationDeg || rm.rotationDeg || 0) : (rm.rotationDeg || 0),
            // Per-room grow-light MODEL choice (visual fixture only). Stored on
            // the rooms[] entry itself; Phoenix for legacy/empty rooms.
            lightModel: rm.lightModel || "phoenix",
            // Per-room light spectrum (emission beams; reconciled in place).
            spectrum: rm.spectrum,
            // Per-room canopy display mode: "canopy" (default) shows canopy light
            // fixtures, "none" hides them, "air" swaps in the Air Circulation .glb.
            canopyMode: rm.canopyMode || "canopy",
            // Merged/odd-shaped room outline (room-local points). Drives the
            // polygon wall builder so the removed shared wall stays open in 3D.
            polygon: Array.isArray(rm.polygon) && rm.polygon.length >= 3 ? rm.polygon : null,
          };
        })
      : [{ isActive: true, origin: { x: 0, z: 0 }, room: doc.room, settings: doc.settings || {}, benches: doc.benches || [], lights: doc.lights || [], objects: doc.objects || [], rotationDeg: doc.rotationDeg || 0, lightModel: doc.lightModel || "phoenix", canopyMode: doc.canopyMode || "canopy" }];

    // Facility footprint — TRUE bounding box (min AND max) of every room, so a
    // room with a NEGATIVE offset is still fully accounted for. A max-only reduce
    // assumed every offset ≥ 0, which centered the floor/camera on a 0-based
    // midpoint and pushed negatively-offset rooms off the slab.
    const bounds = renderRooms.reduce(
      (acc, rr) => {
        const x0 = rr.origin.x;
        const z0 = rr.origin.z;
        const x1 = x0 + (rr.room?.widthIn || 0);
        const z1 = z0 + (rr.room?.lengthIn || 0);
        return {
          minX: Math.min(acc.minX, x0),
          minZ: Math.min(acc.minZ, z0),
          maxX: Math.max(acc.maxX, x1),
          maxZ: Math.max(acc.maxZ, z1),
        };
      },
      { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }
    );
    const FAC_PAD = 48;
    const spanW = (bounds.maxX - bounds.minX) + FAC_PAD * 2;
    const spanL = (bounds.maxZ - bounds.minZ) + FAC_PAD * 2;
    // Shared floor spans the FULL facility footprint when one is stored, otherwise
    // the rooms' true min→max span plus margin. Every room sits on this one floor
    // at its own (possibly negative) offset.
    const storedFac = docRaw.facility || {};
    const roomW = Math.max(storedFac.widthIn || 0, spanW);
    const roomL = Math.max(storedFac.lengthIn || 0, spanL);
    // A room's ceiling never sits below what its tallest rack needs (16ft for
    // double tier, 20ft for triple), whatever an older save stored.
    const roomTiers = (rr) => (rr.benches || []).reduce((m, b) => Math.max(m, Math.round(b.tiers || 1)), 1);
    const roomCeilingIn = (rr) => Math.max(rr.room?.ceilingIn || 144, minCeilingForTiers(roomTiers(rr)));
    const ceil = Math.max(...renderRooms.map(roomCeilingIn));
    // Real center of the room cluster (includes negative offsets) — used for the
    // floor position, lights, camera target and fog so everything frames the
    // actual rooms, not a 0-based midpoint.
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;

    // Neutral room environment map — provides specular reflections for ALL
    // PBR materials (floor, benches, scaffold) so metallic surfaces are lit
    // instead of rendering black. Lambert materials (walls, aisle) ignore it.
    // Mobile GPUs frequently fail to compile the PBR+PMREM shader path (or run out
    // of memory generating the cubemap), which renders every mesh black/invisible
    // while lines and sprites still draw — exactly the "empty room" symptom. Skip
    // the environment map on phones/low-memory devices; the lighting rig below
    // still lights the scene.
    // Phones DO get the env map (without it metallic bench frames render near
    // black); only low-memory devices skip it, as they skip the shadow map.
    const useEnv = !lowMem;
    const pmrem = useEnv ? new THREE.PMREMGenerator(renderer) : null;
    const envTex = pmrem ? pmrem.fromScene(new RoomEnvironment(), 0.04).texture : null;
    if (envTex) scene.environment = envTex;
    // Indirect light only: the key, fill and hemisphere do the modelling.
    scene.environmentIntensity = 0.55;

    // ── Lighting rig (display-only) ─────────────────────────────────────────
    // Hemisphere + one shadow-casting key + one fill, aimed at the facility
    // centre; the PMREM environment is the indirect light. Low-memory devices
    // get no shadow map; phones get a 1024 map, desktops 2048.
    addWalkthroughLightingRig(
      scene,
      { cx, cz, spanW: roomW, spanL: roomL, ceil },
      { shadows: !lowMem, mapSize: isMobile ? 1024 : 2048 }
    );

    // Named groups
    const benchesGroup = new THREE.Group();
    scene.add(benchesGroup);
    // Track every material for potential wireframe toggling (not exposed in UI but kept for internals).
    const allMaterials = new Set();
    const trackMat = (mat) => {
      if (!mat) return;
      (Array.isArray(mat) ? mat : [mat]).forEach((m) => m && allMaterials.add(m));
    };

    // Polished-concrete facility floor + render-only ground details (matte slab
    // apron, troweled-concrete slab, soft contact-shadow pool, faint 10ft control-
    // joint grid). Display-only — no room/bench/wall geometry is touched.
    buildFacilityFloor(scene, { roomW, roomL, cx, cz });

    // Per-room walls + center aisle — reuse the SAME procedural generator for
    // every room, shifted by that room's facility origin so each boundary wraps
    // its own bench layout exactly. Generators are untouched; only origin/size vary.
    // Painted walkway on the concrete: a step lighter than the floor, with the
    // safety-yellow edge stripes. Depth ladder from the floor up — room floor
    // 0.5 (polygonOffset -2) < walkway 0.6 (-3) < stripes 0.62 (-4) — so nothing
    // z-fights at full dolly-out.
    const aisleMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf4c33a, roughness: 0.5, metalness: 0.0, emissive: 0x3a2c00, emissiveIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    // Solid double-sided wall meshes — the render loop hides whichever face the
    // camera so the near wall never blocks the view into the room.
    const cullWalls = [];
    // Per-room ceiling groups, hidden whenever the camera is above them (see animate).
    const ceilings = [];
    // Inline duct-fan blade subgroups to spin in the render loop (active runs only).
    const spinFans = [];
    // CO₂ solenoid LED subgroups to pulse in the render loop (active tanks only).
    const pulseLeds = [];
    // 3D EQUIPMENT interaction (equipment objects only — benches/lights stay
    // display-only). The interaction manager owns the pickable registry, the
    // selection outline, and the world→room-local drag math. Room context per
    // object id is populated during the active-room object render below, then
    // read when the GLB swap helper registers the swapped-in mesh.
    const equip = createEquipmentInteraction({ scene, invalidate: () => invalidate() });
    equipApiRef.current = equip;
    const equipmentRoomCtx = {}; // objId → { rid, ctr, rw, rl, ox, oz, size, type }
    const registerEquipment = (objId, mesh) => {
      const ctx = equipmentRoomCtx[objId];
      if (ctx) equip.register(objId, mesh, ctx);
    };
    const unregisterEquipment = (objId, mesh) => equip.unregister(objId, mesh);

    // ── Per-room rotation pivot groups ──────────────────────────────────────
    // Each room gets a THREE.Group positioned at the room's CENTER on the floor
    // and rotated by -rotationDeg around Y (Three's Y is up; negative matches the
    // 2D canvas's clockwise screen rotation). Every mesh for that room — walls,
    // aisle, benches, lights, objects — is added to this group in room-CENTER-
    // relative coordinates, so the whole room turns together as one group around
    // its exact center. Bench/object data and the auto-layout math are never
    // touched; only this display transform rotates. 2D and 3D read the SAME
    // stored rotationDeg, so they always agree.
    const roomGroups = {};       // roomId → THREE.Group (pivot at room center)
    const roomCenters = {};      // roomId → { x, z } facility-space room center
    const roomHitPlanes = [];    // invisible floor planes for room-select raycasting
    // Per-room selection highlight (glowing floor tint + ring), one built per room
    // and hidden by default. A selection effect toggles which one is visible; the
    // render loop pulses only the currently-visible highlight materials.
    const selectHighlights = {}; // roomId → { group, fillMat, ringMat }
    renderRooms.forEach((rr, idx) => {
      const rw = rr.room?.widthIn || 1;
      const rl = rr.room?.lengthIn || 1;
      const ox = rr.origin.x, oz = rr.origin.z;
      const ccx = ox + rw / 2, ccz = oz + rl / 2;
      const id = rr.id || `__room_${idx}`;
      rr.__rid = id;
      const g = new THREE.Group();
      g.position.set(ccx, 0, ccz);
      g.rotation.y = -((rr.rotationDeg || 0) * Math.PI) / 180;
      scene.add(g);
      roomGroups[id] = g;
      roomCenters[id] = { x: ccx, z: ccz };
      // Invisible, flat floor plane covering this room's footprint — the raycast
      // target for tap-to-select. Lives in the room's rotated pivot group so it
      // tracks the room exactly; tagged with the room id so the click handler
      // knows which room was hit. Display-only; never touches data.
      const hitPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(rw, rl),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitPlane.rotation.x = -Math.PI / 2;
      hitPlane.position.set(0, 0.02, 0); // room-center-local; group handles offset+rotation
      hitPlane.userData.roomId = rr.id || null;
      g.add(hitPlane);
      if (rr.id) roomHitPlanes.push(hitPlane);

      // ── Per-room selection indicator (hidden until selected) ─────────────
      // Every room gets a translucent green floor tint + a bright green outline
      // ring, hidden by default. A selection effect shows exactly one (or none),
      // and the render loop pulses the visible one. Display-only; never touches
      // data/layout. Nothing is shown until the user selects a room.
      if (rr.id) {
        const { group: hlGroup, fillMat, ringMat } = buildRoomHighlight(rw, rl, rr.polygon);
        g.add(hlGroup);
        selectHighlights[rr.id] = { group: hlGroup, fillMat, ringMat };
      }
    });

    renderRooms.forEach((rr, idx) => {
      const rw = rr.room?.widthIn || 1;
      const rl = rr.room?.lengthIn || 1;
      const rc = roomCeilingIn(rr);
      const ox = rr.origin.x, oz = rr.origin.z;
      const id = rr.__rid || `__room_${idx}`;
      const group = roomGroups[id];
      const ctr = roomCenters[id];
      // Convert a facility-space (x,z) into this room group's local space (the
      // group is already translated to the room center + rotated).
      const toLocal = (fx, fz) => ({ x: fx - ctr.x, z: fz - ctr.z });

      // Walls via the existing generator, positioned at this room's origin, then
      // shifted into the room group's local frame so they rotate with the room.
      // Pass this room's doors so each one is cut as a real see-through, door-
      // shaped opening in the wall it's snapped to. Hidden-layer doors are skipped.
      // Doors are not shown in 3D (2D only), so walls get no door openings.
      const roomDoors = [];
      const walls = buildRoomWalls(
        { widthIn: rw, lengthIn: rl, ceilingIn: rc, ...(rr.polygon ? { polygon: rr.polygon } : {}) },
        { x: ox, z: oz },
        roomDoors
      );
      walls.position.x -= ctr.x;
      walls.position.z -= ctr.z;
      // Walls receive the benches' shadows but never cast: a 10ft wall would
      // throw an 80in strip across the benches, and 6in slabs self-shadow.
      walls.userData.shadowMode = "receive";
      group.add(walls);
      // Collect the individual wall meshes so the render loop can hide whichever
      // walls face the camera (the walls are now solid double-sided slabs, so the
      // near wall would otherwise block the view into the room). Tag each with its
      // room's world-space center so culling is a clean per-wall plane test.
      walls.traverse((o) => {
        if (o.isMesh && o.userData.wallNormal) {
          o.userData.roomCenter = new THREE.Vector3(ctr.x, 0, ctr.z);
          cullWalls.push(o);
        }
      });

      // ── Wall fans (display-only, never persisted) ──────────────────────────
      // The ZATLA fan (models.fanUrl) on every wall of a rectangular room: at
      // least four down each side wall, two on the front and two on the back,
      // spaced evenly, mounted by the clamp foot high on the wall and tilted
      // down at the canopy. Each fan hangs off an unrotated cull ANCHOR that
      // carries its wall's normal, so Cut view hides the fan with its wall
      // (the fan's own yaw + tilt would spoil the wall-normal test).
      if (models.fanUrl && !rr.polygon && !isLayerHidden(vis, LAYER_IDS.HVAC)) {
        const FAN_W_IN = 18;            // fan head diameter
        const FAN_DROP_IN = 40;         // foot this far below the ceiling…
        const FAN_RACK_CLEAR_IN = 14;   // …but never closer than this above the tallest rack
        const FAN_TILT = 0.3;           // ~17° nose-down at the plants
        const FAN_FOOT_H_IN = 3;        // height of the clamp foot: its back face is what meets the wall
        const rackTopIn = getTierRackTargetH(roomTiers(rr));
        const sideCount = Math.max(4, Math.round(rl / 96));
        const endCount = 2;
        const spots = []; // { x, z, yaw, normal, wall }
        const along = (n, len) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * len);
        along(sideCount, rl).forEach((z) => {
          spots.push({ x: 0, z, yaw: Math.PI / 2, normal: [-1, 0, 0], wall: "left" });
          spots.push({ x: rw, z, yaw: -Math.PI / 2, normal: [1, 0, 0], wall: "right" });
        });
        along(endCount, rw).forEach((x) => {
          spots.push({ x, z: 0, yaw: 0, normal: [0, 0, -1], wall: "top" });
          spots.push({ x, z: rl, yaw: Math.PI, normal: [0, 0, 1], wall: "bottom" });
        });
        const fanY = Math.max(rackTopIn + FAN_RACK_CLEAR_IN, rc - FAN_DROP_IN);
        benchLoadPromises.push(loadGLB(models.fanUrl).then((fanScene) => {
          if (sceneDisposed) return;
          const fitted = fitModelToFootprint(fanScene, FAN_W_IN, FAN_W_IN, { uniform: true });
          const box = new THREE.Box3().setFromObject(fitted);
          const depth = box.max.z - box.min.z; // the fan faces +z; its foot/arm is at -z
          spots.forEach((sp) => {
            const holder = sp === spots[0] ? fitted : fitModelToFootprint(fanScene, FAN_W_IN, FAN_W_IN, { uniform: true });
            // The foot's back face sits ON the inner wall face (WALL_FACE_OUT_IN
            // outside the room edge). The whole fan tilts about its foot, so the
            // foot's back-TOP edge is placed on the wall and its bottom corner
            // sinks a hair into it — the fan reads as clamped to the wall, not
            // hovering beside it. Pivot = bottom-centre of the fitted box; the
            // back of the foot is depth/2 behind it.
            const inset = (depth / 2) * Math.cos(FAN_TILT) - FAN_FOOT_H_IN * Math.sin(FAN_TILT) - WALL_FACE_OUT_IN;
            const lp = toLocal(ox + sp.x - sp.normal[0] * inset, oz + sp.z - sp.normal[2] * inset);
            holder.position.set(lp.x, fanY, lp.z);
            holder.rotation.order = "YXZ";
            holder.rotation.set(FAN_TILT, sp.yaw, 0);
            holder.userData.wallFan = sp.wall;
            holder.traverse((o) => { if (o.isMesh) trackMat(o.material); });
            setShadowFlags(holder); // lands after build()'s scene-wide pass
            group.add(holder);
            const anchor = new THREE.Object3D();
            anchor.position.copy(holder.position);
            anchor.userData.wallNormal = new THREE.Vector3(...sp.normal);
            anchor.userData.roomCenter = new THREE.Vector3(ctr.x, 0, ctr.z);
            anchor.userData.cullTargets = [holder];
            group.add(anchor);
            cullWalls.push(anchor);
          });
          invalidate();
        }).catch((err) => console.error("[GLB] wall fans failed", err?.message || err)));
      }

      // Per-room interior floor — a clean slab covering this room's footprint,
      // parented to the room's pivot group so it rotates/moves with the room.
      addRoomFloor(group, rw, rl, rr.polygon);

      // Ceiling: corrugated deck on purlins (roof.js), hidden whenever the camera
      // is above it (Orbit from above, Top-down) and shown from inside (Walk) —
      // like the near-wall cull, but on height alone so Top-down is never roofed
      // over. Never casts: a deck casting under the overhead key would black out
      // the room. Room-centred, so it parents straight in.
      const ceilGrp = buildRoomCeiling(rw, rl, rc, rr.polygon);
      ceilGrp.userData.shadowMode = "none";
      ceilGrp.userData.ceilingY = rc;
      group.add(ceilGrp);
      ceilings.push(ceilGrp);

      // Main-aisle walkway, drawn where the aisle REALLY is (mobileAisle.aisleOf):
      // between the two banks by default, wherever a column slide moved it (a
      // wall included), and across the room for side-to-side rows. No benches →
      // the room centre, as before. Tagged so a column slide carries it along.
      const centerW = (rr.settings?.centerIn || 48);
      const mainAisle = aisleOf(rr.benches || [], rr.room, rr.settings || {});
      const aisleAcross = mainAisle?.axis === "y";
      const aisleW = mainAisle && mainAisle.hi > mainAisle.lo ? Math.min(centerW, mainAisle.hi - mainAisle.lo) : centerW;
      const aisleMid = mainAisle && mainAisle.hi > mainAisle.lo ? (mainAisle.lo + mainAisle.hi) / 2 : null;
      const aL = toLocal(
        ox + (aisleMid !== null && !aisleAcross ? aisleMid : rw / 2),
        oz + (aisleMid !== null && aisleAcross ? aisleMid : rl / 2)
      );
      const runLen = (aisleAcross ? rw : rl) - 8;
      // Just ABOVE the room floor (addRoomFloor sits at y 0.5): at 0.05/0.07 the
      // walkway and its stripes would be buried under the slab and never show.
      const walk = (w, mat, y, off) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(aisleAcross ? runLen : w, aisleAcross ? w : runLen), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(aL.x + (aisleAcross ? 0 : off), y, aL.z + (aisleAcross ? off : 0));
        m.userData.aisleOf = id;
        m.userData.shadowMode = "receive";
        group.add(m);
      };
      walk(aisleW, aisleMat, 0.6, 0);
      [-aisleW / 2, aisleW / 2].forEach((off) => walk(2, stripeMat, 0.62, off));

      // Smart-equipment objects for this room — built in facility coords by the
      // existing generator, then moved into the room group's local frame so they
      // rotate with the room. Object geometry is read-only; data is never modified.
      (rr.objects || []).forEach((obj) => {
        if (isObjectHidden(vis, obj)) return; // layer hidden — view-only skip
        if (obj.type === "door") return; // doors are 2D-only, never drawn in 3D
        const mesh = buildEquipmentMesh(obj, rc, { widthIn: rw, lengthIn: rl, ceilingIn: rc, ...(rr.polygon ? { polygon: rr.polygon } : {}) });
        if (!mesh) return;
        const size = smartObjectSize(obj); // footprint (inches) for optional GLB swaps
        const mL = toLocal(mesh.position.x + ox, mesh.position.z + oz);
        mesh.position.x = mL.x;
        mesh.position.z = mL.z;
        // Fan: ALWAYS set the group Y to effectiveHeightY (even without a stored
        // pos.z) so the procedural fan renders at its natural default (near-ceiling)
        // — matching the HeightControl slider. Other types only override when pos.z
        // is explicitly set.
        if (obj.type === "fan" || (typeof obj.pos?.z === "number" && obj.type !== "door" && obj.type !== "ducting")) {
          mesh.position.y = effectiveHeightY(obj, rc);
        }
        group.add(mesh);
        const glbUrlForObj = equipmentGlbUrlForType(obj.type, models);
        if (glbUrlForObj) mesh.visible = false; // hide placeholder until GLB swaps in (revealed on load error) — no procedural flash

        // Record this object's room context so the interaction manager can convert
        // a floor-plane raycast hit into room-local X/Y during a drag. Register
        // EVERY room's equipment (not just the active room) so an object in any
        // room is tap-selectable — tapping an object in a non-active room switches
        // the active room (activateRoomForObject) so its drag/edit handlers apply.
        // Doors are DISPLAY-ONLY in 3D — never selectable or movable here (they're
        // edited in 2D), so skip registering them for picking/dragging.
        if (obj.id && obj.type !== "door") {
          equipmentRoomCtx[obj.id] = { rid: id, group: roomGroups[id], ctr, rw, rl, ox, oz, size, type: obj.type };
          // Register the procedural placeholder now; when a GLB swaps in, the swap
          // helper unregisters this and re-registers the GLB holder in its place.
          registerEquipment(obj.id, mesh);
        }

        // Collect any inline duct-fan blade subgroups so the render loop can spin
        // them. Active when the extraction fan draws power (fanWatts > 0).
        if (obj.type === "ducting" && (Number(obj.spec?.fanWatts) || 0) > 0) {
          mesh.traverse((o) => { if (o.userData?.spinFan) spinFans.push(o); });
        }

        // Collect the CO₂ solenoid LED subgroup so the render loop can pulse it
        // while the solenoid is active.
        if (obj.type === "co2tank") {
          mesh.traverse((o) => {
            if (o.userData?.pulseLed) {
              o.traverse((c) => { if (c.isMesh && c.material?.emissive) pulseLeds.push(c.material); });
            }
          });
        }

        // Fan GLB (wall-snappable) — extracted to equipmentGlbSwap.js verbatim.
        if (obj.type === "fan" && typeof models.fanUrl === "string" && models.fanUrl.trim() !== "") {
          swapWallEquipmentGlb({
            url: models.fanUrl, obj, size, rc, rw, rl, mesh, group, toLocal, ox, oz, trackMat,
            isActive: rr.isActive, registerEquipment, unregisterEquipment,
            isDisposed: () => sceneDisposed, invalidate: () => invalidate(),
            // The fan renders at AUTO_FAN_SCALE of its original 10×70×36 fit.
            label: "fan", fitW: 10 * AUTO_FAN_SCALE, fitL: 70 * AUTO_FAN_SCALE,
            fitOpts: { uniform: false, targetH: 36 * AUTO_FAN_SCALE },
            snapHeight: FAN_MOUNT_Y, recolorFan: true,
          });
        }

        // AC / Mini-Split GLB (wall-mounted) — ~4× uniform scale-up, 8ft mount.
        if (obj.type === "minisplit" && typeof models.acUrl === "string" && models.acUrl.trim() !== "") {
          swapWallEquipmentGlb({
            url: models.acUrl, obj, size, rc, rw, rl, mesh, group, toLocal, ox, oz, trackMat,
            isActive: rr.isActive, registerEquipment, unregisterEquipment,
            isDisposed: () => sceneDisposed, invalidate: () => invalidate(),
            label: "minisplit", fitW: size.w * 4, fitL: 8 * 4, fitOpts: { uniform: true },
            snapHeight: 8 * 12,
          });
        }

        // Controller GLB (wall-mounted panel, ~5 ft mount).
        if (obj.type === "controller" && typeof models.controllerUrl === "string" && models.controllerUrl.trim() !== "") {
          swapWallEquipmentGlb({
            url: models.controllerUrl, obj, size, rc, rw, rl, mesh, group, toLocal, ox, oz, trackMat,
            isActive: rr.isActive, registerEquipment, unregisterEquipment,
            isDisposed: () => sceneDisposed, invalidate: () => invalidate(),
            // Uniform fit takes the SMALLER of the two axis factors, so fitting to
            // the 4"-deep footprint kept the panel tiny. Fit BOTH targets to the
            // scaled width so the model's long axis spans size.w * 3 (~48").
            label: "controller",
            fitW: size.w * 1.5 * AUTO_CONTROLLER_SCALE, fitL: size.w * 1.5 * AUTO_CONTROLLER_SCALE,
            fitOpts: { uniform: true },
            snapHeight: 5 * 12, alwaysSnap: true,
          });
        }

        // CO₂ Tank GLB (floor-standing).
        if (obj.type === "co2tank" && typeof models.co2TankUrl === "string" && models.co2TankUrl.trim() !== "") {
          swapFloorEquipmentGlb({
            url: models.co2TankUrl, obj, size, rc, mesh, group, toLocal, ox, oz, trackMat,
            isActive: rr.isActive, registerEquipment, unregisterEquipment,
            isDisposed: () => sceneDisposed, invalidate: () => invalidate(), label: "co2tank",
          });
        }

        // Dehumidifier GLB (floor-standing).
        if (obj.type === "dehumidifier" && typeof models.dehumidifierUrl === "string" && models.dehumidifierUrl.trim() !== "") {
          swapFloorEquipmentGlb({
            url: models.dehumidifierUrl, obj, size, rc, mesh, group, toLocal, ox, oz, trackMat,
            isActive: rr.isActive, registerEquipment, unregisterEquipment,
            isDisposed: () => sceneDisposed, invalidate: () => invalidate(), label: "dehumidifier",
          });
        }

        // Ducting GLB (ceiling-height, free-moving run).
        if (obj.type === "ducting" && typeof models.ductingUrl === "string" && models.ductingUrl.trim() !== "") {
          swapDuctingGlb({
            url: models.ductingUrl, obj, size, rc, rw, rl, mesh, group, toLocal, ox, oz, trackMat,
            isActive: rr.isActive, registerEquipment, unregisterEquipment,
            isDisposed: () => sceneDisposed, invalidate: () => invalidate(),
          });
        }
      });
    });



    // 3D dimension annotations (room W × L × ceiling height + clearances) — built
    // PER ROOM (like the selection highlights), each holder parented to its room's
    // pivot group so it rotates/moves with that room. Dimensions are ROOM-SCOPED:
    // only the SELECTED room's holder is ever visible (and only while the overlay
    // "Dimensions" toggle is ON), so switching rooms in 3D switches the labels to
    // the newly-selected room in place — no rebuild, no stale labels.
    const dimHolders = {}; // roomId → THREE.Group
    {
      const fmt = (inches) => formatLength(inches, doc.units || "imperial");
      renderRooms.forEach((rr) => {
        const rid = rr.__rid;
        const group = roomGroups[rid];
        const rCtr = roomCenters[rid];
        if (!group || !rCtr) return;
        // Each room's OWN geometry/benches/settings (renderRooms already maps the
        // active room to the live flat fields, other rooms to their stored data).
        const room = rr.room || doc.room;
        const rW = room?.widthIn || 0;
        const rL = room?.lengthIn || 0;
        const rCeil = room?.ceilingIn || ceil;
        // Dim annotations are authored in 0,0-origin room space — shift the holder
        // into the room group's local frame so it sits on the room and rotates with it.
        const holder = new THREE.Group();
        holder.position.set((rr.origin?.x || 0) - rCtr.x, 0, (rr.origin?.z || 0) - rCtr.z);
        const dimensionScale = isPhone ? 14 : 24;
        const clearanceScale = isPhone ? 9 : 14;
        holder.add(rr.polygon
          ? buildPolygonDimensions(rr.polygon, rCeil, fmt, { labelScale: dimensionScale }) // merged room: per-wall, same as 2D
          : buildDimensions(rW, rL, rCeil, fmt, { labelScale: dimensionScale }));
        const clearances = computeClearances(room, rr.benches || [], rr.settings || {});
        holder.add(buildClearanceDimensions(rW, rL, rr.benches || [], clearances, fmt, { labelScale: clearanceScale }));
        holder.visible = false; // shown only when this room is selected + toggle ON
        holder.userData.slideHide = true; // measured from the old positions during a column slide
        group.add(holder);
        dimHolders[rid] = holder;
      });
    }
    // Show ONLY the selected room's dimension holder (while the toggle is ON).
    // Called on room selection, on toggle flips, and after each build.
    const updateDimensionVisibility = (selId = selectedRoomIdRef.current) => {
      Object.entries(dimHolders).forEach(([rid, holder]) => {
        holder.visible = !!showDimensionsRef.current && rid === selId;
      });
      invalidate();
    };
    dimsApiRef.current = { updateDimensionVisibility };

    // Determine the GLB URL for a bench based ONLY on its system type's slot in
    // the model library. The library is the single source of truth — there is NO
    // cross-type fallback and NO built-in default. An empty slot returns null, and
    // the caller renders a wireframe scaffold placeholder so it's obvious the slot
    // has no uploaded model (never a stand-in GLB from another type).
    //   "rolling" → rollingBenchUrl. V-track was retired: older saved layouts
    //   that still say "vtrack" draw as the rolling bench.
    const getBenchGlbUrl = (bench) => {
      if (lowMem) return null; // procedural scaffold placeholder on low-memory devices
      const type = bench?.type || "rolling";
      if (type === "rolling" || type === "vtrack") return models.rollingBenchUrl || null;
      if (type === "front") return models.frontBenchUrl || null;
      return null;
    };

    // Pre-built multi-tier model: use doubleTierUrl for tier=2, tripleTierUrl for
    // tier>=3. Returns null when no dedicated model exists (caller stacks the
    // single-tier model instead).
    const getTierGlbUrl = (tiers) => {
      if (lowMem) return null; // procedural scaffold fallback on low-memory devices
      if (tiers >= 3 && models.tripleTierUrl) return models.tripleTierUrl;
      if (tiers >= 2 && models.doubleTierUrl) return models.doubleTierUrl;
      return null;
    };

    // Render-on-demand state — defined early so synchronous bench placement
    // can mark frames dirty before the camera loop is set up below.
    let needsRender = true;
    // The shadow map is redrawn only when geometry changed (renderer.shadowMap
    // .autoUpdate is off), never per orbit frame — the biggest single saving on
    // phones. invalidate() marks it; the render loop consumes the flag.
    let shadowsDirty = true;
    let drawnFrames = 0; // frames the render loop has actually drawn (speed test: idle redraws)
    let invalidate = () => { needsRender = true; shadowsDirty = true; };

    // First pass — collect placements grouped by (url, fitW, fitL, fitOpts) so tier
    // benches sharing the same GLB + footprint can be rendered via InstancedMesh.
    const placementGroups = new Map();
    // rid → growLightPlacements fits, rendered into per-room light groups below.
    const roomLightData = {};
    // rid → plant placements (6 per bench deck, see plantLayout.js), drawn instanced below.
    const roomPlantData = {};
    // Benches with no GLB uploaded — rendered via procedural scaffold as default.
    const noUrlBenches = [];
    // One unit plane, scaled per bench, for the contact-shadow decals below.
    const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // Mobile aisle: one invisible tap target per bench (footprint × rack height).
    // The pointer raycasts these to find the tapped column; one shared unit box
    // and one invisible material, scaled per bench, never drawn.
    const benchHitGeo = new THREE.BoxGeometry(1, 1, 1);
    const benchHitMat = new THREE.MeshBasicMaterial({ visible: false });
    const benchHitBoxes = [];
    // Every bench's footprint × rack height (room-local), for the default
    // three-quarter camera fit (cameraFit.js) once the room groups are placed.
    const contentItems = [];
    let plants = 0; // rough plant count for stats

    // Loop every room: each room's benches render through the SAME GLB pipeline
    // below, only shifted by the room's facility origin (ox/oz). Bench data is
    // read per room and never modified — so each room's 3D matches its own 2D.
    renderRooms.forEach((rr, idx) => {
    const ox = rr.origin.x, oz = rr.origin.z;
    const rid = rr.__rid || `__room_${idx}`;
    const ctr = roomCenters[rid];
    // Bench placements are in the room group's LOCAL frame (relative to room center).
    (benchesHidden ? [] : (rr.benches || [])).forEach((b) => {
      const r = benchRect(b);
      const tiers = Math.max(1, Math.min(3, Math.round(b.tiers || 1)));

      // Room-center-relative center (local to the room's pivot group).
      let cx2 = (ox + r.x + r.w / 2) - ctr.x;
      const cz2 = (oz + r.y + r.h / 2) - ctr.z;
      // The bench's OWN heading, nothing else. (This used to add 90 deg to
      // compensate for bench GLBs authored long-along-X; fitModelToFootprint's
      // lengthAxis:"z" normalization now handles that per model, so a re-upload
      // authored the other way no longer turns the whole room sideways.)
      const rotY = (b.rotationDeg || 0) * (Math.PI / 180);

      // ── Plants: 6 per bench deck, an evenly spaced 2 × 3 grid, one block per tier
      // (longer benches repeat the block per 8 ft). Same bench transform the
      // fixtures use; the stats count below is these same placements.
      {
        const { points, cellW, cellL } = plantGrid(r.w * deckWidthScale(tiers), r.h);
        const cellMin = Math.min(cellW, cellL);
        const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
        for (let t = 0; t < tiers; t++) {
          const deckY = deckYForTier(tiers, t, TIER_VERTICAL_PITCH_IN);
          points.forEach((p) => {
            const px = cx2 + cosR * p.x - sinR * p.z;
            const pz = cz2 + sinR * p.x + cosR * p.z;
            (roomPlantData[rid] = roomPlantData[rid] || []).push({
              x: px, y: deckY, z: pz, yaw: rotY + plantYawJitter(px, pz), cellMin,
            });
            plants += 1;
          });
        }
      }
      let fitW = r.w;
      let fitL = r.h;

      const targetGroup = roomGroups[rid] || benchesGroup;

      // Contact shadow — a soft radial pool under every bench footprint, the
      // cheap half of "ambient occlusion": the shadow map darkens a bench's far
      // side, this grounds its feet. Receive-only, so it never casts.
      const decal = new THREE.Mesh(decalGeo, getBenchContactMaterial());
      decal.scale.set(r.w * 1.3, 1, r.h * 1.3);
      decal.position.set(cx2, 0.55, cz2);
      decal.rotation.y = rotY;
      decal.renderOrder = 1;
      decal.userData.shadowMode = "receive";
      if (b.id) decal.userData.benchId = b.id;
      targetGroup.add(decal);

      // Tap target for the mobile-aisle column slide (rooms with an id only —
      // the slide edits that room's rooms[] layout).
      if (rr.id && b.id) {
        const hitH = getTierRackTargetH(tiers) || 36;
        const hit = new THREE.Mesh(benchHitGeo, benchHitMat);
        hit.scale.set(r.w, hitH, r.h);
        hit.position.set(cx2, hitH / 2, cz2);
        hit.rotation.y = rotY;
        hit.userData.benchId = b.id;
        hit.userData.roomId = rr.id;
        hit.userData.shadowMode = "none";
        targetGroup.add(hit);
        benchHitBoxes.push(hit);
      }
      contentItems.push({ group: targetGroup, x: cx2, z: cz2, w: r.w, l: r.h, rotY, h: getTierRackTargetH(tiers) || 36 });

      // Grow-light image texture: lay a top-facing textured plane just above the fixture.
      // Skipped when the Lights layer is hidden (view-only).
      if (lightTexUrl && !lightsHidden) {
        const planeY = getTierRackTargetH(tiers) + 0.5;
        // VISUAL-ONLY: on DT/TT racks narrow the light plane width so it lines up
        // with the rack frame instead of overhanging. Single-tier stays 1. TUNE.
        const texPlaneW = fitW; // full bench width, like the top light layer
        lightTexReady.then(() => {
          if (sceneDisposed || !lightTex) return;
          const plane = buildLightTexturePlane(texPlaneW, fitL, lightTex, lightTexAspect, { grow: lightMode === "grow" });
          plane.position.set(cx2, planeY, cz2);
          plane.rotation.z = rotY;
          plane.userData.benchId = b.id;
          targetGroup.add(plane);
          invalidate();
        });
      }

      // ── Grow Lights — FIT TO BENCH, one identical layer PER TIER ──
      // Same Phoenix pipeline as single-tier (full bench width × 1/count length
      // slice, rotation-aware, 1 per 4ft, display-only, not persisted/selectable).
      // Double/triple-tier benches render the SAME single-tier layout once per
      // tier — only the Y level changes (getTierLightYLevels). Skipped when the
      // bench type or the tier rack GLB has baked-in lights.
      if (!lightsHidden && !BENCH_HAS_BUILTIN_LIGHT[b?.type || "rolling"] && !TIER_GLB_HAS_BUILTIN_LIGHT[tiers]) {
        // Per-layer fixture width (growLightFit.TIER_LIGHT_WIDTH_SCALES): the top
        // layer spans the bench, the layers under a deck clear the rack posts.
        const widthScales = getTierLightWidthScales(tiers);
        getTierLightYLevels(tiers).forEach((yLevel, tier) => {
          const fit = growLightPlacements(r, cx2, cz2, rotY, yLevel, widthScales[tier] ?? 1);
          // The deck this light layer shines on, so its canopy pool (roomEmission)
          // lands on its own tier — the same deck heights the canopy layer uses.
          // Single tier: the ZATLA rolling bench's mesh tray spans ~13.5–18in
          // (measured from the model at its 54in fit), so the pool sits just on top
          // of it instead of inside it at the nominal 14in deck.
          const SINGLE_TIER_POOL_Y = 18.5;
          fit.deckY = tiers === 1 ? SINGLE_TIER_POOL_Y : deckYForTier(tiers, tier, TIER_VERTICAL_PITCH_IN);
          fit.benchId = b.id; // roomLights / roomEmission tag their meshes, so a column slide moves them
          (roomLightData[rid] = roomLightData[rid] || []).push(fit);
        });
      }

      // Pick the GLB: dedicated tier model first, fall back to single-tier type model.
      const tierUrl = getTierGlbUrl(tiers);
      const glbUrl = tierUrl || getBenchGlbUrl(b);

      // Dedicated pre-built tier rack GLBs (doubleTierUrl/tripleTierUrl): fit X/Z
      // EXACTLY to the bench footprint (r.w × r.h — never widened, so the rack
      // can't overhang aisles) and fit height to the shared tier module system
      // (getTierRackTargetH), the SAME vertical pitch the light Y levels use —
      // so each light layer lands inside its tier's frame.
      // lengthAxis "z": the fitter turns the model as needed so its LENGTH always
      // runs along local Z (the bench's long axis at rotationDeg 0), whichever axis
      // the GLB was authored along.
      const fitOpts = { uniform: false, targetH: getTierRackTargetH(tiers), lengthAxis: "z", benchFinish: true };
      if (tierUrl) {
        // VISUAL-ONLY width dial for the DT/TT rack (render group only — footprint
        // data, placement and layout math never see it). The ZATLA double/triple
        // racks fill their bounding boxes edge to edge, so they fit the footprint
        // at 1×. (The old DT model had empty margin baked in and needed 2×.)
        const TIER_RACK_VISUAL_WIDTH_SCALE = { 2: 1.0, 3: 1.0 };
        fitOpts.visualWidthScale = TIER_RACK_VISUAL_WIDTH_SCALE[tiers] || 1;
        // Length stays at the TRUE footprint (1×) so a 4×8 rack spans exactly its
        // real length (2 light segments) — no length stretch.
        const TIER_RACK_VISUAL_LENGTH_SCALE = { 2: 1.0, 3: 1.0 };
        fitOpts.visualLengthScale = TIER_RACK_VISUAL_LENGTH_SCALE[tiers] || 1;
      }
      // (Per-type quarter turns used to live here; lengthAxis "z" above derives
      // the same correction from each model's real long axis.)

      // ── Canopy layer — per-room canopyMode picks canopy lights (default), none,
      // or the Air Circulation .glb. One canopy layer per tier on that tier's deck;
      // display-only, never persisted/selectable. (See renderCanopyLayer.)
      if (!lightsHidden && !BENCH_HAS_BUILTIN_CANOPY[b?.type || "rolling"]) {
        renderCanopyLayer({
          canopyMode: rr.canopyMode || "canopy", canopyLightUrl, airCirculationUrl, uclStandUrl,
          tierVerticalPitchIn: TIER_VERTICAL_PITCH_IN,
          r, cx2, cz2, rotY, tiers, targetGroup,
          // Every canopy placement carries its bench id, so a column slide moves
          // the fixtures with their bench.
          placeModel: (url, w, l, placements, ...rest) =>
            placeCanopyBatched(url, w, l, placements.map((pl) => ({ ...pl, benchId: b.id })), ...rest),
        });
      }

      if (typeof glbUrl !== "string" || glbUrl.trim() === "") {
        // No GLB uploaded — use procedural scaffold bench as default fallback
        // so benches are always visible in 3D.
        noUrlBenches.push({ x: cx2, z: cz2, rotY, fitW, fitL, tiers, bench: b, group: targetGroup });
        return;
      }

      // Key placement groups by room too, so each room's benches land in that
      // room's rotated pivot group (instancing still collapses identical models
      // within a room).
      const groupKey = JSON.stringify({ rid, url: glbUrl, fitW, fitL, opts: fitOpts });
      if (!placementGroups.has(groupKey)) {
        placementGroups.set(groupKey, { url: glbUrl, fitW, fitL, opts: fitOpts, placements: [], isTier: !!tierUrl, target: targetGroup });
      }
      placementGroups.get(groupKey).placements.push({ x: cx2, y: 0, z: cz2, rotationY: rotY, benchId: b.id });
    });
    }); // end renderRooms loop

    // ── Per-room grow-light fixtures (same Phoenix placement pipeline) ──────
    // Each room renders its CHOSEN light model into its own light group; a model
    // change crossfades only that room's group in place (see roomLights.js).
    lightApiRef.current = createRoomLights({
      renderRooms, roomGroups, roomLightData, models, trackMat,
      fallbackGroup: benchesGroup,
      invalidate: () => invalidate(),
      isDisposed: () => sceneDisposed,
      mobile: isMobile,
    });

    // ── PPFD layer (display-only) ───────────────────────────────────────────
    // The grow light's printed spec-sheet map (lib/lighting/ppfdMaps.js), exactly
    // as printed, laid over EVERY fixture's footprint — each 4 ft fixture shows the
    // same map. Colour only: at whole-room size the numbers can't be read, so they
    // live on the spec-sheet card. Floats just over the fixtures so it reads from
    // above. Ported from the GrowStudios PPFD view.
    const PPFD_CLEARANCE_IN = 6; // TUNE: how far the map floats over each fixture
    const SHEET_CELL_PX = 32; // canvas pixels per printed cell
    // Toggle-on animation: each map pops in (scale 0 → 1, slight overshoot),
    // blooming outward from the middle of the room. TUNE.
    const POP_MS = 600, POP_MS_PER_IN = 2.5;
    let popStart = null;
    const heatMeshes = [];
    const heatDisposables = new Set();
    const clearHeat = () => {
      heatMeshes.forEach((m) => m.parent?.remove(m));
      heatMeshes.length = 0;
      heatDisposables.forEach((x) => x.dispose());
      heatDisposables.clear();
    };
    // transpose: lay the sheet's long side along the fixture's long side.
    const sheetTexture = (map, transpose) => {
      const grid = transpose ? map.grid[0].map((_, i) => map.grid.map((row) => row[i])) : map.grid;
      const filled = fillGrid(grid);
      const st = gridStats(grid);
      const range = Math.max(1, st.max - st.min);
      const rows = grid.length, cols = grid[0].length, px = SHEET_CELL_PX;
      const canvas = document.createElement("canvas");
      canvas.width = cols * px; canvas.height = rows * px;
      const ctx = canvas.getContext("2d");
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const [cr, cg, cb] = heatRgbVivid((filled[j][i] - st.min) / range);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},0.96)`;
          ctx.fillRect(i * px, j * px, px, px);
        }
      }
      // Bright outline so neighbouring fixtures' tiles read apart at room zoom.
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(4, px * 0.06);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, canvas.width - ctx.lineWidth, canvas.height - ctx.lineWidth);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
      heatDisposables.add(tex);
      return tex;
    };
    // One tile per fixture, from the SAME fits the fixtures are drawn from
    // (growLightPlacements: benchW across, segLen along, rotationY).
    const drawSheet = (rid, map, fits) => {
      const parent = roomGroups[rid] || benchesGroup;
      const lights = [];
      fits.forEach((f) => f.placements.forEach((p) => {
        lights.push({ x: p.x, y: p.y ?? f.topY, z: p.z, w: f.benchW, l: f.segLen, rotY: p.rotationY || 0 });
      }));
      if (!lights.length) return;
      const rows = map.grid.length, cols = map.grid[0].length;
      const mats = {}, geos = {};
      const mx = lights.reduce((a, l) => a + l.x, 0) / lights.length;
      const mz = lights.reduce((a, l) => a + l.z, 0) / lights.length;
      lights.forEach((l) => {
        const transpose = rows !== cols && (cols > rows) !== (l.w > l.l);
        const mk = `${transpose}`;
        if (!mats[mk]) {
          mats[mk] = new THREE.MeshBasicMaterial({ map: sheetTexture(map, transpose), transparent: true, depthWrite: false });
          heatDisposables.add(mats[mk]);
        }
        const gk = `${l.w}x${l.l}`;
        if (!geos[gk]) {
          geos[gk] = new THREE.PlaneGeometry(l.w, l.l).rotateX(-Math.PI / 2);
          heatDisposables.add(geos[gk]);
        }
        const mesh = new THREE.Mesh(geos[gk], mats[mk]);
        mesh.position.set(l.x, l.y + PPFD_CLEARANCE_IN, l.z);
        mesh.rotation.y = l.rotY;
        mesh.renderOrder = 3;
        mesh.visible = ppfdOverlayRef.current;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.slideHide = true; // hidden during a mobile-aisle column slide
        mesh.userData.shadowMode = "none";
        mesh.userData.popDelay = Math.hypot(l.x - mx, l.z - mz) * POP_MS_PER_IN;
        parent.add(mesh);
        heatMeshes.push(mesh);
      });
    };
    ppfdApiRef.current = {
      setVisible: (on) => {
        heatMeshes.forEach((m) => { m.visible = on; if (on) m.scale.setScalar(0.001); });
        popStart = on && heatMeshes.length ? performance.now() : null;
        if (!on) heatMeshes.forEach((m) => m.scale.setScalar(1));
        invalidate();
      },
      // Called every frame by animate(); true while maps are still popping in.
      tick: (now) => {
        if (popStart == null) return false;
        let running = false;
        heatMeshes.forEach((m) => {
          const t = Math.max(0, Math.min(1, (now - popStart - m.userData.popDelay) / POP_MS));
          if (t < 1) running = true;
          const k = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // ease-out-back
          m.scale.setScalar(Math.max(0.001, t === 0 ? 0.001 : k));
        });
        if (!running) popStart = null;
        return true;
      },
      dispose: clearHeat,
      // Redraw every room's tiles from its CURRENT grow light (a light-model change
      // swaps fixtures in place without a rebuild, so it calls this too).
      recompute: () => {
        if (sceneDisposed) return;
        const d = docRef.current;
        clearHeat();
        popStart = null;
        renderRooms.forEach((rr, idx) => {
          const rid = rr.__rid || `__room_${idx}`;
          const rm = (d?.rooms || []).find((x) => x.id === rid);
          const modelKey = (rm ? rm.lightModel : d?.lightModel) || "phoenix";
          const fits = roomLightData[rid] || [];
          const sheet = fits.length ? specSheetFor(modelKey) : null;
          if (sheet) drawSheet(rid, sheet.map, fits);
        });
        invalidate();
      },
    };
    ppfdApiRef.current.recompute();

    // Light emission beams + photons, coloured by each room's spectrum. Skipped on
    // phones: InstancedMesh beams fail on some phone GPUs (the GPS app skips them too).
    emissionApiRef.current = isMobile ? null : createRoomEmission({
      renderRooms, roomGroups, roomLightData,
      fallbackGroup: benchesGroup,
      invalidate: () => invalidate(),
      isDisposed: () => sceneDisposed,
      reducedMotion,
      enabled: beamsOnRef.current,
    });
    emissionApiRef.current?.setAnimating(animatingRef.current);
    uclEmissionsRef.current = uclEmissions;

    // Plants — instanced per room: one InstancedMesh per material, never per plant.
    // OFF while we rule plants out as a cause of lag (RENDER_PLANTS_IN_3D in
    // plantLayout.js): no plant model is loaded or drawn. The plant COUNT in the stats
    // is still the real 6-per-bench number. Set the flag to true to bring them back.
    if (RENDER_PLANTS_IN_3D) {
      renderPlantField({
        roomPlantData, roomGroups, fallbackGroup: benchesGroup,
        url: resolvePlantUrl(models, plants, { mobile: isMobile }), loadGLB,
        isDisposed: () => sceneDisposed, trackMat, invalidate: () => invalidate(),
        bake: isMobile, // phones: merged static meshes, not InstancedMesh
      });
    }

    // (Canopy fixtures are flushed after ALL benches are queued — see below — so
    // they can be dropped onto the real bench table surface.)

    // Second pass — render each placement group.
    // Benches with ≥2 placements of the same footprint use InstancedMesh (single
    // material per shader, frustum culling), collapsing dozens of mesh clones into
    // one draw call per material. This used to be tier racks only, which left every
    // single-tier bench as its own set of draw calls (benches x meshes per GLB) —
    // the main cost of a big layout. Set instanceSingleTier = false to go back.
    // Phones never instance (InstancedMesh draws black on some phone GPUs — the GPS
    // app guards it the same way); lone benches use per-bench clones via placeModel.
    const instanceSingleTier = true;
    placementGroups.forEach((group) => {
      const { url, fitW, fitL, opts, placements, isTier, target } = group;
      const dest = target || benchesGroup;
      if (!isMobile && placements.length >= 2 && (isTier || instanceSingleTier)) {
        benchLoadPromises.push(loadGLB(url).then((sceneObj) => {
          if (sceneDisposed) return;
          const template = fitModelToFootprint(sceneObj, fitW, fitL, opts);
          applyBenchMaterials(template);
          if (opts.benchFinish) applyZatlaBenchFinish(template);
          const parts = flattenGroupByMaterial(template);
          // Safety net: merging by material must keep every triangle. If it dropped any
          // (e.g. one material shared by meshes with different attributes), draw
          // per-bench clones instead so no bench part can ever go missing.
          const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
          let srcTris = 0;
          template.traverse((o) => { if (o.isMesh && o.geometry) srcTris += triCount(o.geometry); });
          let partTris = 0;
          parts.forEach(({ geometry }) => { partTris += triCount(geometry); });
          if (partTris < srcTris - 1) {
            parts.forEach(({ geometry }) => geometry.dispose());
            template.clear();
            console.warn("[GLB] instancing dropped geometry; using per-bench meshes", { url: url.substring(url.lastIndexOf("/") + 1), srcTris, partTris });
            placeModel(url, fitW, fitL, placements, 0, dest, opts);
            return;
          }
          // Dispose template mesh GEOMETRIES only — materials are now referenced
          // by the InstancedMeshes and must stay alive for GPU rendering.
          template.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
          });
          template.clear();
          const ims = instanceParts(parts, placements);
          ims.forEach((im) => {
            im.userData.perfTag = "benches";
            // Instance i is placements[i]'s bench — a column slide moves only those.
            im.userData.instanceBenchIds = placements.map((pl) => pl.benchId);
            trackMat(im.material);
            im.castShadow = im.receiveShadow = true; // merged copies land after the scene-wide shadow pass
            dest.add(im);
          });
          console.log("[GLB] benches instanced", { url: url.substring(url.lastIndexOf("/") + 1), count: placements.length });
          invalidate();
        }).catch((err) => {
          console.error("[GLB] instanced render failed", { url: url.substring(url.lastIndexOf("/") + 1), message: err?.message || err?.toString?.() });
          console.error(err);
        }));
      } else {
        // Fallback to individual mesh placement (single-tier or lone tier bench).
        placeModel(url, fitW, fitL, placements, 0, dest, opts);
      }
    });

    // Render procedural scaffold benches as default fallback when no GLB model
    // is uploaded — benches always visible in 3D regardless of model library state.
    //
    // PERFORMANCE: one scaffold bench is ~150 meshes (150 draw calls, 4 materials), so
    // 40 of them as separate objects is ~6,000 draw calls. Identical benches (same
    // size and tiers, same room) are merged by material and drawn as 4 InstancedMeshes
    // (or 4 plain merged meshes on phones, which avoid InstancedMesh).
    const markProcedural = (root) => {
      root.traverse((o) => {
        if (o.isMesh) {
          trackMat(o.material);
          // Mark procedural materials to skip disposal — they're module-level
          // shared constants reused across all scaffold benches.
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m) m.userData._procedural = true; });
        }
      });
    };
    const scaffoldSets = new Map(); // destination group → Map(size key → { fitW, fitL, tiers, placements })
    noUrlBenches.forEach((b) => {
      const dest = b.group || benchesGroup;
      if (!scaffoldSets.has(dest)) scaffoldSets.set(dest, new Map());
      const bySize = scaffoldSets.get(dest);
      const key = `${b.fitW}|${b.fitL}|${b.tiers}`;
      if (!bySize.has(key)) bySize.set(key, { fitW: b.fitW, fitL: b.fitL, tiers: b.tiers, placements: [] });
      bySize.get(key).placements.push({ x: b.x, y: 0, z: b.z, rotationY: b.rotY, benchId: b.bench?.id });
    });
    // Big layouts get coarser round parts (fewer triangles per bench): a scaffold bench is
    // ~8k triangles at full detail, so 250 of them alone would be 2M.
    const scaffoldDetail = noUrlBenches.length > 150 ? 0.35 : noUrlBenches.length > 60 ? 0.5 : 1;
    scaffoldSets.forEach((bySize, dest) => bySize.forEach(({ fitW, fitL, tiers, placements }) => {
      const template = buildScaffoldBench(fitW, fitL, tiers, { detail: scaffoldDetail });
      markProcedural(template);
      if (placements.length >= 2) {
        const parts = flattenGroupByMaterial(template);
        const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
        let srcTris = 0;
        template.traverse((o) => { if (o.isMesh && o.geometry) srcTris += triCount(o.geometry); });
        let partTris = 0;
        parts.forEach(({ geometry }) => { partTris += triCount(geometry); });
        if (partTris >= srcTris - 1) {
          const meshes = isMobile ? bakePartsPerBench(parts, placements) : instanceParts(parts, placements);
          meshes.forEach((mesh) => { mesh.userData.perfTag = "benches"; if (mesh.isInstancedMesh) mesh.userData.instanceBenchIds = placements.map((pl) => pl.benchId); mesh.castShadow = mesh.receiveShadow = true; dest.add(mesh); });
          template.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
          template.clear();
          return;
        }
        // Merging lost geometry — keep every bench part: fall through to separate copies.
        parts.forEach(({ geometry }) => geometry.dispose());
        console.warn("[scaffold] instancing dropped geometry; using separate benches", { srcTris, partTris });
      }
      placements.forEach((p, i) => {
        const scaffold = i === 0 ? template : buildScaffoldBench(fitW, fitL, tiers, { detail: scaffoldDetail });
        if (i > 0) markProcedural(scaffold);
        scaffold.position.set(p.x, 0, p.z);
        scaffold.rotation.y = p.rotationY;
        scaffold.userData.perfTag = "benches";
        if (p.benchId) scaffold.userData.benchId = p.benchId;
        dest.add(scaffold);
      });
    }));
    if (noUrlBenches.length) {
      console.log("[GLB] procedural fallback benches", { count: noUrlBenches.length });
    }
    invalidate();

    // Canopy fixtures recorded during the bench loop → drawn as instanced batches,
    // once every bench is in the scene so each bar can sit on the table top.
    flushCanopyBatches();

    // Bench-swap crossfade: fade the held snapshot out only after every new bench
    // GLB has loaded (resolves immediately when all benches are procedural).
    // Everything queued (benches, UCLs, fans) plus the grow lights: the loading
    // screen (first build) and the bench-swap crossfade both wait for all of it.
    const allModelsReady = Promise.allSettled([...benchLoadPromises, lightApiRef.current?.ready || Promise.resolve()]);
    // A build that has benches but loads NO models (the model library had not
    // arrived, so every bench is a placeholder) is about to be replaced: it gets
    // no reveal promise, so it can never lift the loading screen.
    const hasBenches = renderRooms.some((rr) => (rr.benches || []).length > 0);
    allModelsReadyRef.current = (benchLoadPromises.length > 0 || !hasBenches) ? allModelsReady : null;
    allModelsReady.then(() => {
      if (!sceneDisposed) onBenchesReadyRef.current?.();
    });

    // Stats — aggregated across every room in the facility.
    let canopySqIn = 0;
    let rackCount = 0;
    let fixtureCount = 0;
    renderRooms.forEach((rr) => {
      (rr.benches || []).forEach((b) => {
        const r = benchRect(b);
        const tiers = Math.max(1, Math.min(3, Math.round(b.tiers || 1)));
        canopySqIn += r.w * r.h * tiers;
      });
      rackCount += (rr.benches || []).length;
      fixtureCount += (rr.lights || []).length;
    });
    setStats({
      racks: rackCount,
      tiers: tierMode,
      plants: plants,
      fixtures: fixtureCount,
      canopySqft: Math.round(canopySqIn / 144),
      roomSqft: Math.round((roomW * roomL) / 144),
      heightFt: Math.round((ceil / 12) * 10) / 10,
      aisleFt: Math.round(((doc.settings?.centerIn || 0) / 12) * 10) / 10,
    });



    // Camera state
    let raf = null;
    // Wake the loop only when there's work to do; it sleeps itself when idle so the
    // tab uses ~0% GPU/CPU while the user isn't interacting.
    const wake = () => { if (raf === null) raf = requestAnimationFrame(animate); };
    invalidate = () => { needsRender = true; shadowsDirty = true; wake(); };
    // View-only redraw for the per-event camera paths (walk-mode look, keys,
    // resize): nothing moved, so the shadow map must not be re-rendered.
    const redraw = () => { needsRender = true; wake(); };
    const keys = {};
    let yaw = Math.PI, pitch = -0.15, dragging = false, lastX = 0, lastY = 0;
    const eyeHeight = 66; // 5'6" eye height for walkthrough
    const fp = { x: cx, z: roomL - 40 };
    // ── Walkthrough is scoped to the SELECTED room ──────────────────────────
    // Rotation-aware world-space bounds of the selected room (falls back to the
    // first room; legacy single-room docs resolve to the room at the origin).
    // Rooms rotate in 90° steps about their center, so the rotated footprint is
    // an axis-aligned rect: spans swap at 90/270. roomCenters is kept live by
    // positionRoomGroups, so a moved room's walk bounds stay correct. View-only.
    const WALK_PAD = 6;
    const walkRoomBounds = () => {
      const selId = selectedRoomIdRef.current;
      const rr = renderRooms.find((r) => r.__rid === selId) || renderRooms[0];
      if (!rr) return { minX: WALK_PAD, maxX: roomW - WALK_PAD, minZ: WALK_PAD, maxZ: roomL - WALK_PAD };
      const rw = rr.room?.widthIn || 0;
      const rl = rr.room?.lengthIn || 0;
      const ctr = roomCenters[rr.__rid] || { x: rr.origin.x + rw / 2, z: rr.origin.z + rl / 2 };
      const deg = ((Math.round((rr.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360;
      const swap = deg === 90 || deg === 270;
      const halfW = Math.max((swap ? rl : rw) / 2 - WALK_PAD, 1);
      const halfL = Math.max((swap ? rw : rl) / 2 - WALK_PAD, 1);
      return { minX: ctr.x - halfW, maxX: ctr.x + halfW, minZ: ctr.z - halfL, maxZ: ctr.z + halfL };
    };
    // Spawn the first-person eye inside the selected room: centered on X near the
    // room's entrance-side wall, facing INTO the room (same 5.5ft eye height).
    const walkSpawn = () => {
      const b = walkRoomBounds();
      fp.x = (b.minX + b.maxX) / 2;
      fp.z = Math.max(b.minZ, b.maxZ - 34);
      yaw = Math.PI; // forward = -z, into the room
      pitch = -0.05;
    };
    // Frame the stacked racks: raise the look-at target to the middle of the tier
    // stack and pull back enough that the tallest tier stays in view. Distance is
    // clamped so it never gets smaller than the room footprint (single tier).
    const STACK_PITCH_CAM = 44; // approx per-tier model height; matches stacking pitch
    const stackTopY = (tierMode - 1) * STACK_PITCH_CAM; // top deck height above base
    const lookAtY = 40 + stackTopY * 0.5;               // aim at mid-stack
    // Room Orbit can dolly to within 2 ft of its target for close inspection,
    // independent of the overall facility footprint.
    const minDist = 24;

    // ── Default orbit pose: a three-quarter view fitted to the CONTENT ──────
    // The content box is every bench's footprint at its rack height; a layout
    // with no benches frames the facility footprint at a third of the ceiling
    // instead. cameraFit explains the heading and the corner-projection fit; it
    // never moves `camera`. (Same opening shot as GrowStudios.)
    scene.updateMatrixWorld(true);
    const contentBox = new THREE.Box3();
    {
      const v = new THREE.Vector3();
      contentItems.forEach((it) => {
        const c = Math.cos(it.rotY), sn = Math.sin(it.rotY);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, d]) => {
          const lx = (a * it.w) / 2, lz = (d * it.l) / 2;
          [0, it.h].forEach((y) => {
            v.set(it.x + lx * c + lz * sn, y, it.z - lx * sn + lz * c).applyMatrix4(it.group.matrixWorld);
            contentBox.expandByPoint(v);
          });
        });
      });
    }
    const contentFinite = !contentBox.isEmpty()
      && [contentBox.min, contentBox.max].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    if (!contentFinite) contentBox.makeEmpty();
    // Frame the whole room, not just its racks: a benches-only box sat the camera
    // so close on a small room that the walls and their labels were cropped (and
    // a triple-tier rack filled the frame). Union with the facility footprint.
    contentBox.union(new THREE.Box3(
      new THREE.Vector3(bounds.minX, 0, bounds.minZ),
      new THREE.Vector3(bounds.maxX, ceil * 0.35, bounds.maxZ),
    ));
    const orbitPose = () => fitCameraToBox(camera, contentBox, defaultCamDir(), 0.78);
    const maxDist = Math.max(roomW, roomL) * 2.5 + stackTopY * 1.4;

    // ── Camera mode machine ─────────────────────────────────────────────────
    // Three view modes, all CAMERA-ONLY (never touches data/layout):
    //   orbit       — free perspective orbit (default, existing behavior)
    //   topdown     — orthographic blueprint, straight down, pan + zoom only
    //   walkthrough — first-person at 5.5ft eye height, swipe to look, tap to walk
    // An ortho camera mirrors the perspective camera for the top-down projection.
    // Transitions are smooth: the perspective camera tweens between poses; the
    // perspective↔ortho swap happens at the END of the tween (graceful).
    const orthoCamera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10000, cameraFar);
    // Which camera the render loop draws with. Starts perspective.
    let activeCamera = camera;
    // The "fp" walkthrough flag derived live from the camera-mode ref.
    const isWalk = () => cameraModeRef.current === "walkthrough";

    // Set the ortho frustum to frame the facility at a given half-height (inches),
    // preserving the canvas aspect ratio. Used for the top-down blueprint view.
    const setOrthoFrame = (halfH) => {
      const aspect = (mount.clientWidth || W) / (mount.clientHeight || H);
      orthoCamera.top = halfH;
      orthoCamera.bottom = -halfH;
      orthoCamera.left = -halfH * aspect;
      orthoCamera.right = halfH * aspect;
      orthoCamera.updateProjectionMatrix();
    };

    // ---- Orbit / Top-Down share a single OrbitControls instance ----
    // Camera-only. Damping gives smooth inertia; drag = orbit (orbit mode only),
    // scroll/pinch = dolly zoom, right-drag/two-finger = pan.
    let controls = new OrbitControls(camera, renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    if (camPoseRef.current) {
      // Rebuild (e.g. added equipment): keep the user's current camera exactly.
      const p = camPoseRef.current;
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      controls.target.set(p.target[0], p.target[1], p.target[2]);
    } else {
      // First build: the three-quarter default framing.
      const p0 = orbitPose();
      camera.position.copy(p0.pos);
      controls.target.copy(p0.tgt);
    }
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = minDist;
    controls.maxDistance = maxDist;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.addEventListener("change", () => {
      needsRender = true; wake();
      // Persist the user's camera so a rebuild (added equipment) keeps it exactly.
      camPoseRef.current = {
        pos: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      };
    });
    controls.update();

    // The mode's NATURAL one-finger touch action (orbit / pan). When Move mode is
    // ON we override ONE→null so a single finger only ever drives the room drag,
    // never the camera — while two-finger pinch/pan stays on in BOTH states.
    const oneFingerForMode = (m) => (m === "topdown" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE);
    // Apply per-mode OrbitControls constraints (no rebuild). Top-down locks the
    // polar angle straight down and disables rotation → pan + zoom only.
    const applyOrbitConstraints = (m) => {
      const one = roomMoveModeRef.current ? null : oneFingerForMode(m);
      if (m === "topdown") {
        controls.enableRotate = false;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = 0;
        controls.touches = { ONE: one, TWO: THREE.TOUCH.DOLLY_PAN };
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      } else {
        controls.enableRotate = true;
        controls.minPolarAngle = 0.05;
        controls.maxPolarAngle = Math.PI * 0.92;
        controls.touches = { ONE: one, TWO: THREE.TOUCH.DOLLY_PAN };
        controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      }
    };
    // Swap ONLY the one-finger touch action live when the Move toggle flips, without
    // a scene rebuild. Two-finger pinch/pan is always preserved.
    touchModeApiRef.current = {
      setRoomMoveTouch: () => {
        controls.touches = {
          ONE: roomMoveModeRef.current ? null : oneFingerForMode(cameraModeRef.current),
          TWO: THREE.TOUCH.DOLLY_PAN,
        };
        controls.update?.();
      },
    };

    // Smooth camera transition state. While `tween` is active the render loop
    // interpolates the perspective camera position/target each frame.
    let tween = null; // { fromPos, toPos, fromTgt, toTgt, t, dur, onDone }
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const startTween = (toPos, toTgt, onDone) => {
      tween = {
        fromPos: camera.position.clone(),
        toPos: toPos.clone(),
        fromTgt: controls.target.clone(),
        toTgt: toTgt.clone(),
        t: 0, dur: 0.6, onDone: onDone || null,
      };
      wake();
    };

    // Target pose (perspective camera) for each mode.
    const poseForMode = (m) => {
      if (m === "topdown") {
        // High overhead, looking straight down at facility center.
        const h = Math.max(roomW, roomL) * 1.2;
        return { pos: new THREE.Vector3(cx, h, cz + 0.001), tgt: new THREE.Vector3(cx, 0, cz) };
      }
      // orbit default framing: the three-quarter content fit
      const p = orbitPose();
      return { pos: p.pos, tgt: p.tgt };
    };

    // Switch camera mode with a smooth transition. Never rebuilds the scene.
    const setCameraMode = (m, animated = true) => {
      // Lens per mode, set before any pose below is fitted against the camera.
      camera.fov = m === "walkthrough" ? WALK_FOV : ORBIT_FOV;
      camera.updateProjectionMatrix();
      // Leaving walkthrough → re-enable controls and tween back to an orbit/ortho pose.
      if (m === "walkthrough") {
        // Enter first-person: snap eye to a sensible spot, disable orbit controls.
        controls.enabled = false;
        activeCamera = camera;
        // Spawn inside the SELECTED room, facing into it.
        walkSpawn();
        tween = null;
        invalidate();
        return;
      }
      // Entering orbit or topdown.
      controls.enabled = true;
      const { pos, tgt } = poseForMode(m);
      const finish = () => {
        applyOrbitConstraints(m);
        if (m === "topdown") {
          // Frame the WHOLE facility, fitting both width and depth no matter the
          // canvas aspect ratio. Half-height must cover the facility depth AND the
          // facility width / aspect, whichever is larger, plus a small margin.
          const aspect = (mount.clientWidth || W) / (mount.clientHeight || H);
          const fitHalfH = Math.max(roomL / 2, (roomW / 2) / aspect) * 1.08;
          setOrthoFrame(fitHalfH);
          orthoCamera.position.set(cx, Math.max(roomW, roomL) * 1.2, cz + 0.001);
          orthoCamera.up.set(0, 0, -1);
          orthoCamera.lookAt(cx, 0, cz);
          activeCamera = orthoCamera;
          // Drive OrbitControls with the ortho camera so pan/zoom keep working.
          controls.object = orthoCamera;
        } else {
          activeCamera = camera;
          controls.object = camera;
        }
        controls.target.copy(tgt);
        controls.update();
        invalidate();
      };
      if (animated && cameraModeRef.current !== m) {
        // Always tween using the PERSPECTIVE camera for a smooth move, then swap.
        activeCamera = camera;
        controls.object = camera;
        controls.enabled = false; // suppress input during the flight
        startTween(pos, tgt, () => { controls.enabled = true; finish(); });
      } else {
        camera.position.copy(pos);
        finish();
      }
    };
    cameraApiRef.current = { setCameraMode };

    // Initialize the camera mode. On a REBUILD (camPoseRef already restored above),
    // do NOT let orbit-mode re-pose to default framing — that would clobber the
    // user's view (the add-equipment / ducting-rotate camera jump). Only seed the
    // default framing on the very first build.
    const _isRebuild = !!camPoseRef.current;
    const _mode = cameraModeRef.current;
    if (_isRebuild && _mode === "orbit") {
      // Keep the restored camera.position + controls.target from the block above.
      // Just (re)apply the orbit input constraints — no re-framing.
      activeCamera = camera;
      controls.object = camera;
      controls.enabled = true;
      applyOrbitConstraints("orbit");
      controls.update();
      invalidate();
    } else {
      // First build (default framing) OR topdown/walkthrough (need their own pose).
      setCameraMode(_mode, false);
      // Cinematic intro — ONLY on the very first orbit-mode build (not a rebuild,
      // not topdown/walkthrough). Start pulled back & higher, then glide to the
      // default framing setCameraMode just set. Camera-only; render-only.
      if (!_isRebuild && _mode === "orbit") {
        const p = orbitPose();
        const introTarget = p.tgt.clone();
        const finalPos = p.pos.clone();
        // Intro start: further out along the same line of sight, for a gentle fly-in.
        const introPos = p.tgt.clone().addScaledVector(p.pos.clone().sub(p.tgt), 1.3);
        camera.position.copy(introPos);
        controls.target.copy(introTarget);
        controls.update();
        // Defer the glide until the scene is painted so the fly-in is visible.
        introPendingRef.current = { finalPos, introTarget };
      }
    }

    // Kick the deferred cinematic intro glide now that startTween + controls exist.
    // The user can grab/drag to interrupt at any time (controls stay enabled).
    if (introPendingRef.current) {
      const { finalPos, introTarget } = introPendingRef.current;
      introPendingRef.current = null;
      startTween(finalPos, introTarget);
      if (tween) tween.dur = 1.4; // TUNE intro length (bigger = slower fly-in)
      if (tween) tween.intro = true; // onResize refits its destination while it flies
    }

    // ── Room selection: highlight + camera framing ───────────────────────────
    // `currentHighlight` is the highlight materials the render loop pulses (null =
    // nothing selected). selectRoom() toggles which room's highlight shows and, in
    // orbit mode, tweens the camera to orbit that room's center. Passing null
    // clears the highlight and re-frames the whole facility. View-only.
    let currentHighlight = null;
    const frameRoom = (roomId, animated) => {
      // Re-aim the orbit camera at the selected room's center (or facility center
      // when nothing is selected) WITHOUT changing zoom: keep the camera's CURRENT
      // distance + angle from its target and just translate the look-at point onto
      // the room. No per-room fit distance — the user's zoom is always preserved.
      const ctr = (roomId && roomCenters[roomId]) || { x: cx, z: cz };
      const newTgt = new THREE.Vector3(ctr.x, lookAtY, ctr.z);
      // Top-down/walkthrough manage their own camera — only re-target there.
      if (cameraModeRef.current !== "orbit") {
        controls.target.copy(newTgt);
        controls.update();
        invalidate();
        return;
      }
      // Current camera→target offset captures both the distance (zoom) and the view
      // angle. Re-applying it from the new target pans the view onto the room while
      // keeping zoom + angle identical.
      const offset = camera.position.clone().sub(controls.target);
      const newPos = newTgt.clone().add(offset);
      if (animated) {
        controls.enabled = false;
        startTween(newPos, newTgt, () => { controls.enabled = true; controls.target.copy(newTgt); controls.update(); invalidate(); });
        // Shorter, snappier pan for room selection (~400ms). startTween replaces
        // any in-flight tween, so re-clicking mid-transition retargets cleanly.
        if (tween) tween.dur = 0.4;
      } else {
        camera.position.copy(newPos);
        controls.target.copy(newTgt);
        controls.update();
        invalidate();
      }
    };
    // Late-bound overlap-tint hook: setRoomDragRed + isRoomOverlapping are declared
    // further down in build(), AFTER selectRoom. selectRoom is only ever CALLED at
    // runtime (post-build), so by then this is wired — we assign it just below their
    // definitions. It tints the selected room's highlight RED when that room overlaps
    // another, GREEN otherwise. View-only.
    let applySelectionOverlapTint = null;
    const selectRoom = (roomId, animated = true) => {
      // Crossfade the highlight swap (~250ms) — the old selection fades out while
      // the new one fades in. Meshes are never removed/recreated; only a per-
      // highlight fade factor that the render loop applies to material opacity.
      // Then PAN the camera onto the room. frameRoom preserves the user's current
      // zoom (distance + angle), so selecting only re-centers, never zooms.
      Object.entries(selectHighlights).forEach(([id, h]) => {
        const show = id === roomId;
        if (!animated) {
          // Instant (initial build / restore) — no fade.
          h.group.visible = show;
          h.fadeK = show ? 1 : 0;
          h.fadeDir = 0;
          return;
        }
        if (show) {
          if (!h.group.visible || h.fadeDir === -1) {
            h.fadeFrom = h.group.visible ? (h.fadeK ?? 1) : 0;
            h.fadeDir = 1;
            h.fadeT0 = performance.now();
            h.group.visible = true;
          }
        } else if (h.group.visible && h.fadeDir !== -1) {
          h.fadeFrom = h.fadeK ?? 1;
          h.fadeDir = -1;
          h.fadeT0 = performance.now();
        }
      });
      currentHighlight = (roomId && selectHighlights[roomId]) || null;
      // Green when the selected room is clear, red when it overlaps another room.
      if (roomId) applySelectionOverlapTint?.(roomId);
      // Dimensions follow the selection: move the labels to the newly-selected room.
      updateDimensionVisibility(roomId);
      // In walkthrough, selecting a room TELEPORTS the eye into it (same spawn
      // logic as entering the mode). Other modes pan/re-target via frameRoom.
      if (cameraModeRef.current === "walkthrough" && roomId) {
        walkSpawn();
        invalidate();
        return;
      }
      frameRoom(roomId, animated); // pan to room, preserve current zoom
    };
    selectApiRef.current = { selectRoom };
    // Apply the initial selection from props. Defer one tick so the overlap-tint
    // helpers (defined below) are wired before the first tint runs.
    setTimeout(() => { if (!sceneDisposed) selectRoom(selectedRoomId, false); }, 0);

    // Reconcile committed rooms[].offset onto each room's pivot group IN PLACE.
    // A pure facility-move (or its undo)
    // is kept OUT of docKey, so the scene never rebuilds; this just sets each
    // group's world position to (offset + halfDims) — the SAME room-center the build
    // path computes from rm.offset — using the room's CURRENT dims (so it stays
    // correct even mid-build for the active room). Display-only; never touches data.
    const positionRoomGroups = (rooms) => {
      (rooms || []).forEach((rm) => {
        const g = roomGroups[rm.id];
        if (!g) return;
        const rr = renderRooms.find((r) => r.__rid === rm.id);
        const rw = rr?.room?.widthIn || rm.room?.widthIn || 0;
        const rl = rr?.room?.lengthIn || rm.room?.lengthIn || 0;
        const off = rm.offset || { x: 0, y: 0 };
        const ccx = (off.x || 0) + rw / 2;
        const ccz = (off.y || 0) + rl / 2;
        g.position.x = ccx;
        g.position.z = ccz;
        // Keep the cached center in sync so equipment drag math stays correct.
        if (roomCenters[rm.id]) { roomCenters[rm.id].x = ccx; roomCenters[rm.id].z = ccz; }
      });
      invalidate();
    };
    roomGroupsApiRef.current = { positionRoomGroups };

    // ── Blue room alignment guides + overlap red-tint (3D, view-only) ─────────
    // Extracted to roomDragOverlay.js: drag-time alignment ribbons + red highlight
    // tint while the dragged/selected room overlaps another. View-only.
    const roomOverlay = createRoomDragOverlay({
      scene, renderRooms, roomGroups, selectHighlights, docRef,
      invalidate: () => invalidate(),
    });
    const { clearRoomGuides, updateRoomGuides, setRoomDragRed, isRoomOverlapping } = roomOverlay;
    // Selected room shows GREEN normally, RED when overlapping another room.
    applySelectionOverlapTint = (roomId) => setRoomDragRed(roomId, isRoomOverlapping(roomId));

    const onKeyDown = (e) => { keys[e.key.toLowerCase()] = true; redraw(); };
    const onKeyUp = (e) => { keys[e.key.toLowerCase()] = false; wake(); };
    // First-person look handlers — active only in walkthrough mode (live check),
    // so orbit/top-down stay fully driven by OrbitControls.
    const onDown = (e) => { if (!isWalk()) return; dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e) => {
      if (!isWalk() || !dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      yaw -= dx * 0.004;
      pitch = Math.max(-1.2, Math.min(0.6, pitch - dy * 0.004));
      redraw();
    };

    // First-person touch look. One-finger swipe = look; a quick tap = step forward
    // through the space (walkthrough only). Orbit/top-down touch is OrbitControls.
    let touchStartPt = null, touchStartTime = 0, touchMoved = 0;
    const onTouchStart = (e) => {
      if (!isWalk()) return;
      if (e.touches.length === 1) {
        dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        touchStartPt = { x: lastX, y: lastY }; touchStartTime = Date.now(); touchMoved = 0;
      }
      e.preventDefault();
    };
    const onTouchMove = (e) => {
      if (!isWalk()) return;
      if (e.touches.length === 1 && dragging) {
        const t = e.touches[0];
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        touchMoved += Math.hypot(dx, dy);
        yaw -= dx * 0.005;
        pitch = Math.max(-1.2, Math.min(0.6, pitch - dy * 0.005));
        redraw();
      }
      e.preventDefault();
    };
    const onTouchEnd = (e) => {
      // A short, near-stationary tap = walk forward one step.
      if (isWalk() && touchStartPt && touchMoved < 8 && Date.now() - touchStartTime < 350) {
        stepForward(60);
      }
      touchStartPt = null;
      if (e.touches.length === 0) dragging = false;
    };

    // Move the first-person camera forward `dist` inches along the current heading,
    // clamped inside the room. Tiny smooth glide via a short tween of fp target.
    const stepForward = (dist) => {
      const wb = walkRoomBounds(); // clamp to the SELECTED room's footprint
      const nx = THREE.MathUtils.clamp(fp.x + Math.sin(yaw) * dist, wb.minX, wb.maxX);
      const nz = THREE.MathUtils.clamp(fp.z + Math.cos(yaw) * dist, wb.minZ, wb.maxZ);
      fp.x = nx; fp.z = nz;
      redraw();
    };

    // ── Mobile aisle: tap a bench column of the SELECTED room ───────────────
    // The tapped column — and every column between it and the aisle — slides
    // into the aisle (mobileAisle.planColumnSlide). When the animation settles
    // the plan is committed as settings.aisleAt + a re-layout (StudioEditor), and
    // the rebuild that follows is masked by the bench-swap snapshot fade
    // (slideSeqRef rides in benchSwapKey). A refused commit puts the meshes back.
    // Phones draw benches as merged static meshes that can't travel one by one,
    // so there the commit happens at once and the fade alone shows the change.
    const slideAnim = createColumnSlide({ invalidate: () => invalidate() });
    const onTapBench = (benchId, roomId) => {
      if (!onSlideAisleRef.current || slideAnim.isActive()) return false;
      // The commit edits the ACTIVE room's working fields; selecting a room in
      // 3D activates it, so the two only differ mid-switch — ignore that tap.
      if (!roomId || roomId !== selectedRoomIdRef.current || roomId !== docRef.current?.activeRoomId) return false;
      const rr = renderRooms.find((x) => x.__rid === roomId);
      const group = roomGroups[roomId];
      if (!rr || !group) return false;
      const plan = planColumnSlide(rr.benches || [], rr.room, rr.settings || {}, benchId);
      if (!plan) return false;
      const commit = () => {
        if (sceneDisposed) return false;
        slideSeqRef.current += 1;
        if (onSlideAisleRef.current?.(plan) === false) {
          slideSeqRef.current -= 1; // no commit, so no rebuild to mask
          return false;
        }
        return true;
      };
      // Try to animate first; when nothing in the scene can travel (phones draw
      // benches as merged static meshes) commit at once under the fade instead.
      const mid = (g) => (g.lo + g.hi) / 2;
      const started = slideAnim.start({
        group, rid: roomId, axis: plan.axis, delta: plan.delta, movedIds: plan.movedIds,
        aisleDelta: mid(plan.aisleTo) - mid(plan.aisleFrom),
        onDone: () => { if (!commit()) slideAnim.revert(); },
      });
      return started || commit();
    };

    // ── Pointer interaction (tap-select + equipment drag + room drag) ─────────
    // Extracted to walkthroughPointer.js to keep this file under the size limit.
    // Behaviour unchanged: camera is locked while an object is selected (any press
    // drags that object), Move mode drags the room, pinch/cancel aborts cleanly.
    const pointer = createWalkthroughPointer({
      renderer, activeCameraRef: () => activeCamera, controls, scene,
      roomGroups, roomCenters, roomHitPlanes, renderRooms,
      equip, roomW, roomL,
      draggingRef, selectedRoomIdRef, selectedObjectIdRef, roomMoveModeRef, objectMoveModeRef,
      onMoveRoomRef, onSelectRoomRef, onSelectObjectRef, onDragObjectRef,
      activateRoomForObjectRef,
      benchHitBoxes, onTapBenchRef: { current: onTapBench },
      updateRoomGuides, clearRoomGuides, setRoomDragRed, isRoomOverlapping,
      isWalk, invalidate: () => invalidate(),
    });
    pointer.registerListeners();
    // Test hook (dev harness only): lets a script inspect the live scene and
    // drive a column slide. Unset in normal use.
    if (typeof window !== "undefined" && window.__zatlaDebug) {
      window.__zatlaDebug.scene = scene;
      window.__zatlaDebug.camera = () => activeCamera;
      window.__zatlaDebug.roomGroups = roomGroups;
      window.__zatlaDebug.tapBench = onTapBench;
      window.__zatlaDebug.plan = (benchId, rid) => { const rr = renderRooms.find((x) => x.__rid === rid); return rr ? planColumnSlide(rr.benches || [], rr.room, rr.settings || {}, benchId) : null; };
      window.__zatlaDebug.slide = slideAnim;
      window.__zatlaDebug.frames = () => drawnFrames;
      window.__zatlaDebug.wake = () => wake();
      window.__zatlaDebug.controls = controls;
      window.__zatlaDebug.redraw = () => redraw();
    }

    // If the GPU drops the context (mobile OOM/backgrounding), stop the render
    // loop instead of hammering a dead context — prevents a crash cascade.
    const onContextLost = (e) => {
      e.preventDefault();
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      console.warn("[Walkthrough3D] WebGL context lost — pausing render");
      setContextLost(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // First-person look/walk listeners are ALWAYS registered now (mode changes
    // without a rebuild); each one no-ops via isWalk() when not in walkthrough.
    renderer.domElement.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
    renderer.domElement.addEventListener("touchend", onTouchEnd);
    // Expose a forward-step for the React overlay walk button.
    sceneApiRef.current = { ...(sceneApiRef.current || {}), stepForward: (d) => stepForward(d || 60) };

    // Function declaration (not a const arrow) so it is hoisted to the top of the
    // build() scope. `wake()` references `animate`, and `controls.update()` below
    // can fire a synchronous "change" event that calls `wake()` BEFORE this line
    // is reached — with a const arrow that would throw "Cannot access 'animate'
    // before initialization" (the TDZ bug). Hoisting makes animate always defined.
    // Reusable temporaries for per-frame wall culling (avoid per-frame allocation).
    const _wallNorm = new THREE.Vector3();
    const _wallPos = new THREE.Vector3();
    const _toCam = new THREE.Vector3();
    const _ctrToCam = new THREE.Vector3();
    function animate() {
      let keepTicking = false;
      if (typeof window !== "undefined" && window.__zatlaDebug) window.__zatlaDebug.ticks = (window.__zatlaDebug.ticks || 0) + 1;
      // Ceiling cull: see into the room from above, roof it from inside. Room
      // groups sit at y 0 and rotate about Y, so room-local ceilingY is world height.
      ceilings.forEach((c) => {
        const vis = activeCamera.position.y < c.userData.ceilingY - 1;
        if (c.visible !== vis) { c.visible = vis; needsRender = true; }
      });
      // Per-wall occlusion cull (Cut view). When ON, hide only near walls (camera on
      // a wall's outward side while the room interior is inward) so you see into the
      // room; far walls stay solid. OFF = all walls solid. Walkthrough keeps all.
      if (cullWalls.length > 0) {
        const cut = cutWallsRef.current && !isWalk();
        cullWalls.forEach((wall) => {
          let vis = true;
          if (cut) {
            _wallNorm.copy(wall.userData.wallNormal).transformDirection(wall.matrixWorld).normalize();
            wall.getWorldPosition(_wallPos);
            _toCam.copy(activeCamera.position).sub(_wallPos);
            const camSide = _toCam.dot(_wallNorm);
            _ctrToCam.copy(wall.userData.roomCenter).sub(_wallPos);
            const ctrSide = _ctrToCam.dot(_wallNorm);
            vis = !(camSide > 0 && ctrSide < 0);
          }
          // A cull ANCHOR (the wall fans) toggles the meshes it lists rather than
          // itself; a wall mesh toggles itself.
          const targets = wall.userData.cullTargets;
          if (targets) {
            targets.forEach((t) => { if (t.visible !== vis) { t.visible = vis; needsRender = true; shadowsDirty = true; } });
          } else if (wall.visible !== vis) { wall.visible = vis; needsRender = true; shadowsDirty = true; }
        });
      }
      // Animate room-highlight crossfades and pulse the selected highlight (soft
      // breathing glow). A fading-out old selection and a fading-in new selection
      // run simultaneously; each highlight's fade factor scales the pulse opacity.
      {
        const e = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);
        const HL_FADE_MS = 250;
        Object.values(selectHighlights).forEach((h) => {
          if (!h.group.visible) return;
          if (h.fadeDir) {
            const k = Math.min(1, (performance.now() - h.fadeT0) / HL_FADE_MS);
            h.fadeK = h.fadeDir > 0
              ? h.fadeFrom + (1 - h.fadeFrom) * k
              : h.fadeFrom * (1 - k);
            if (k >= 1) {
              h.fadeK = h.fadeDir > 0 ? 1 : 0;
              if (h.fadeDir < 0) h.group.visible = false;
              h.fadeDir = 0;
            }
          }
          const f = h.fadeK ?? 1;
          h.fillMat.opacity = (0.04 + e * 0.06) * f;
          h.ringMat.opacity = (0.35 + e * 0.25) * f;
          needsRender = true;
          if (h === currentHighlight || h.fadeDir) keepTicking = true;
        });
      }
      // Pulse the selected-equipment fill so the selection is clearly indicated;
      // keep the loop alive while an object is selected.
      if (equip.hasSelection()) {
        equip.pulseSelection();
        needsRender = true;
        keepTicking = true;
      }
      // Slowly spin any active inline duct fans; keep the loop alive while they run.
      if (spinFans.length > 0) {
        spinFans.forEach((b) => { b.rotation.x += 0.04; });
        needsRender = true;
        keepTicking = true;
      }
      // Pulse active CO₂ solenoid LEDs (sine breathing on emissive intensity).
      if (pulseLeds.length > 0) {
        const e = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() * 0.004));
        pulseLeds.forEach((m) => { m.emissiveIntensity = 0.2 + e * 0.9; });
        needsRender = true;
        keepTicking = true;
      }
      // ── Smooth camera-mode transition tween (perspective camera) ──
      if (tween) {
        tween.t = Math.min(1, tween.t + (1 / 60) / tween.dur);
        const k = easeInOut(tween.t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
        controls.target.lerpVectors(tween.fromTgt, tween.toTgt, k);
        camera.lookAt(controls.target);
        needsRender = true; keepTicking = true;
        if (tween.t >= 1) {
          const done = tween.onDone;
          tween = null;
          if (done) done();
        }
      } else if (isWalk()) {
        const speed = 8;
        const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        const moving = keys["w"] || keys["s"] || keys["a"] || keys["d"];
        if (keys["w"]) { fp.x += fwd.x * speed; fp.z += fwd.z * speed; }
        if (keys["s"]) { fp.x -= fwd.x * speed; fp.z -= fwd.z * speed; }
        if (keys["a"]) { fp.x -= right.x * speed; fp.z -= right.z * speed; }
        if (keys["d"]) { fp.x += right.x * speed; fp.z += right.z * speed; }
        const wb = walkRoomBounds(); // clamp to the SELECTED room's footprint
        fp.x = Math.max(wb.minX, Math.min(wb.maxX, fp.x));
        fp.z = Math.max(wb.minZ, Math.min(wb.maxZ, fp.z));
        camera.position.set(fp.x, eyeHeight, fp.z);
        camera.lookAt(fp.x + Math.sin(yaw) * 100, eyeHeight + Math.tan(pitch) * 100, fp.z + Math.cos(yaw) * 100);
        if (moving) { needsRender = true; keepTicking = true; } // keep drawing while walking
      } else if (controls && controls.enabled) {
        // OrbitControls with damping returns true while inertia is still settling —
        // keep the loop alive those frames so the motion glides to a smooth stop.
        const stillMoving = controls.update();
        if (stillMoving) { needsRender = true; keepTicking = true; }
      }
      // Emission photons / spectrum easing — only while the tab is visible.
      // tick() returns true (draw a frame), "wait" (30 fps cap: keep looping, don't
      // draw yet) or false (idle).
      const emissionTick = emissionApiRef.current?.tick(performance.now());
      if (emissionTick) {
        if (emissionTick === true) needsRender = true;
        if (!document.hidden) keepTicking = true;
      }
      // UCL LED chase — loops while the beams are on (30 fps cap, tab visible).
      for (const u of uclEmissions) {
        const r = u.tick(performance.now());
        if (!r) continue;
        if (r === true) needsRender = true;
        if (!document.hidden) keepTicking = true;
      }
      // PPFD maps popping in.
      if (ppfdApiRef.current?.tick?.(performance.now())) { needsRender = true; keepTicking = true; }
      // Mobile-aisle column slide in flight (see onTapBench).
      if (slideAnim.tick(performance.now())) { needsRender = true; shadowsDirty = true; keepTicking = true; }
      // Render-on-demand: skip the draw entirely on idle frames.
      if (needsRender) {
        if (shadowsDirty) {
          renderer.shadowMap.needsUpdate = true;
          shadowsDirty = false;
        }
        renderer.render(scene, activeCamera);
        needsRender = false;
        drawnFrames += 1;
        perfHudRef.current?.frame(renderer, () =>
          `plants ${plants}   beams ${beamsOnRef.current ? "on" : "off"}   photons ${animatingRef.current ? "animating" : "off"}`);
      }
      // Sleep the loop when there's nothing to animate; events call wake() to resume.
      if (keepTicking) raf = requestAnimationFrame(animate);
      else raf = null;
    };
    // Shadow flags for everything built synchronously above (scaffolds,
    // procedural equipment, walls, floors, walkway). Async GLB holders get
    // theirs in applyBenchMaterials when they land.
    setShadowFlags(scene);
    wake();

    // In-app rendering speed test (View3DOverlay → "Speed test"): measures this exact
    // scene on this exact GPU. See lib/growroom/speedTest.js.
    speedApiRef.current = (onProgress) => runSpeedTest({
      renderer, scene, camera: activeCamera, mobile: isMobile,
      getDrawn: () => drawnFrames, getLongTasks, onProgress,
    }).finally(() => { needsRender = true; wake(); });

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      // The first build can run at a 1x1 mount (layout not settled yet), so the
      // intro's destination was fitted against a bogus aspect: refit it while
      // the fly-in is still in flight. Nothing else moves.
      if (tween && tween.intro) {
        const p = orbitPose();
        tween.toPos.copy(p.pos);
        tween.toTgt.copy(p.tgt);
      }
      // Keep the ortho frustum aspect-correct too (top-down view).
      if (activeCamera === orthoCamera) setOrthoFrame(orthoCamera.top);
      renderer.setSize(nw, nh);
      // setSize CLEARS the canvas and the render loop may be asleep (render-on-
      // demand), so wake it rather than just flag it. View-only: the shadow map
      // stays as it is.
      redraw();
    };
    window.addEventListener("resize", onResize);
    // Re-measure when the container finally gets its real size (the 3D pane often
    // mounts at 0×0 before layout settles, which would otherwise render nothing).
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // Expose zoom + reset to the React overlay buttons. In orbit mode these dolly
    // / re-frame the OrbitControls camera; clamped to the same min/max distance.
    const dolly = (factor) => {
      if (activeCamera === orthoCamera) {
        // Top-down: zoom = shrink/grow the ortho frustum half-height (clamped).
        const half = THREE.MathUtils.clamp(orthoCamera.top * factor, Math.max(roomW, roomL) * 0.15, Math.max(roomW, roomL) * 1.5);
        setOrthoFrame(half);
        invalidate();
        return;
      }
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      const dist = THREE.MathUtils.clamp(dir.length() * factor, minDist, maxDist);
      dir.setLength(dist);
      camera.position.copy(controls.target).add(dir);
      controls.update();
      invalidate();
    };
    zoomApiRef.current = {
      zoomIn: () => dolly(0.82),
      zoomOut: () => dolly(1.22),
      reset: () => {
        // Re-frame the current mode (orbit/top-down); walkthrough re-centers the eye.
        if (cameraModeRef.current === "walkthrough") {
          walkSpawn(); invalidate();
          return;
        }
        setCameraMode(cameraModeRef.current, false);
      },
    };

    sceneApiRef.current = { ...(sceneApiRef.current || {}), invalidate, stepForward: (d) => stepForward(d || 60) };

    // 3D is VIEW-ONLY: equipment objects render from data (display-only, exactly
    // like benches and lights). There is no object selection, move, rotate, snap,
    // gizmo, or drag here — camera controls only. OrbitControls is never disabled
    // by an interaction state.

    // Capture the live scene to a PNG data URL — forces one synchronous render so
    // the framebuffer holds the current frame, then reads the real canvas pixels.
    // This is the SAME camera, benches, walls and lighting the user sees.
    if (captureRef) {
      captureRef.current = () => {
        try {
          if (controls && controls.enabled) controls.update();
          renderer.render(scene, activeCamera);
          return renderer.domElement.toDataURL("image/png");
        } catch (e) {
          console.error("[Walkthrough3D] capture failed:", e);
          return null;
        }
      };
    }

    const onVisibility = () => { if (!document.hidden) wake(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      sceneDisposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      emissionApiRef.current?.dispose();
      emissionApiRef.current = null;
      ppfdApiRef.current?.dispose();
      ppfdApiRef.current = null;
      uclEmissions.forEach((u) => u.dispose());
      uclEmissions.length = 0;
      uclEmissionsRef.current = null;
      speedApiRef.current = null;
      if (captureRef) captureRef.current = null;
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      roomOverlay.dispose();
      equip.dispose();
      equipApiRef.current = null;
      cameraApiRef.current = null;
      touchModeApiRef.current = null;
      dimsApiRef.current = null;
      selectApiRef.current = null;
      roomGroupsApiRef.current = null;
      lightApiRef.current = null;
      // Persist the EXACT current camera pose before teardown so the next rebuild
      // (add equipment / rotate ducting / any docKey change) restores this view
      // instead of snapping to default framing — even if no OrbitControls "change"
      // fired since the last rebuild.
      try {
        if (camera && controls) {
          camPoseRef.current = {
            pos: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          };
        }
      } catch (_) { /* ignore */ }
      if (controls) controls.dispose();
      // First-person look/walk listeners (always registered now).
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      renderer.domElement.removeEventListener("mousedown", onDown);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      // Equipment drag + room-select listeners (pointer interaction module).
      pointer.removeListeners();
      // A slide cut short by a rebuild is simply dropped (never committed).
      slideAnim.cancel();

      // Dispose every geometry + material in the scene to free GPU memory,
      // skipping procedural scaffold materials (shared module-level constants).
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mt) => mt && !mt.userData._procedural && mt.dispose());
        }
      });
      scene.clear();

      zoomApiRef.current = null;
      sceneApiRef.current = null;
      if (envTex) envTex.dispose();
      if (pmrem) pmrem.dispose();
    };
    }

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      // Dispose this build's scene geometry/materials + listeners (not the renderer).
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, mode, lightMode]);

  // Dispose the persistent renderer + canvas only on true component unmount.
  useEffect(() => {
    return () => {
      disposeFadeTimer();
      const r = rendererRef.current;
      if (r) {
        r.dispose();
        r.forceContextLoss();
        if (r.domElement.parentNode) r.domElement.parentNode.removeChild(r.domElement);
        rendererRef.current = null;
      }
    };
  }, []);

  // Live toggle for dimension labels — flips visibility without rebuilding the
  // scene. Dimensions are room-scoped: only the SELECTED room's holder shows
  // while the toggle is ON; no room selected = no dimensions.
  useEffect(() => {
    showDimensionsRef.current = showDimensions;
    dimsApiRef.current?.updateDimensionVisibility?.();
  }, [showDimensions]);

  // Smoothly transition the camera when the camera mode changes — never rebuilds
  // the scene, never touches data. The scene exposes setCameraMode via cameraApiRef.
  useEffect(() => {
    cameraApiRef.current?.setCameraMode?.(cameraMode, true);
  }, [cameraMode]);

  // Show the selected room's highlight and orbit the camera around it whenever the
  // selection changes — never rebuilds the scene. Null = nothing selected.
  useEffect(() => {
    selectApiRef.current?.selectRoom?.(selectedRoomId, true);
  }, [selectedRoomId]);

  // Flip the one-finger camera touch action when the Move toggle changes — never
  // rebuilds the scene. Move ON → one finger drags the room (camera one-finger off);
  // Move OFF → one finger orbits/pans. Two-finger pinch/pan always stays on.
  useEffect(() => {
    touchModeApiRef.current?.setRoomMoveTouch?.();
  }, [roomMoveMode]);

  // Reconcile committed room offsets onto the room groups IN PLACE whenever any
  // room's facility offset changes (a pure move-commit OR its undo) — never rebuilds
  // the scene, so a room move/undo is flash-free. The mid-drag live move already set
  // the group's position; this makes the post-commit state authoritative so it
  // survives any later legitimate rebuild. Skips while a drag is in flight (the drag
  // is already moving the group directly). Offset is intentionally OUT of docKey.
  useEffect(() => {
    if (draggingRef.current) return;
    roomGroupsApiRef.current?.positionRoomGroups?.(doc.rooms || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomOffsetsKey]);

  // Crossfade the changed room's bench light fixtures in place when a room's
  // grow-light MODEL changes — never rebuilds the scene.
  useEffect(() => {
    lightApiRef.current?.applyRoomLightModels?.(docRef.current);
    emissionApiRef.current?.applyRoomSpectra?.(docRef.current);
    ppfdApiRef.current?.recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomLightKey]);

  // "Light beams" toggle — view-only, never rebuilds the scene.
  useEffect(() => {
    beamsOnRef.current = beamsOn;
    emissionApiRef.current?.setEnabled(beamsOn);
    uclEmissionsRef.current?.forEach((u) => u.setEnabled(beamsOn)); // (setEnabled above wakes the loop)
  }, [beamsOn]);

  // Stats readout on/off (also on via ?perf in the URL). Lives outside build() so
  // toggling it never rebuilds the scene.
  useEffect(() => {
    if (perfOn) {
      perfHudRef.current = perfHudRef.current || createPerfHud();
      emissionApiRef.current?.setAnimating(animatingRef.current); // wakes a redraw so the readout fills in
    } else {
      perfHudRef.current?.dispose();
      perfHudRef.current = null;
    }
    return () => { perfHudRef.current?.dispose(); perfHudRef.current = null; };
  }, [perfOn]);

  // Photons animate only while the Spectrum panel is open or the Photons toggle is
  // on — never by default — so an untouched scene idles at zero redraws.
  useEffect(() => {
    const on = beamsOn && (photonsOn || spectrumOpen);
    animatingRef.current = on;
    emissionApiRef.current?.setAnimating(on);
  }, [beamsOn, photonsOn, spectrumOpen]);

  // ── Equipment selection outline ──────────────────────────────────────────
  // Show the green selection outline on the selected equipment mesh (or hide it
  // when nothing is selected). Runs after each render so a freshly-registered
  // mesh (post-rebuild) gets outlined too. Never rebuilds the scene.
  useEffect(() => {
    const api = equipApiRef.current;
    if (!api) return;
    if (selectedObjectId) api.showOutline(selectedObjectId);
    else api.hideOutline();
  }, [selectedObjectId, docKey]);

  // ── Live height (pos.z) ──────────────────────────────────────────────────
  // pos.z is intentionally OUT of docKey (no rebuild), so drive the selected
  // mesh's Y directly when the height slider changes.
  const selObjHeight = selectedObject3D?.pos?.z;
  useEffect(() => {
    const api = equipApiRef.current;
    if (!api || !selectedObjectId || typeof selObjHeight !== "number") return;
    api.setMeshHeight(selectedObjectId, effectiveHeightY(selectedObject3D, docRef.current.room?.ceilingIn || 144));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selObjHeight, selectedObjectId]);

  // ── Live rotation for non-rebuilding types (fan/AC/dehumidifier/co2tank) ───
  // These exclude rotationDeg from docKey, so update the mesh in place. Doors and
  // ducting DO rebuild on rotate (handled by the docKey path), so skip them here.
  const selObjRot = selectedObject3D?.rotationDeg;
  // Track the last (objId, rotation) we applied so selecting an object does NOT
  // animate it to its already-correct stored angle — we only spin when the angle
  // actually changes on the SAME already-selected object (a real rotate press).
  const lastRotRef = useRef({ id: null, rot: null });
  useEffect(() => {
    const api = equipApiRef.current;
    if (!api || !selectedObjectId || !selectedObject3D) return;
    const t = selectedObject3D.type;
    const rot = selObjRot || 0;
    const isSameObject = lastRotRef.current.id === selectedObjectId;
    lastRotRef.current = { id: selectedObjectId, rot };
    // Ducting rebuilds via docKey (its geometry length is baked in), so rotating
    // it would normally snap instantly. Animate the CURRENT mesh spinning to the
    // new angle first — the rebuild that follows lands at the same final angle, so
    // the transition reads as a smooth turn rather than a hard snap. Only animate
    // on a real rotate of an already-selected duct — NOT on first selection (the
    // mesh already renders at its stored angle, so a spin there is spurious).
    if (t === "ducting") {
      if (isSameObject) api.animateMeshRotationDeg(selectedObjectId, rot);
      return;
    }
    // Doors rebuild via docKey and aren't selectable in 3D — skip.
    if (t === "door") return;
    // Every other type (fan, AC, dehumidifier, co2tank, controller) excludes
    // rotationDeg from docKey, so rotate the mesh in place here.
    api.setMeshRotationDeg(selectedObjectId, rot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selObjRot, selectedObjectId]);

  // The PPFD card's printed sheet for the active room (null = no grow lights).
  const activeRoomRec = (doc.rooms || []).find((r) => r.id === doc.activeRoomId);
  const activeLightModel = activeRoomRec?.lightModel || doc.lightModel || "phoenix";
  const ppfdSheet = (doc.benches || []).length ? specSheetFor(activeLightModel) : null;

  return (
    <View3DOverlay
      loading={loading}
      doc={doc}
      cameraMode={cameraMode}
      onChangeCameraMode={onChangeCameraMode}
      showDimensions={showDimensions}
      setShowDimensions={setShowDimensions}
      hasSelectedRoom={!!(selectedRoomId || doc.activeRoomId)}
      onSelectRoom={onSelectRoom}
      onSetLightModel={cameraMode !== "walkthrough" ? onSetLightModel : undefined}
      onSetCanopyMode={cameraMode !== "walkthrough" ? onSetCanopyMode : undefined}
      ceilingIn={doc.room?.ceilingIn || 144}
      onSetCeiling={cameraMode !== "walkthrough" ? onSetCeiling : undefined}
      design={design}
      display={isMobileUi ? null : {
        beamsOn,
        onToggleBeams: () => setBeamsOn((v) => !v),
        photonsOn,
        onTogglePhotons: () => setPhotonsOn((v) => !v),
      }}
      spectrum={typeof onSetSpectrum === "function" && cameraMode !== "walkthrough" ? {
        levels: activeRoomRec?.spectrum || null,
        onSet: onSetSpectrum,
        hasSelectedRoom: !!activeRoomRec,
        onOpenChange: setSpectrumOpen,
      } : null}
      onPpfdOpenChange={onPpfdOpenChange}
      ppfdSheet={ppfdSheet}
      move={move}
      actions={actions}
    >
      <div
        ref={mountRef}
        className="w-full h-full touch-none"
        style={{
          opacity: loading || (benchFade && !benchFade.fading) ? 0 : 1,
          transition: reducedMotion ? "none" : (benchFade ? "opacity 700ms ease-in-out" : "opacity 1000ms ease-out"),
        }}
      />
      {/* Bench-swap transition: the held snapshot fades OUT over 700ms while the
          live scene (new bench models) fades IN underneath it. Never blocks input. */}
      {benchFade && (
        <img
          src={benchFade.url}
          alt=""
          className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10 transition-opacity duration-700 ease-in-out"
          style={{ opacity: benchFade.fading ? 0 : 1 }}
        />
      )}
      {!loaderGone && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-[#151517]"
          style={{ opacity: loading ? 1 : 0, transition: reducedMotion ? "none" : "opacity 800ms ease-out", pointerEvents: loading ? "auto" : "none" }}
          aria-hidden={!loading}
        >
          {loader || <ZatlaLoader3D reducedMotion={reducedMotion} />}
        </div>
      )}
      {/* WebGL context lost — the canvas is dead and every later frame draws
          nothing. Reload is the only real recovery. */}
      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background z-30 p-6 text-center">
          <p className="text-sm font-semibold">3D view ran out of memory</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            This device couldn&rsquo;t keep the 3D scene loaded. Closing other apps or
            browser tabs frees memory, then reload to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload 3D view
          </button>
        </div>
      )}
      {buildError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background z-20 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">3D scene failed to build</p>
          <p className="text-xs text-muted-foreground max-w-md break-words">{buildError}</p>
        </div>
      )}
      {cameraMode === "walkthrough" && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full font-mono whitespace-nowrap">
          WASD / drag to look · tap to walk forward
        </div>
      )}
      {/* Floating EQUIPMENT controls — shown when an equipment object is selected
          in orbit/top-down (not walkthrough). Rotate / Height / Delete, all
          persisting to objects[] via the StudioEditor handlers. */}
      {!loading && cameraMode !== "walkthrough" && selectedObject3D && (
        <Equipment3DControls
          object={selectedObject3D}
          ceilingIn={doc.room?.ceilingIn || 144}
          onRotate={() => onRotateObject?.(selectedObject3D.id)}
          onSetHeight={(h) => onSetObjectHeight?.(selectedObject3D.id, h)}
          onSetSpec={(k, v) => onSetObjectSpec?.(selectedObject3D.id, k, v)}
          onRemove={() => onDeleteObject?.(selectedObject3D.id)}
        />
      )}
      {!loading && (
        <Zoom3DControls
          onZoomIn={() => zoomApiRef.current?.zoomIn()}
          onZoomOut={() => zoomApiRef.current?.zoomOut()}
          onResetView={() => zoomApiRef.current?.reset()}
        />
      )}
    </View3DOverlay>
  );
}
