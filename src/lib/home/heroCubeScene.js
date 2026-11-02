import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// The home hero's cube: six pictures (or, on desktop, looping videos) on a
// slowly tumbling, floating box with bright edges and a faint reflection.
//
// Plain three.js in the same shape as heroScene.js: mountHeroCubeScene() builds
// the scene into a host element and returns a handle, and SceneStage owns the
// lifecycle around it (start, pausing off-screen and in hidden tabs, reduced
// motion, disposal). Nothing here touches React state; it reports through
// onReady / onError / onFaceChange(i) / onFaceClick(i).
//
// Hovering a face pauses the tumble and lifts the cube a touch. Clicking or
// tapping a face calls onFaceClick(i). Dragging turns the cube by hand, and the
// tumble picks up again 3 s after the last drag or dot. showFace(i) turns face i
// to the front in 800 ms. The light version (SceneStage's `mobile`: phones and
// narrow windows) caps the pixel ratio at 1.5, uses pictures only and drops the
// edge glow and the reflection. Reduced motion: no tumble or float, face 1 to
// the front, and showFace() swaps instantly.

const EDGE = 1;                    // cube edge, scene units
const CORNER = 0.06;               // radius of the rounded edges
const FLOAT = 0.05;                // float, up and down
const FLOAT_PERIOD = 5.5;          // seconds
const HOVER_SCALE = 1.06;
const SPIN_X = 0.13;               // tumble, rad/s, around X and Y: different rates,
const SPIN_Y = 0.21;               // so the motion never lines up and repeats
const IDLE_MS = 3000;              // tumble resumes this long after a drag or a dot
const TWEEN_MS = 800;
const DRAG = 0.0085;               // rad per pixel dragged
const MAX_FLING = 5;               // rad/s
const FOV = 30;
const EDGE_COLOR = "#eafff4";      // the light-bar core in home.css
const HALO_COLOR = "#e6479a";      // growScene's pink
const BLANK = "#0e1511";           // --home-surface: a side whose picture hasn't arrived
const REFLECT_OPACITY = 0.2;
// How big the cube sits in its canvas, as a multiple of the largest size that
// can never clip. Tuned so the cube is 30% smaller than the 2x version.
const SIZE_DESKTOP = 1.09;
const SIZE_PHONE = 0.77;
const REFLECT_FADE = 0.85;         // scene units below the floor where the reflection is gone
const LIGHT = new THREE.Vector3(-0.35, 0.55, 0.76).normalize();
// Rest pose for a face shown to the front: turned and tipped a little so it
// still reads as a cube (the right side and the top show too).
const TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, -0.5, 0, "XYZ"));

// faces[i] goes on box slot SLOT_OF_FACE[i]; slots are BoxGeometry's material
// order +X, -X, +Y, -Y, +Z, -Z. So: front, right, back, left, top, bottom.
const SLOT_OF_FACE = [4, 0, 5, 1, 2, 3];
// Each slot's outward normal and the right / up directions of its picture, as
// (Rounded)BoxGeometry lays out its UVs: every side reads upright and
// unmirrored from outside.
const SLOT_AXES = [
  { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
  { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0] },
  { n: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
  { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
];
const NORMALS = SLOT_AXES.map((a) => new THREE.Vector3().fromArray(a.n));

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// The orientation that shows slot `slot` to the camera, upright, at the rest tilt.
function slotTarget(slot) {
  const a = SLOT_AXES[slot];
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().fromArray(a.r),
    new THREE.Vector3().fromArray(a.u),
    new THREE.Vector3().fromArray(a.n),
  );
  return TILT.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(basis).invert());
}

const unloadVideo = (v) => {
  try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* already gone */ }
};

