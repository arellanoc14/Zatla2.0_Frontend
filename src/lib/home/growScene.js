import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadGLB } from "@/lib/growroom/glbModel";
import { DEFAULT_MODELS, STUDIO_MODELS } from "@/lib/growroom/globalModels";

// The home page's second scene: the ZATLA light hung over a living plant.
//
// The fixture's LEDs drift slowly through horticultural colours — deep red,
// pink-purple, blue, violet — and the light they throw follows: a spotlight
// from the fixture, the pool on the floor, the cone in the air, the highlights
// on the leaves. The plant breathes: a slow sway and a slight swell, the
// feeling of growth without a literal growth simulation.
//
// Same rules as the hero: one renderer, one loop, running only while on screen
// and the tab is visible; reduced motion renders one still frame. The fixture
// is the studio's lighter room copy of the model (36k triangles), the plant is
// the app's own plant model, both through the shared loader and cache.

const KEYS = [0xff2614, 0xe6479a, 0x9b3dff, 0x3d6bff, 0xff4a7d]; // deep red, pink, violet, blue, warm pink
const CYCLE_SECONDS = 36;
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, k) => a + (b - a) * k;

function ledColour(t, out) {
  const u = ((t / CYCLE_SECONDS) % 1 + 1) % 1;
  const seg = u * KEYS.length, i = Math.floor(seg), k = smooth(seg - i);
  const a = new THREE.Color(KEYS[i]), b = new THREE.Color(KEYS[(i + 1) % KEYS.length]);
  return out.copy(a).lerp(b, k);
}

