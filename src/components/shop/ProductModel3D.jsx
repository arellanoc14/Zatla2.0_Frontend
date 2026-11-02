import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadGLB } from "@/lib/growroom/glbModel";
import { DEFAULT_MODELS, getGlobalModels } from "@/lib/growroom/globalModels";
import { Loader2 } from "lucide-react";

// Stationary view of the ZATLA grow-light .glb, with its bars lit.
// It does not spin on its own; drag to orbit. Nothing animates, so the scene
// renders on demand and costs nothing while the visitor is just looking at it.

const GLOW = 0xffe4f4;

// Soft radial falloff used for the light spill under the fixture.
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.32, "rgba(255,255,255,0.22)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function ProductModel3D() {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;

    // Keyed down from before so the fixture's own emission is what reads.
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(2, 3, 3);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.18));

    // The light the fixture throws: a tinted source just under the bars, and a
    // soft spill sprite so the emission reads against the dark card.
    const spill = new THREE.PointLight(GLOW, 14, 9, 2);
    spill.position.set(0, -0.5, 0.25);
    scene.add(spill);

    const glowTex = makeGlowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: GLOW, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    glow.position.set(0, -0.15, -0.4);
    glow.scale.setScalar(5.2);
    scene.add(glow);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    // Default view: straight down on the fixture (no tilt), LED face toward the camera, logo upright.
    camera.up.set(0, 0, -1);
    camera.position.set(0, 3.3, 0);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;   // no easing, so nothing needs to tick
    controls.enablePan = false;
    controls.autoRotate = false;      // stationary
    controls.minDistance = 1.5;
    controls.maxDistance = 14;

    // Back the camera off just far enough that the fixture touches the card edges, keeping the view direction.
    let holder = null;
    let moved = false;
    const fit = () => {
      if (!holder) return;
      const b = new THREE.Box3().setFromObject(holder), pts = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z));
      const dir = camera.position.clone().normalize();
      let lo = 1.2, hi = 14;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        camera.position.copy(dir).multiplyScalar(mid); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
        const m = Math.max(...pts.map((p) => { const q = p.clone().project(camera); return Math.max(Math.abs(q.x), Math.abs(q.y)); }));
        if (m > 0.985) lo = mid; else hi = mid;
      }
      camera.position.copy(dir).multiplyScalar(hi); camera.lookAt(0, 0, 0);
    };
    controls.addEventListener("start", () => { moved = true; });

    // ── On-demand rendering ────────────────────────────────────────────────
    let raf = 0;
    let disposed = false;
    const render = () => { raf = 0; if (!disposed) renderer.render(scene, camera); };
    const request = () => { if (!raf && !disposed) raf = requestAnimationFrame(render); };
    controls.addEventListener("change", request);

    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!moved) fit();
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    getGlobalModels()
      .then((m) => m.growLightUrl || DEFAULT_MODELS.growLightUrl)
      .catch(() => DEFAULT_MODELS.growLightUrl)
      .then((url) => loadGLB(url))
      .then((src) => {
        if (disposed) return;
        const model = src.clone(true);

        // Light the bars. The baked texture is white where the diodes are and
        // dark across the frame, so reusing it as the emissive map lights the
        // bars and leaves the housing unlit.
        model.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const wasArray = Array.isArray(o.material);
          const mats = wasArray ? o.material : [o.material];
          const lit = mats.map((m) => {
            const mt = m.clone();          // don't touch the shared cache
            if (mt.map) {
              mt.emissiveMap = mt.map;
              mt.emissive = new THREE.Color(0xfff2fb);
              mt.emissiveIntensity = 3.4;
            }
            mt.needsUpdate = true;
            return mt;
          });
          o.material = wasArray ? lit : lit[0];
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(box.getCenter(new THREE.Vector3()));
        holder = new THREE.Group();
        holder.add(model);
        holder.scale.setScalar(2.4 / Math.max(size.x, size.z, 1e-6));
        holder.rotation.z = Math.PI;   // LED face toward the camera, logo reading upright
        scene.add(holder);
        moved = false;
        fit();
        setLoading(false);
        request();
      })
      .catch(() => { if (!disposed) setLoading(false); });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      controls.removeEventListener("change", request);
      ro.disconnect();
      controls.dispose();
      glow.material.dispose();
      glowTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