export function mountHeroCubeScene(host, { faces = [], reducedMotion = false, mobile = false, onReady, onError, onFaceChange, onFaceClick } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  } catch (e) { onError?.(e); return null; }
  const lite = !!mobile;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  // pan-y: a sideways drag turns the cube, an up/down swipe still scrolls the page.
  canvas.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity 0.5s ease;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const count = Math.min(6, faces.length);
  const faceOfSlot = new Array(6).fill(-1);
  for (let i = 0; i < count; i++) faceOfSlot[SLOT_OF_FACE[i]] = i;

  // ── The cube ──────────────────────────────────────────────────────────────
  // Unlit materials keep the pictures' own colours; each side is shaded by how
  // squarely it faces a soft key light (see shade()), which is what makes it
  // read as a solid box.
  const geometry = new RoundedBoxGeometry(EDGE, EDGE, EDGE, lite ? 2 : 4, CORNER);
  const tint = Array.from({ length: 6 }, () => new THREE.Color(BLANK));
  const faceMats = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ color: BLANK, toneMapped: false }));
  const cube = new THREE.Mesh(geometry, faceMats);
  scene.add(cube);

  // Bright edges (desktop): a white-green core line along each edge, sitting on
  // the rounded corner, and a pink halo just outside it.
  const lineMats = [];
  let edgeGeo = null;
  if (!lite) {
    const e = EDGE - 2 * CORNER * (1 - Math.SQRT1_2) + 0.006;
    const box = new THREE.BoxGeometry(e, e, e);
    edgeGeo = new THREE.EdgesGeometry(box);
    box.dispose();
    const core = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.95, toneMapped: false });
    const halo = new THREE.LineBasicMaterial({ color: HALO_COLOR, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    const haloLines = new THREE.LineSegments(edgeGeo, halo);
    haloLines.scale.setScalar(1.014);
    cube.add(new THREE.LineSegments(edgeGeo, core), haloLines);
    lineMats.push(core, halo);
  }

  // Faint reflection (desktop): the same box mirrored under a floor plane,
  // drawn at low opacity and faded out with distance below the floor. No
  // render target, just a flipped copy.
  const floorY = -(0.87 * EDGE * HOVER_SCALE + FLOAT + 0.06);
  const mirror = new THREE.Matrix4().makeTranslation(0, 2 * floorY, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1));
  let reflection = null, reflectMats = null;
  if (!lite) {
    const fadeUniforms = { uFloorY: { value: floorY }, uFade: { value: REFLECT_FADE } };
    const fadeOut = (shader) => {
      Object.assign(shader.uniforms, fadeUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vReflectY;")
        .replace("#include <project_vertex>", "#include <project_vertex>\n\tvReflectY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vReflectY;\nuniform float uFloorY;\nuniform float uFade;")
        .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n\tgl_FragColor.a *= smoothstep( uFloorY - uFade, uFloorY, vReflectY );");
    };
    reflectMats = Array.from({ length: 6 }, () => {
      const m = new THREE.MeshBasicMaterial({ color: BLANK, transparent: true, opacity: REFLECT_OPACITY, depthWrite: false, toneMapped: false });
      m.onBeforeCompile = fadeOut;
      return m;
    });
    reflection = new THREE.Mesh(geometry, reflectMats);
    reflection.matrixAutoUpdate = false;
    reflection.renderOrder = -1;
    scene.add(reflection);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let active = false, ready = false, disposed = false, reduced = !!reducedMotion;
  let raf = 0, last = 0, readyAt = 0, floatT = 0, gain = 0, scale = 1, front = -1;
  let tween = null, dragging = false, hovered = false, press = null, resumeAt = 0, tapFace = -1;
  const vel = { x: 0, y: 0 };
  const orient = slotTarget(SLOT_OF_FACE[0]);   // face 1 to the front
  const tmp = new THREE.Vector3(), toCam = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Turn the cube about the screen's axes (world X then world Y).
  const rotateWorld = (ax, ay) => {
    qa.setFromAxisAngle(AXIS_X, ax);
    qb.setFromAxisAngle(AXIS_Y, ay);
    orient.premultiply(qa).premultiply(qb).normalize();
  };

  // ── Pictures and videos ───────────────────────────────────────────────────
  const loader = new THREE.TextureLoader();
  const textures = new Set();
  const videos = [];
  const aniso = Math.min(lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy?.() || 1);
  const prep = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
  const loadImage = (url) => new Promise((resolve, reject) => {
    if (!url) { reject(new Error("no picture")); return; }
    loader.load(url, (t) => resolve(prep(t)), undefined, reject);
  });
  const loadVideo = (url) => new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
    v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true; clearTimeout(timer); unloadVideo(v);
      reject(err || new Error("video failed"));
    };
    const timer = setTimeout(() => fail(new Error("video timed out")), 10000);
    v.addEventListener("error", () => fail(v.error), { once: true });
    v.addEventListener("loadeddata", () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ video: v, texture: prep(new THREE.VideoTexture(v)) });
    }, { once: true });
    v.src = url;
    v.load();
  });

  const setSide = (slot, tex) => {
    if (disposed) { tex.dispose(); return; }
    const old = faceMats[slot].map;
    textures.add(tex);
    faceMats[slot].map = tex; faceMats[slot].needsUpdate = true;
    if (reflectMats) { reflectMats[slot].map = tex; reflectMats[slot].needsUpdate = true; }
    tint[slot].set(0xffffff);
    if (old && old !== tex) { textures.delete(old); old.dispose(); }
    renderOnce();
  };
  // Any failure ends on the picture: a video falls back to its poster, a phone
  // picture to the full-size one. A side with nothing to show stays dark.
  const showPicture = async (slot, urls) => {
    for (const url of urls) {
      if (!url || disposed) continue;
      try { setSide(slot, await loadImage(url)); return; } catch { /* try the next one */ }
    }
    if (!disposed) console.warn(`[heroCube] no picture for face ${faceOfSlot[slot] + 1}`);
  };
  // videos: [{ video, slot, face }]: the sides currently showing a video.
  const playVideo = (entry) => {
    const p = entry.video.play();
    // Autoplay refused or the format can't play: show the poster instead. An
    // AbortError only means pause() (scrolled off-screen) interrupted play().
    p?.catch?.((err) => {
      if (disposed || err?.name === "AbortError" || !videos.includes(entry)) return;
      videos.splice(videos.indexOf(entry), 1);
      unloadVideo(entry.video);
      showPicture(entry.slot, [entry.face.poster]);
    });
  };
  const loadFace = async (face, slot) => {
    if (face.type === "video" && !lite && !reduced) {
      try {
        const { video, texture } = await loadVideo(face.src);
        if (disposed) { texture.dispose(); unloadVideo(video); return; }
        const entry = { video, slot, face };
        videos.push(entry);
        setSide(slot, texture);
        if (active) playVideo(entry);
        return;
      } catch { /* the poster below */ }
    }
    const urls = face.type === "video"
      ? [lite && face.mobileSrc, face.poster]
      : [lite && face.mobileSrc, face.src];
    await showPicture(slot, urls);
  };

  // ── Per-frame ─────────────────────────────────────────────────────────────
  // Each side is lit by how squarely it faces the key light; the reflection
  // follows a touch darker.
  const shade = () => {
    for (let s = 0; s < 6; s++) {
      tmp.copy(NORMALS[s]).applyQuaternion(orient);
      const lit = 0.56 + 0.44 * Math.max(0, tmp.dot(LIGHT));
      faceMats[s].color.copy(tint[s]).multiplyScalar(lit);
      if (reflectMats) reflectMats[s].color.copy(tint[s]).multiplyScalar(lit * 0.92);
    }
  };
  // Which face is most toward the camera: drives the active dot.
  const findFront = () => {
    toCam.copy(camera.position).sub(cube.position).normalize();
    let best = -1, bestDot = -2;
    for (let i = 0; i < count; i++) {
      const d = tmp.copy(NORMALS[SLOT_OF_FACE[i]]).applyQuaternion(orient).dot(toCam);
      if (d > bestDot) { bestDot = d; best = i; }
    }
    if (best !== front) { front = best; onFaceChange?.(best); }
  };

  // Advances everything by dt seconds; returns true while something is still
  // moving that reduced motion has to keep rendering (a tween, a drag, a scale).
  const step = (dt, now) => {
    let moving = false;
    if (tween) {
      const k = clamp01((now - tween.t0) / TWEEN_MS);
      orient.slerpQuaternions(tween.from, tween.to, easeInOutCubic(k));
      if (k >= 1) { tween = null; resumeAt = now + IDLE_MS; } else moving = true;
    }
    if (!dragging && !tween && (vel.x || vel.y)) {
      rotateWorld(vel.x * dt, vel.y * dt);
      const decay = Math.exp(-dt * 4.5);
      vel.x *= decay; vel.y *= decay;
      if (Math.abs(vel.x) < 0.01 && Math.abs(vel.y) < 0.01) { vel.x = 0; vel.y = 0; }
      moving = true;
    }
    // The tumble eases out fast when something takes over and back in slowly.
    const want = !reduced && !hovered && !dragging && !tween && !press && now >= resumeAt ? 1 : 0;
    gain += (want - gain) * (1 - Math.exp(-dt * (want > gain ? 1.6 : 8)));
    if (gain > 1e-3) rotateWorld(SPIN_X * dt * gain, SPIN_Y * dt * gain);
    if (!reduced) floatT += dt;
    cube.position.y = reduced ? 0 : FLOAT * Math.sin((floatT / FLOAT_PERIOD) * Math.PI * 2);
    // Grows in with the fade on arrival, and a touch bigger under the pointer.
    const arrive = reduced ? 1 : 0.9 + 0.1 * easeOutCubic(clamp01((now - readyAt) / 700));
    const want2 = hovered ? HOVER_SCALE : 1;
    if (reduced) scale = want2;
    else {
      scale += (want2 - scale) * (1 - Math.exp(-dt * 12));
      if (Math.abs(want2 - scale) > 1e-3) moving = true;
    }
    cube.scale.setScalar(scale * arrive);
    cube.quaternion.copy(orient);
    cube.updateMatrixWorld();
    if (reflection) {
      reflection.matrix.multiplyMatrices(mirror, cube.matrixWorld);
      reflection.matrixWorldNeedsUpdate = true;
    }
    shade();
    findFront();
    return moving;
  };

  const tick = (now) => {
    raf = 0;
    if (disposed || !active || !ready) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;   // no jump after a pause
    last = now;
    const moving = step(dt, now);
    renderer.render(scene, camera);
    if (!reduced || moving) raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (disposed || !ready || !active || raf) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  function renderOnce() {
    if (!ready || disposed) return;
    step(0, performance.now());
    renderer.render(scene, camera);
  }

  // ── Framing ───────────────────────────────────────────────────────────────
  // The camera backs off until the tumbling cube's worst-case extent (and the
  // reflection under it) fits the canvas, whatever its shape.
  const fit = () => {
    // Worst-case half extent of the tumbling cube: phones have no hover lift,
    // so they can sit closer without a corner ever leaving the canvas.
    const r = lite ? Math.sqrt(3) * (EDGE / 2 - CORNER) + CORNER + FLOAT + 0.01 : 0.87 * EDGE * HOVER_SCALE + FLOAT + 0.04;
    const top = r, bottom = reflection ? floorY - REFLECT_FADE * 0.35 : -r;
    const cy = (top + bottom) / 2, hv = (top - bottom) / 2;
    const fovV = THREE.MathUtils.degToRad(FOV);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    // The size is set against the first version of the hero cube: 70% of that
    // (30% smaller) on desktop, and on phones (which sit tighter to their
    // canvas) the same 70% of what they showed.
    const dist = Math.max(hv / Math.sin(fovV / 2), r / Math.sin(fovH / 2)) / (lite ? SIZE_PHONE : SIZE_DESKTOP);
    camera.position.set(0, cy + dist * 0.05, dist);
    camera.lookAt(0, cy, 0);
  };
  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
    renderOnce();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ── Pointer: hover, click, drag ───────────────────────────────────────────
  const pick = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(cube, false)[0];
    return hit ? faceOfSlot[hit.face?.materialIndex ?? -1] ?? -1 : -1;
  };
  const setHover = (on) => {
    if (on === hovered) return;
    hovered = on;
    canvas.style.cursor = on ? "pointer" : "";
    start();
  };
  const onDown = (e) => {
    tapFace = -1;
    if (!ready || press || (e.pointerType === "mouse" && e.button !== 0)) return;
    const now = performance.now();
    press = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, t: now, lx: e.clientX, ly: e.clientY, lt: now, moved: false };
    vel.x = 0; vel.y = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };
  const onMove = (e) => {
    if (press && e.pointerId === press.id) {
      const now = performance.now();
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > (press.type === "mouse" ? 4 : 8)) {
        press.moved = true; dragging = true; tween = null; gain = 0;
        hovered = false;
        canvas.style.cursor = "grabbing";
      }
      if (press.moved) {
        const ax = (e.clientY - press.ly) * DRAG, ay = (e.clientX - press.lx) * DRAG;
        rotateWorld(ax, ay);
        const dts = Math.max(0.008, (now - press.lt) / 1000);
        vel.x = Math.max(-MAX_FLING, Math.min(MAX_FLING, 0.5 * vel.x + 0.5 * (ax / dts)));
        vel.y = Math.max(-MAX_FLING, Math.min(MAX_FLING, 0.5 * vel.y + 0.5 * (ay / dts)));
        start();
      }
      press.lx = e.clientX; press.ly = e.clientY; press.lt = now;
      return;
    }
    if (e.pointerType === "mouse" && ready) setHover(pick(e.clientX, e.clientY) >= 0);
  };
  const endPress = (e, allowClick) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const now = performance.now();
    if (p.moved) {
      dragging = false;
      resumeAt = now + IDLE_MS;
      // A hand that stopped before letting go doesn't fling; reduced motion never does.
      if (reduced || now - p.lt > 90) { vel.x = 0; vel.y = 0; }
      canvas.style.cursor = "";
      if (e.pointerType === "mouse") setHover(pick(e.clientX, e.clientY) >= 0);
      start();
    } else if (allowClick && now - p.t < 700) {
      // Navigate on the click that follows, not here: navigating on pointerup
      // lets the same tap's click land on the next page.
      tapFace = pick(e.clientX, e.clientY);
    }
  };
  const onUp = (e) => endPress(e, true);
  const onClick = () => { const i = tapFace; tapFace = -1; if (i >= 0) onFaceClick?.(i); };
  const onCancel = (e) => endPress(e, false);   // the page took the gesture (a scroll)
  const onLeave = (e) => { if (e.pointerType === "mouse" && !press) setHover(false); };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);
  // A lost GPU context hands over to SceneStage's fallback.
  const onLost = (e) => { e.preventDefault(); stop(); if (!disposed) onError?.(e); };
  canvas.addEventListener("webglcontextlost", onLost);
  const onRestored = () => { if (disposed) return; onReady?.(); if (active) start(); else renderOnce(); };
  canvas.addEventListener("webglcontextrestored", onRestored);

  // Show the cube once every side has its picture (or 1.5 s have passed: late
  // sides fill in as they arrive). The pictures are preloaded by index.html.
  const loads = faces.slice(0, 6).map((f, i) => loadFace(f || {}, SLOT_OF_FACE[i]).catch(() => {}));
  Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 1500))]).then(() => {
    if (disposed) return;
    ready = true;
    readyAt = performance.now();
    canvas.style.opacity = "1";
    onReady?.();
    if (active) start(); else renderOnce();
  });

  return {
    setActive(on) {
      active = !!on;
      // Videos only decode while the cube is on screen and the tab is visible.
      for (const entry of [...videos]) {
        if (active) playVideo(entry);
        else entry.video.pause();
      }
      if (active) start(); else stop();
    },
    setReducedMotion(on) {
      reduced = !!on;
      if (reduced) {
        tween = null;
        orient.copy(slotTarget(SLOT_OF_FACE[0]));
        vel.x = 0; vel.y = 0; gain = 0;
      }
      if (active) start(); else renderOnce();
    },
    // Turn face i to the front: an 800 ms tween, or at once with reduced motion.
    showFace(i) {
      if (disposed || !(i >= 0 && i < count)) return;
      const to = slotTarget(SLOT_OF_FACE[i]);
      vel.x = 0; vel.y = 0; gain = 0;
      if (!ready || reduced) {
        tween = null;
        orient.copy(to);
        resumeAt = performance.now() + IDLE_MS;
        renderOnce();
        return;
      }
      tween = { from: orient.clone(), to, t0: performance.now() };
      start();
    },
    dispose() {
      disposed = true;
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      canvas.removeEventListener("webglcontextlost", onLost);
      videos.splice(0).forEach((entry) => unloadVideo(entry.video));
      textures.forEach((t) => t.dispose());
      textures.clear();
      faceMats.forEach((m) => m.dispose());
      reflectMats?.forEach((m) => m.dispose());
      lineMats.forEach((m) => m.dispose());
      geometry.dispose();
      edgeGeo?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentNode === host) host.removeChild(canvas);
    },
  };
}
