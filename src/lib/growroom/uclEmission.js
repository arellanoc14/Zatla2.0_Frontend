// ZATLA under-canopy light (UCL) emission — the LED chase on every UCL bar.
//
// The real fixture is a slim bar with two LED strips under a frosted diffuser,
// driven in a forward-travelling chase: along the bar, neighbouring LED groups
// alternate between full and ~35% brightness, and the bright/dim sets swap in
// a steady rhythm so the light reads as advancing down the bar. Here each bar
// gets EIGHT segments ("rows") down its length on each of its two strips — 16
// glowing panes per unit — plus one soft magenta spill pool on the tray around
// it. Everything per room is ONE InstancedMesh of panes and ONE of pools, so a
// room of any size costs two draw calls. Colour is the deep pink-magenta of a
// horticultural red + far-red bar.
//
// The chase is the only thing that moves: a `uTime` uniform, advanced from
// tick() while the beams are on (30 fps cap, paused when the tab is hidden or
// under prefers-reduced-motion — then the pattern just holds).
//
// Every pane / pool instance carries its bench id (userData.instanceBenchIds)
// so a mobile-aisle column slide carries the glow with its bar.
import * as THREE from "three";

export const UCL_SEGMENTS = 8;          // "rows" of LEDs down one 4ft unit
export const UCL_STRIPS = [-0.2, 0.2];   // the two LED strips, as a fraction of the bar width
const STRIP_W = 0.34;                   // one strip's glow width, fraction of the bar width
const DIM = 0.3;                        // dim set's brightness relative to the bright set
const CHASE_HZ = 1.1;                   // swaps per second
const POOL_W = 2.6;                     // spill pool width, × bar width (+ 0.8 × unit height)
const POOL_L = 1.08;                    // spill pool length, × unit length
const FRAME_MS = 1000 / 30;

const MAGENTA = new THREE.Color(1.0, 0.08, 0.62);

// aSeg = segment index down the bar (0..7). Bright when cos(π(aSeg − t)) > 0:
// even segments start bright, odd dim, and the sets swap once per unit of t,
// smoothed over the swap so the light flows rather than blinks.
const CHASE_GLSL = `
float chase(float seg, float t) {
  float w = cos(3.14159265 * (seg - t));
  return mix(${DIM.toFixed(2)}, 1.0, smoothstep(-0.45, 0.45, w));
}`;

const PANE_VS = `
attribute float aSeg;
varying vec2 vUv; varying float vSeg;
void main() {
  vUv = uv; vSeg = aSeg;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const PANE_FS = `
uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying vec2 vUv; varying float vSeg;
${CHASE_GLSL}
void main() {
  float b = chase(vSeg, uTime);
  // Hot LED core down the strip centre, a softer diffuser glow out to the edge.
  // Blended normally (not additive) so a DIM segment really reads darker than
  // its bright neighbours - that contrast is the whole chase.
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float along = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
  float core = smoothstep(0.3, 0.8, across);
  vec3 c = uColor * (0.22 + 0.78 * b);
  c = mix(c, vec3(1.0, 0.78, 0.95), core * b * b * 0.65);
  float a = uAlpha * along * mix(0.6, 1.0, core);
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}`;

const POOL_VS = `
attribute float aPhase;
varying vec2 vUv; varying float vPhase;
void main() {
  vUv = uv; vPhase = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const POOL_FS = `
uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying vec2 vUv; varying float vPhase;
${CHASE_GLSL}
void main() {
  float dx = abs(vUv.x - 0.5) * 2.0;
  float dy = abs(vUv.y - 0.5) * 2.0;
  float f = (1.0 - smoothstep(0.0, 1.0, dx)) * (1.0 - smoothstep(0.75, 1.0, dy));
  // The spill breathes with the chase above it (segment = position down the bar).
  float seg = vUv.y * ${UCL_SEGMENTS.toFixed(1)} - 0.5;
  float b = mix(0.65, 1.0, chase(seg, uTime + vPhase));
  float a = uAlpha * f * f * b;
  if (a < 0.006) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.55, 0.85), 0.35), a);
}`;

// Normal blending on purpose: additive magenta over the bar's own bright top
// texture (and over a pale tray) just saturates to white-pink, and the dim half
// of the chase disappears. Blended, the dim segments stay visibly darker.
const blended = { transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide };

// bars: [{ x, y, z, rotationY, benchId }] in `group` local inches, y = the
// unit's seat (its underside). w = the LED bar's width, len = unit length, h =
// the unit's height (bar alone, or bar on its stands - the LED face is on top
// either way). The spill pool on the tray widens as the bar rides higher.
export function createUclEmission({ group, bars, w, len, h, reducedMotion = false, enabled = true }) {
  const paneGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const paneMat = new THREE.ShaderMaterial({
    ...blended, vertexShader: PANE_VS, fragmentShader: PANE_FS,
    uniforms: { uColor: { value: MAGENTA.clone() }, uTime: { value: 0 }, uAlpha: { value: 0.95 } },
  });
  const poolMat = new THREE.ShaderMaterial({
    ...blended, vertexShader: POOL_VS, fragmentShader: POOL_FS,
    uniforms: { uColor: { value: MAGENTA.clone() }, uTime: { value: 0 }, uAlpha: { value: 0.4 } },
  });

  const paneCount = bars.length * UCL_STRIPS.length * UCL_SEGMENTS;
  const panes = new THREE.InstancedMesh(paneGeo, paneMat, paneCount);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, bars.length);
  const segAttr = new Float32Array(paneCount);
  const phaseAttr = new Float32Array(bars.length);
  const paneIds = [], poolIds = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const segLen = len / UCL_SEGMENTS;
  let i = 0;
  bars.forEach((b, bi) => {
    const rot = b.rotationY || 0;
    q.setFromAxisAngle(up, rot);
    const ux = Math.sin(rot), uz = Math.cos(rot);    // along the bar (local Z)
    const wx = Math.cos(rot), wz = -Math.sin(rot);   // across the bar (local X)
    const top = b.y + h + 0.12;                       // the LED face, just off the diffuser
    UCL_STRIPS.forEach((sf) => {
      for (let k = 0; k < UCL_SEGMENTS; k++) {
        const along = (k + 0.5) * segLen - len / 2;
        const across = sf * w;
        p.set(b.x + ux * along + wx * across, top, b.z + uz * along + wz * across);
        s.set(w * STRIP_W, 1, segLen * 1.02);
        m.compose(p, q, s);
        panes.setMatrixAt(i, m);
        segAttr[i] = k;
        paneIds.push(b.benchId);
        i += 1;
      }
    });
    p.set(b.x, b.y + 0.35, b.z);
    s.set(w * POOL_W + h * 0.8, 1, len * POOL_L);
    m.compose(p, q, s);
    pools.setMatrixAt(bi, m);
    phaseAttr[bi] = 0;
    poolIds.push(b.benchId);
  });
  paneGeo.setAttribute("aSeg", new THREE.InstancedBufferAttribute(segAttr, 1));
  poolGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phaseAttr, 1));
  panes.instanceMatrix.needsUpdate = true;
  pools.instanceMatrix.needsUpdate = true;
  [panes, pools].forEach((mesh) => {
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.userData.perfTag = "beams";
    mesh.castShadow = mesh.receiveShadow = false;
  });
  panes.userData.instanceBenchIds = paneIds;
  pools.userData.instanceBenchIds = poolIds;
  pools.renderOrder = 5;

  const holder = new THREE.Group();
  holder.userData.perfTag = "beams";
  holder.add(pools, panes);
  holder.visible = !!enabled;
  group.add(holder);

  let on = !!enabled;
  let lastFrame = 0;
  const tick = (now) => {
    if (!on || reducedMotion) return false;
    if (now - lastFrame < FRAME_MS - 1) return "wait";
    lastFrame = now;
    const t = (now / 1000) * CHASE_HZ;
    paneMat.uniforms.uTime.value = t;
    poolMat.uniforms.uTime.value = t;
    return true;
  };
  const setEnabled = (v) => { on = !!v; holder.visible = on; };
  const dispose = () => {
    holder.parent?.remove(holder);
    paneGeo.dispose(); poolGeo.dispose(); paneMat.dispose(); poolMat.dispose();
  };
  return { tick, setEnabled, dispose, holder };
}
