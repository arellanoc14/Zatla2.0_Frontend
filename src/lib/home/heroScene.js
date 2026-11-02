import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadGLB } from "@/lib/growroom/glbModel";
import { DEFAULT_MODELS } from "@/lib/growroom/globalModels";

// The home page hero: the ZATLA light presented in a dark studio.
//
// Plain three.js, mounted into a host element by mountHeroScene() and torn down
// by the handle it returns. It shares only the GLB loader and its cache with the
// rest of the app, so the model file is fetched and decoded once per visit.
//
// The fixture does not spin. It hangs at one pose and is presented the way a
// product is: it settles into place as it fades in, floats with a slow breath,
// the key light sweeps across its housing, and the camera leans with the
// pointer (desktop) or the phone's tilt (touch) so the visitor's hand reveals
// the geometry. All of it runs from one clock in one requestAnimationFrame loop
// that only runs while the hero is on screen and the tab is visible; reduced
// motion renders a single still frame. Nothing here touches React state.

const FIXTURE_WIDTH = 2;             // scene units for the fixture's long side
const POSE_DEG = 180;                // logo reads left to right from below
const LIT = new THREE.Color(0xfff2fb);

// Mirrors the product page's treatment: the baked texture is white where the
// diodes are and dark across the housing, so used as the emissive map it lights
// the bars and leaves the frame unlit. Materials are cloned so the shared cache
// stays untouched. Returns the clones for disposal.
function litMaterials(model, intensity) {
  const clones = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const wasArray = Array.isArray(o.material);
    const mats = (wasArray ? o.material : [o.material]).map((m) => {
      const mt = m.clone();
      if (mt.map) { mt.emissiveMap = mt.map; mt.emissive = LIT.clone(); mt.emissiveIntensity = intensity; }
      mt.needsUpdate = true;
      clones.push(mt);
      return mt;
    });
    o.material = wasArray ? mats : mats[0];
  });
  return clones;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

export function mountHeroScene(host, { url = DEFAULT_MODELS.growLightUrl, reducedMotion = false, mobile = false, onReady, onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  } catch (e) { onError?.(e); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity 1.4s ease";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.6;

  // Studio lighting: a warm key that slowly sweeps across the housing, a cool
  // rim from behind, a soft fill, and the fixture's own spill below its face.
  const key = new THREE.DirectionalLight(0xfff4e8, 1.1);
  const rim = new THREE.DirectionalLight(0xdfe9ff, 1.3);
  rim.position.set(-3, 1.5, -3);
  const fill = new THREE.AmbientLight(0xffffff, 0.14);
  const spill = new THREE.PointLight(0xfff0e2, 6, 7, 2);
  spill.position.set(0, 0, 0.6);
  scene.add(key, rim, fill, spill);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const holder = new THREE.Group();   // the normalised fixture, at its pose
  const rig = new THREE.Group();      // float and settle
  rig.add(holder);
  scene.add(rig);
  // Face-on: the fixture is tipped so its lit face (and the logo) looks straight
  // at the viewer, like a product shot, instead of hanging face-down.
  holder.rotation.set(THREE.MathUtils.degToRad(90), THREE.MathUtils.degToRad(POSE_DEG), 0, "YXZ");

  let radius = 1.4, ready = false, disposed = false, raf = 0, active = false;
  let reduced = reducedMotion, materials = [], entranceStart = -1, width = 1, height = 1;
  const clock = new THREE.Clock(false);
  // Parallax target (-1..1) and the eased value the camera actually uses.
  const want = { x: 0, y: 0 }, have = { x: 0, y: 0 };

  const aim = new THREE.Vector3(0, -0.05, 0);
  const placeCamera = (t) => {
    // Straight at the lit face, leaning only a few degrees with the pointer / tilt
    // so the logo always reads head-on.
    const elevation = THREE.MathUtils.degToRad(4 * have.y + (reduced ? 0 : 1.0 * Math.sin((t / 11) * Math.PI * 2)));
    const azimuth = THREE.MathUtils.degToRad(6 * have.x + (reduced ? 0 : 1.2 * Math.sin((t / 17) * Math.PI * 2)));
    const fovV = THREE.MathUtils.degToRad(camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const dist = Math.max(radius / (1.15 * Math.tan(fovH / 2)), (0.8 * radius) / (0.86 * Math.tan(fovV / 2))); // face-on: the whole square face fits, with margin
    camera.position.set(dist * Math.cos(elevation) * Math.sin(azimuth), dist * Math.sin(elevation), dist * Math.cos(elevation) * Math.cos(azimuth));
    camera.lookAt(aim);
  };

  const frame = (t) => {
    have.x = lerp(have.x, want.x, 0.06);
    have.y = lerp(have.y, want.y, 0.06);
    // Float: a slow breath up and down, with a hint of hanging sway.
    const breath = reduced ? 0 : Math.sin((t / 6.5) * Math.PI * 2);
    let lift = 0;
    if (entranceStart >= 0 && !reduced) lift = (1 - easeOutCubic(clamp01((t - entranceStart) / 1.8))) * 0.32;
    rig.position.y = lift + 0.035 * breath;
    rig.rotation.z = THREE.MathUtils.degToRad(0.8) * breath;
    rig.rotation.x = THREE.MathUtils.degToRad(-2.5 * have.y);
    // The key light sweeps slowly across the housing, left to right and back.
    const sweep = reduced ? 0 : Math.sin((t / 13) * Math.PI * 2);
    key.position.set(2.5 * Math.cos(sweep * 0.9), 3, 2.5 * Math.sin(sweep * 0.9) + 1.2);
    key.intensity = 1.0 + 0.25 * (0.5 + 0.5 * Math.cos((t / 13) * Math.PI * 2));
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
      materials = litMaterials(model, 2.4);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(box.getCenter(new THREE.Vector3()));
      holder.add(model);
      holder.scale.setScalar(FIXTURE_WIDTH / Math.max(size.x, size.z, 1e-6));
      holder.updateMatrixWorld(true);
      radius = new THREE.Box3().setFromObject(holder).getBoundingSphere(new THREE.Sphere()).radius;
      ready = true;
      entranceStart = 0;
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
      materials.forEach((m) => m.dispose());   // clones only; geometry and textures stay in the shared cache
      env.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    },
  };
}
