import * as THREE from "three";

// The home page's backdrop: a tunnel of glowing specks streaming toward the
// viewer, in Zatla greens with a little violet and white. Same contract as the
// other home scenes (see SceneStage.jsx): mount into a div, return
// { setActive, setReducedMotion, setParallax, dispose }.

const RADIUS = 9;        // tunnel radius
const DEPTH = 120;       // how far back the specks start
const SPEED = 14;        // units per second toward the camera
const COLORS = [0x2fc272, 0x2fc272, 0x9be15d, 0x9be15d, 0x7c4dff, 0xffffff];

// A soft round dot, drawn once, so each point is a glow rather than a square.
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.75)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function mountParticleTunnel(host, { reducedMotion = false, mobile = false, onReady, onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  } catch (e) { onError?.(e); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity 1s ease";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, DEPTH + 10);

  // Specks sit on (and a little inside) a cylinder along -z.
  const count = mobile ? 2000 : 4500;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RADIUS * (0.35 + Math.random() * 0.65);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r;
    pos[i * 3 + 2] = -Math.random() * DEPTH;
    c.setHex(COLORS[(Math.random() * COLORS.length) | 0]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const map = dotTexture();
  const material = new THREE.PointsMaterial({
    size: mobile ? 1.3 : 1.1, map, vertexColors: true, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let active = false, reduced = reducedMotion, raf = 0, last = 0;
  const want = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const frame = (t) => {
    raf = 0;
    const dt = Math.min((t - (last || t)) / 1000, 0.05);
    last = t;
    if (!reduced) {
      const p = geometry.attributes.position.array;
      for (let i = 2; i < p.length; i += 3) {
        p[i] += SPEED * dt;
        if (p[i] > 1) p[i] -= DEPTH;
      }
      geometry.attributes.position.needsUpdate = true;
      points.rotation.z += dt * 0.05;
    }
    cur.x += (want.x - cur.x) * 0.05;
    cur.y += (want.y - cur.y) * 0.05;
    camera.position.set(cur.x * 1.5, -cur.y * 1.5, 0);
    camera.lookAt(0, 0, -DEPTH);
    renderer.render(scene, camera);
    if (active && !reduced) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

  renderer.render(scene, camera);
  canvas.style.opacity = "1";
  onReady?.();

  return {
    setActive(v) { active = v; if (v) kick(); },
    setReducedMotion(v) { reduced = v; kick(); },
    setParallax(x, y) { want.x = x || 0; want.y = y || 0; if (active) kick(); },
    dispose() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      geometry.dispose(); material.dispose(); map.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
