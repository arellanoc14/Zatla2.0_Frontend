import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadGLB } from "@/lib/growroom/glbModel";
import { DEFAULT_MODELS } from "@/lib/growroom/globalModels";

// The home hero: the ZATLA fixture HANGING, seen from below the way a grower
// sees it over the canopy. It hangs from two cables at the top of the frame,
// its lit face angled toward the camera, and a cone of its own light falls
// out of the bottom of the frame onto the photo beneath.
//
// The attention beat: on load the fixture is dark, then POWERS ON bar by bar
// across its width (an emissive sweep injected into the material shader), the
// cone brightening with it. After that it breathes: a slow sway on its cables,
// the light drifting between warm white and the deep red of a flowering
// spectrum, and the camera leaning with the pointer / the phone's tilt.
//
// Plain three.js on a transparent canvas, mounted by mountHeroHangScene() and
// torn down by the handle it returns. Shares the GLB cache with the app.

const FIXTURE_WIDTH = 2.2;        // scene units for the fixture's long side
const POSE_DEG = 180;             // logo reads the right way from below
const WARM = new THREE.Color(0xfff1dc);
const BLOOM = new THREE.Color(0xff9ab4);

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

// Emissive map = the baked texture (white on the diodes, dark on the housing),
// plus a power-on sweep: uSweep runs -1.3 → 1.3 across the fixture's width in
// world X, and only diodes left of it are lit. Returns the cloned materials
// (for disposal) and the shared uniforms.
function litMaterials(model, radius) {
  const clones = [];
  const uniforms = { uSweep: { value: -1.3 }, uRadius: { value: radius }, uGlow: { value: 1 } };
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const wasArray = Array.isArray(o.material);
    const mats = (wasArray ? o.material : [o.material]).map((m) => {
      const mt = m.clone();
      if (mt.map) {
        mt.emissiveMap = mt.map; mt.emissive = WARM.clone(); mt.emissiveIntensity = 2.6;
        mt.onBeforeCompile = (sh) => {
          sh.uniforms.uSweep = uniforms.uSweep; sh.uniforms.uRadius = uniforms.uRadius; sh.uniforms.uGlow = uniforms.uGlow;
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nvarying float vWx;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWx = (modelMatrix * vec4(transformed, 1.0)).x;");
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float vWx; uniform float uSweep; uniform float uRadius; uniform float uGlow;")
            .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
              float sx = vWx / max(uRadius, 1e-4);
              float on = smoothstep(uSweep, uSweep - 0.22, sx);
              // a bar flickers for an instant as it strikes
              float strike = smoothstep(uSweep - 0.22, uSweep - 0.1, sx) * smoothstep(uSweep, uSweep - 0.1, sx);
              totalEmissiveRadiance *= uGlow * (on + 1.6 * strike);`);
        };
      }
      mt.needsUpdate = true;
      clones.push(mt);
      return mt;
    });
    o.material = wasArray ? mats : mats[0];
  });
  return { clones, uniforms };
}

// The cone of light under the fixture: an open cylinder, additive, fading
// toward its foot and toward its silhouette so it reads as light in haze.
function makeCone(topR, bottomR, height) {
  const geo = new THREE.CylinderGeometry(topR, bottomR, height, 48, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(0xff6a8c) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = abs(dot(normalize(vN), normalize(vV)));          // 1 facing us, 0 at the silhouette
        float body = pow(edge, 1.3);
        float fall = pow(vUv.y, 1.35) * (1.0 - 0.55 * smoothstep(0.78, 1.0, vUv.y)); // bright under the fixture, clear at its face, gone at the foot
        float shimmer = 0.9 + 0.1 * sin(vUv.x * 40.0 + uTime * 0.7) * sin(vUv.y * 9.0 - uTime * 0.5);
        float a = uAlpha * body * fall * shimmer * 1.15;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

export function mountHeroHangScene(host, { url = DEFAULT_MODELS.growLightUrl, reducedMotion = false, mobile = false, onReady, onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  } catch (e) { onError?.(e); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity 1.2s ease";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;

  // Dim studio: the fixture is the light source. A faint cool rim from behind
  // keeps the housing's edge readable, and a warm point under the face is the
  // fixture's own light on its frame.
  const rim = new THREE.DirectionalLight(0xcfe0ff, 0.9);
  rim.position.set(-2, 3, -3);
  const fill = new THREE.AmbientLight(0xffffff, 0.08);
  const own = new THREE.PointLight(0xffd0d8, 0, 6, 2);
  scene.add(rim, fill, own);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const swing = new THREE.Group();   // pivots at the ceiling point: the sway
  const holder = new THREE.Group();  // the normalised fixture, face down
  const cone = makeCone(1.0, 2.1, 3.4);
  swing.add(holder, cone);
  scene.add(swing);
  holder.rotation.set(0, THREE.MathUtils.degToRad(POSE_DEG), 0);

  // Two hanging cables from the fixture up out of the frame.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.6 });
  const cableGeo = new THREE.CylinderGeometry(0.008, 0.008, 4, 6);
  const cables = [-0.62, 0.62].map((x) => { const c = new THREE.Mesh(cableGeo, cableMat); c.position.set(x, 2, 0); swing.add(c); return c; });

  let radius = 1.2, ready = false, disposed = false, raf = 0, active = false;
  let reduced = reducedMotion, materials = [], uniforms = null, t0 = -1, width = 1, height = 1;
  const clock = new THREE.Clock(false);
  const want = { x: 0, y: 0 }, have = { x: 0, y: 0 };

  // The fixture hangs in the top third of the frame; the camera sits below and
  // in front, looking up at its lit face, the cone running out of the bottom.
  const FIX_Y = 0.95;
  const aim = new THREE.Vector3(0, -0.15, 0);
  const placeCamera = (t) => {
    const drift = reduced ? 0 : 1;
    const elevation = THREE.MathUtils.degToRad(-24 + 5 * have.y + drift * 1.2 * Math.sin((t / 13) * Math.PI * 2));
    const azimuth = THREE.MathUtils.degToRad(13 + 9 * have.x + drift * 2.0 * Math.sin((t / 19) * Math.PI * 2));
    const dist = 5.4 * (camera.aspect < 1 ? 1.25 : 1);
    camera.position.set(dist * Math.cos(elevation) * Math.sin(azimuth), FIX_Y + dist * Math.sin(elevation), dist * Math.cos(elevation) * Math.cos(azimuth));
    camera.lookAt(aim);
  };

  const frame = (t) => {
    have.x = lerp(have.x, want.x, 0.06);
    have.y = lerp(have.y, want.y, 0.06);
    const since = t0 >= 0 ? t - t0 : 0;
    // Entrance: the fixture is lowered on its cables as it fades in (1.6s),
    // then powers on across its width (0.9s → 2.6s).
    const drop = reduced ? 1 : easeOutCubic(clamp01(since / 1.6));
    const sweep = reduced ? 1 : easeInOut(clamp01((since - 0.9) / 1.7));
    if (uniforms) uniforms.uSweep.value = -1.3 + 2.6 * sweep;
    const lit = reduced ? 1 : clamp01((since - 1.0) / 1.9);
    cone.material.uniforms.uAlpha.value = lit;
    cone.material.uniforms.uTime.value = t;
    own.intensity = 10 * lit;
    // Spectrum breath: the diodes drift between warm white and flowering red.
    const k = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((t / 9) * Math.PI * 2);
    const col = WARM.clone().lerp(BLOOM, 0.55 * k);
    materials.forEach((m) => { if (m.emissive) m.emissive.copy(col); });
    cone.material.uniforms.uColor.value.setRGB(1.0, lerp(0.5, 0.36, k), lerp(0.62, 0.5, k));
    // Sway: a slow pendulum on the cables, and the body following the pointer.
    const sway = reduced ? 0 : Math.sin((t / 7.5) * Math.PI * 2);
    swing.position.y = FIX_Y + (1 - drop) * 0.9;
    swing.rotation.z = THREE.MathUtils.degToRad(1.4) * sway + THREE.MathUtils.degToRad(-3 * have.x);
    swing.rotation.x = THREE.MathUtils.degToRad(0.6) * Math.sin((t / 11) * Math.PI * 2) + THREE.MathUtils.degToRad(2.5 * have.y);
    placeCamera(t);
    renderer.render(scene, camera);
  };

  const settled = () => Math.abs(have.x - want.x) < 0.002 && Math.abs(have.y - want.y) < 0.002;
  const tick = () => {
    raf = 0;
    if (disposed || !active || !ready) return;
    frame(clock.getElapsedTime());
    if (!reduced || !settled()) raf = requestAnimationFrame(tick);
  };
  const renderOnce = () => { if (ready && !disposed) frame(clock.getElapsedTime()); };
  const start = () => { if (disposed || !ready) return; if (!clock.running) clock.start(); if (!raf) raf = requestAnimationFrame(tick); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const resize = () => {
    width = host.clientWidth || 1; height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderOnce();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  loadGLB(url)
    .then((src) => {
      if (disposed) return;
      const model = src.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(box.getCenter(new THREE.Vector3()));
      holder.add(model);
      holder.scale.setScalar(FIXTURE_WIDTH / Math.max(size.x, size.z, 1e-6));
      holder.updateMatrixWorld(true);
      const hb = new THREE.Box3().setFromObject(holder);
      radius = (hb.max.x - hb.min.x) / 2;
      const lm = litMaterials(model, radius);
      materials = lm.clones; uniforms = lm.uniforms;
      // Cables meet the fixture's top face at its corners; the cone starts at its lit face.
      const depth = hb.max.z - hb.min.z;
      cables.forEach((c, i) => { c.position.set((i ? 1 : -1) * radius * 0.72, hb.max.y + 2, 0); });
      cone.scale.set(1, 1, Math.max(0.5, depth / (radius * 2)));
      cone.position.y = hb.min.y - 1.6 + 0.02;
      ready = true;
      t0 = 0;
      clock.start();
      renderer.domElement.style.opacity = "1";
      onReady?.();
      if (active) start(); else renderOnce();
    })
    .catch((e) => { if (!disposed) onError?.(e); });

  return {
    setActive(on) { active = !!on; if (active) start(); else stop(); },
    setReducedMotion(on) { reduced = !!on; if (reduced) { stop(); renderOnce(); } else if (active) start(); },
    setParallax(x, y) { want.x = Math.max(-1, Math.min(1, x || 0)); want.y = Math.max(-1, Math.min(1, y || 0)); if (active) start(); },
    dispose() {
      disposed = true; stop(); ro.disconnect();
      materials.forEach((m) => m.dispose());
      cone.geometry.dispose(); cone.material.dispose(); cableGeo.dispose(); cableMat.dispose();
      env.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    },
  };
}