// A soft vertical gradient for the light cone: bright at the fixture, gone at
// the floor, additive so it only ever brightens.
function coneTexture() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.14)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function poolTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.9)"); grad.addColorStop(0.45, "rgba(255,255,255,0.35)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export function mountGrowScene(host, { reducedMotion = false, mobile = false, onReady, onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  } catch (e) { onError?.(e); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity 1.4s ease";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.12;   // a dark grow room: the fixture is the light

  const hemi = new THREE.HemisphereLight(0x9fb4c8, 0x0b0f0d, 0.22);
  scene.add(hemi);
  // The fixture's light: a spot aimed straight down at the plant.
  const spot = new THREE.SpotLight(0xffffff, 60, 9, 0.62, 0.55, 1.6);
  spot.position.set(0, 2.1, 0);
  spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);
  if (!mobile) {
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    spot.shadow.radius = 4;
  }

  // Floor: a dark disc the pool of light lands on.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x14191a, roughness: 0.95, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const poolTex = poolTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.005;
  scene.add(pool);
  // Light cone from the fixture to the floor.
  const coneTex = coneTexture();
  const coneMat = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.35, 2.05, 40, 1, true), coneMat);
  cone.position.y = 1.05;
  scene.add(cone);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  const fixture = new THREE.Group(); scene.add(fixture);
  const plant = new THREE.Group(); scene.add(plant);
  let plantBase = 1, fixtureBase = 1;

  let ready = 0, disposed = false, raf = 0, active = false, reduced = reducedMotion, width = 1, height = 1;
  const clock = new THREE.Clock(false);
  const want = { x: 0, y: 0 }, have = { x: 0, y: 0 };
  const materials = [];
  const ledMats = [];
  const led = new THREE.Color();

  const placeCamera = () => {
    const portrait = height > width;
    const elevation = THREE.MathUtils.degToRad(3 + 4 * have.y); // just under the fixture: its LED face shows, the floor still reads
    const azimuth = THREE.MathUtils.degToRad(-14 + 12 * have.x);
    const dist = portrait ? 5.9 : 5.1;
    const target = new THREE.Vector3(0, portrait ? 1.1 : 1.05, 0);
    camera.position.set(target.x + dist * Math.cos(elevation) * Math.sin(azimuth), target.y + dist * Math.sin(elevation), target.z + dist * Math.cos(elevation) * Math.cos(azimuth));
    camera.lookAt(target);
  };

  const frame = (t) => {
    have.x = lerp(have.x, want.x, 0.06); have.y = lerp(have.y, want.y, 0.06);
    ledColour(reduced ? 3 : t, led);
    ledMats.forEach((m) => { m.emissive.copy(led); });
    spot.color.copy(led);
    poolMat.color.copy(led); coneMat.color.copy(led);
    // The emitted light breathes very slowly; the plant sways and swells.
    const breathe = reduced ? 1 : 0.92 + 0.08 * Math.sin((t / 9) * Math.PI * 2);
    spot.intensity = 60 * breathe; poolMat.opacity = 0.35 * breathe; coneMat.opacity = 0.22 * breathe;
    const sway = reduced ? 0 : Math.sin((t / 5.5) * Math.PI * 2);
    plant.rotation.z = THREE.MathUtils.degToRad(1.4) * sway;
    plant.rotation.x = THREE.MathUtils.degToRad(0.8) * Math.sin((t / 7.3) * Math.PI * 2 + 1);
    const grow = reduced ? 1 : 1 + 0.025 * (0.5 - 0.5 * Math.cos((t / 24) * Math.PI * 2));
    plant.scale.setScalar(plantBase * grow);
    fixture.position.y = 2.1 + (reduced ? 0 : 0.02 * Math.sin((t / 8) * Math.PI * 2));
    placeCamera();
    renderer.render(scene, camera);
  };
  const settled = () => Math.abs(have.x - want.x) < 0.002 && Math.abs(have.y - want.y) < 0.002;
  const tick = () => { raf = 0; if (disposed || !active || ready < 2) return; frame(clock.getElapsedTime()); if (!reduced || !settled()) raf = requestAnimationFrame(tick); };
  const renderOnce = () => { if (ready >= 2 && !disposed) frame(clock.getElapsedTime()); };
  const start = () => { if (disposed || ready < 2) return; if (!clock.running) clock.start(); if (!raf) raf = requestAnimationFrame(tick); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const resize = () => {
    width = host.clientWidth || 1; height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderOnce();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  const landed = () => {
    ready += 1;
    if (ready < 2 || disposed) return;
    clock.start();
    renderer.domElement.style.opacity = "1";
    onReady?.();
    if (active) start(); else renderOnce();
  };

  // The fixture, hung face-down over the plant, its bars lit in the LED colour.
  loadGLB(STUDIO_MODELS.growLightUrl).then((src) => {
    if (disposed) return;
    const model = src.clone(true);
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const wasArray = Array.isArray(o.material);
      const mats = (wasArray ? o.material : [o.material]).map((m) => {
        const mt = m.clone();
        if (mt.map) { mt.emissiveMap = mt.map; mt.emissive = new THREE.Color(0xffffff); mt.emissiveIntensity = 2.6; ledMats.push(mt); }
        // The housing (unmapped parts) is lit a little from "the room" so the
        // fixture reads as the product, not a black bar, without a light that
        // would also wash the plant.
        else if (mt.emissive) { mt.emissive.set(0x2a3038); mt.emissiveIntensity = 1; }
        materials.push(mt); return mt;
      });
      o.material = wasArray ? mats : mats[0];
      o.castShadow = false; o.receiveShadow = false;
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    fixtureBase = 1.9 / Math.max(size.x, size.z, 1e-6);
    fixture.add(model); fixture.scale.setScalar(fixtureBase); fixture.position.y = 2.1;
    landed();
  }).catch((e) => { if (!disposed) onError?.(e); });

  // The plant, standing on the floor under the light.
  loadGLB(DEFAULT_MODELS.cannabisPlantUrl).then((src) => {
    if (disposed) return;
    const model = src.clone(true);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { const mt = o.material.clone(); mt.roughness = Math.min(1, (mt.roughness ?? 0.8) + 0.1); materials.push(mt); o.material = mt; } } });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    plantBase = 1.45 / Math.max(size.y, 1e-6);
    plant.add(model); plant.scale.setScalar(plantBase);
    landed();
  }).catch((e) => { if (!disposed) onError?.(e); });

  return {
    setActive(on) { active = !!on; if (active) start(); else stop(); },
    setReducedMotion(on) { reduced = !!on; if (reduced) { stop(); renderOnce(); } else if (active) start(); },
    setParallax(x, y) { want.x = Math.max(-1, Math.min(1, x || 0)); want.y = Math.max(-1, Math.min(1, y || 0)); if (active) start(); },
    dispose() {
      disposed = true; stop(); ro.disconnect();
      materials.forEach((m) => m.dispose());
      floor.geometry.dispose(); floor.material.dispose(); pool.geometry.dispose(); poolMat.dispose(); poolTex.dispose();
      cone.geometry.dispose(); coneMat.dispose(); coneTex.dispose();
      env.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    },
  };
}
