import * as THREE from "three";
import { CHANNEL_AREAS, FACTORY_LEVELS, PARTICLE_COLORS, spectrumColor } from "@/lib/spectrum";

// ── Per-room light emission (view-only) ─────────────────────────────────────
// Every grow-light fixture throws a beam coloured by its room's spectrum, with
// photons falling through it, and lights a soft pool on the canopy deck under it
// (overlapping pools add up, so a row of fixtures lights its bench end to end —
// the GrowStudios canopy-pool look). Per room: ONE InstancedMesh beam, ONE
// InstancedMesh emitter strip, ONE InstancedMesh pool, ONE THREE.Points (animated
// entirely in the vertex shader). No THREE.Light — additive meshes only. Spectrum
// changes reconcile in place.

const BEAM_LEN_IN = 18;      // middle of the spec's 12–24 in mounting range
// A beam reaches further when its canopy is further away: it covers its base
// 18in plus HALF of whatever empty gap is left down to the deck, so the sheets
// of light and the pool on the tray read as one thing with no dark band
// between them. (The photons use the room's average reach.)
const beamReach = (y, deckY) => {
  const dist = Math.max(BEAM_LEN_IN, y - deckY);
  return BEAM_LEN_IN + 0.5 * (dist - BEAM_LEN_IN);
};
const SPREAD = 0.28;         // bottom footprint grows 28% each side
const MAX_PER_FIXTURE = 30;
// The ZATLA light's four LED faces, measured on the model (zatla-led7): each
// runs across 78% of the fixture width (the black rails either side are dark),
// is 7.3% of the fixture length deep, and sits at these fractions of the
// length from the fixture's local -z end. The light leaves the fixture from
// these four rows only — nothing from the rails, the ends or the logo panel.
const LED_ROWS = [0.047, 0.25, 0.769, 0.945];
const LED_ROW_W = 0.78;
const LED_ROW_L = 0.073;
// The LED faces sit INSIDE the fixture, 0.15–0.58 of its height above the
// frame's underside (the frame is an open rail, no bottom plate). The emitter
// glow and the top of each sheet start up at the faces, so the light reads as
// leaving the LEDs with no dark band under the fixture.
const FIXTURE_H_IN = 6;
const LED_FACE_LIFT_IN = 0.15 * FIXTURE_H_IN + 1.0; // ~1.9in up into the frame
// Canopy pool: how far it spreads past the fixture footprint. Across the bench it
// stays close to the deck edge (a wider pool would float in the aisle at deck
// height); along the bench it overlaps the next fixture's so a row reads as one
// lit canopy. TUNE.
const POOL_SPREAD_W = 1.12;
const POOL_SPREAD_L = 1.35;
const POOL_STRENGTH = 0.55;
// Fallback canopy deck under a fixture at height y, when the fit carries no deckY:
// single-tier tray at 14in, stacked tiers every 54in from 6in (canopyLightFit.js).
const deckUnder = (y) => {
  const k = Math.max(0, Math.floor(y / 54));
  return k === 0 ? 14 : 6 + k * 54;
};
const MAX_SCENE = 6000;
const EASE_MS = 250;

const levelsOf = (rm) => (Array.isArray(rm?.spectrum) && rm.spectrum.length === 4 ? rm.spectrum : FACTORY_LEVELS);

// Target uniforms for a spectrum: colour, alpha, and cumulative channel cut-offs.
function targetFor(levels) {
  const c = spectrumColor(levels);
  const w = levels.map((v, i) => (v / 100) * CHANNEL_AREAS[i]);
  const sum = w.reduce((a, b) => a + b, 0);
  const frac = c.on ? Math.min(1, c.photons) : 0;
  let acc = 0;
  const cum = w.map((x) => { acc += sum > 0 ? x / sum : 0; return acc * frac; });
  return {
    color: c.rgb.map((v) => v / 255),
    alpha: c.on ? 0.2 + 0.8 * Math.min(1, c.brightness) : 0,
    cum,
  };
}

// Unit truncated pyramid: top square at y=0 (±0.5), bottom at y=-1 (±0.5·(1+2·SPREAD)).
function beamGeometry() {
  const t = 0.5, b = 0.5 * (1 + 2 * SPREAD);
  const top = [[-t, 0, -t], [t, 0, -t], [t, 0, t], [-t, 0, t]];
  const bot = [[-b, -1, -b], [b, -1, -b], [b, -1, b], [-b, -1, b]];
  const pos = [];
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    pos.push(...top[i], ...bot[i], ...bot[j], ...top[i], ...bot[j], ...top[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

const BEAM_VS = `
varying float vT;
void main() {
  vT = -position.y;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const BEAM_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uStrength;
varying float vT;
void main() {
  float a = uAlpha * uStrength * mix(1.0, 0.12, vT);
  gl_FragColor = vec4(uColor * a, a);
}`;

// Instanced unit plane lying flat (uv 0..1). Soft elliptical falloff: bright under
// the fixture, fading to nothing at the pool's edge.
const POOL_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const POOL_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length((vUv - 0.5) * 2.0);
  float f = 1.0 - smoothstep(0.0, 1.0, d);
  float a = uAlpha * uStrength * f * f;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

const POINT_VS = `
uniform float uTime; uniform float uLen; uniform vec4 uCum; uniform float uScale;
uniform vec3 uCol[4]; uniform vec3 uAlt[4]; uniform vec4 uAltShare;
attribute vec3 aBase; attribute vec3 aDim; attribute vec4 aSeed;
varying vec3 vColor; varying float vA; varying float vGlow;
void main() {
  float r = aSeed.w;
  float ch = r < uCum.x ? 0.0 : r < uCum.y ? 1.0 : r < uCum.z ? 2.0 : r < uCum.w ? 3.0 : -1.0;
  float t = fract(uTime * (0.55 + 0.45 * aSeed.z) + aSeed.x * 7.13);
  float grow = 1.0 + 2.0 * ${SPREAD.toFixed(2)} * t;
  vec2 local = vec2(aSeed.x - 0.5, aSeed.y - 0.5) * vec2(aDim.x, aDim.y) * grow;
  float c = cos(aDim.z), s = sin(aDim.z);
  vec3 p = aBase + vec3(local.x * c + local.y * s, -t * uLen, -local.x * s + local.y * c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  int ci = int(max(ch, 0.0));
  float alt = ci == 0 ? uAltShare.x : ci == 1 ? uAltShare.y : ci == 2 ? uAltShare.z : uAltShare.w;
  vec3 base = ci == 0 ? uCol[0] : ci == 1 ? uCol[1] : ci == 2 ? uCol[2] : uCol[3];
  vec3 altc = ci == 0 ? uAlt[0] : ci == 1 ? uAlt[1] : ci == 2 ? uAlt[2] : uAlt[3];
  vColor = fract(aSeed.z * 13.7) < alt ? altc : base;
  vGlow = smoothstep(0.82, 1.0, t);
  vA = ch < 0.0 ? 0.0 : smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.93, 1.0, t));
  gl_PointSize = ch < 0.0 ? 0.0 : clamp(uScale * (1.0 + 1.6 * vGlow) / max(1.0, -mv.z), 1.5, 9.0);
}`;
const POINT_FS = `
varying vec3 vColor; varying float vA; varying float vGlow;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float f = smoothstep(0.5, mix(0.15, 0.0, vGlow), length(d));
  float a = vA * f * 0.9;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

function paletteUniforms() {
  const col = [], alt = [], share = [];
  PARTICLE_COLORS.forEach((p) => {
    col.push(new THREE.Color(p[0]));
    const other = p.find((x) => x !== p[0]);
    alt.push(new THREE.Color(other || p[0]));
    share.push(other ? p.filter((x) => x === other).length / p.length : 0);
  });
  return { col, alt, share: new THREE.Vector4(...share) };
}

export function createRoomEmission({ renderRooms, roomGroups, roomLightData, fallbackGroup, invalidate, isDisposed, reducedMotion, enabled = true }) {
  const rooms = {}; // rid → { group, mats, pointsMat, cur, from, to, t0 }
  const disposables = [];
  const pal = paletteUniforms();
  const beamGeo = beamGeometry();
  const stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2);
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  disposables.push(beamGeo, stripGeo, poolGeo);
  let on = enabled;

  const totalFixtures = Object.values(roomLightData).reduce(
    (n, fits) => n + fits.reduce((m, f) => m + f.placements.length, 0), 0);
  const perFixture = totalFixtures ? Math.min(MAX_PER_FIXTURE, Math.floor(MAX_SCENE / totalFixtures)) : 0;
  const stats = { rooms: {}, particles: 0 };

  renderRooms.forEach((rr) => {
    const rid = rr.__rid;
    const fits = roomLightData[rid] || [];
    const list = [];
    fits.forEach((fit) => fit.placements.forEach((p) => list.push({ fit, p })));
    if (!rid || !list.length) return;

    const group = new THREE.Group();
    group.userData.perfTag = "beams"; // lets the speed test switch the beams off
    group.userData.shadowMode = "none"; // additive light volumes: neither cast nor receive
    group.visible = on;
    const tgt = targetFor(levelsOf(rr));
    const uniforms = { uColor: { value: new THREE.Color(...tgt.color) }, uAlpha: { value: tgt.alpha } };
    const beamMat = new THREE.ShaderMaterial({ ...additive, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: { ...uniforms, uStrength: { value: 0.32 } } });
    const stripMat = new THREE.ShaderMaterial({ ...additive, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: { ...uniforms, uStrength: { value: 1.0 } } });
    // Shares uColor/uAlpha with the beam, so a spectrum change recolours the pool too.
    const poolMat = new THREE.ShaderMaterial({
      ...additive, vertexShader: POOL_VS, fragmentShader: POOL_FS,
      uniforms: { ...uniforms, uStrength: { value: POOL_STRENGTH } },
      // Never fight the deck it lies on.
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    disposables.push(beamMat, stripMat, poolMat);

    const ROWS = LED_ROWS.length;
    const beam = new THREE.InstancedMesh(beamGeo, beamMat, list.length * ROWS);
    const strip = new THREE.InstancedMesh(stripGeo, stripMat, list.length * ROWS);
    const pool = new THREE.InstancedMesh(poolGeo, poolMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const rowBenchIds = [];
    let reachSum = 0;
    list.forEach(({ fit, p }, i) => {
      const y = p.y ?? fit.topY ?? 0;
      const reach = beamReach(y, typeof fit.deckY === "number" ? fit.deckY : deckUnder(y));
      reachSum += reach;
      // Beams are sized on local X (across the fixture) and local Z (along its
      // length) — the convention the fitted fixture uses (lengthAxis: "z"), so
      // the placement's rotationY applies directly. One beam + emitter strip per
      // LED row, each the row's own footprint, so the light is four thin sheets
      // falling from the LED faces and nothing from the black edges.
      q.setFromAxisAngle(up, (p.rotationY || 0));
      const rot = p.rotationY || 0;
      LED_ROWS.forEach((f, r) => {
        const off = (f - 0.5) * fit.segLen; // along the fixture's local z
        const cx = p.x - Math.sin(rot) * off, cz = p.z + Math.cos(rot) * off;
        m.compose(new THREE.Vector3(cx, y + LED_FACE_LIFT_IN, cz), q, new THREE.Vector3(fit.benchW * LED_ROW_W, reach + LED_FACE_LIFT_IN, fit.segLen * LED_ROW_L));
        beam.setMatrixAt(i * ROWS + r, m);
        m.compose(new THREE.Vector3(cx, y + LED_FACE_LIFT_IN, cz), q, new THREE.Vector3(fit.benchW * LED_ROW_W, 1, fit.segLen * LED_ROW_L));
        strip.setMatrixAt(i * ROWS + r, m);
        rowBenchIds.push(fit.benchId);
      });
      // The pool lands on this fixture's OWN tier deck (fit.deckY, set by
      // Walkthrough3D), just above it.
      const deckY = typeof fit.deckY === "number" ? fit.deckY : deckUnder(y);
      m.compose(new THREE.Vector3(p.x, deckY + 0.6, p.z), q, new THREE.Vector3(fit.benchW * LED_ROW_W * POOL_SPREAD_W, 1, fit.segLen * POOL_SPREAD_L));
      pool.setMatrixAt(i, m);
    });
    beam.renderOrder = 5; strip.renderOrder = 6; pool.renderOrder = 4;
    // Column slide (columnSlide3d.js): instance i belongs to list[i]'s bench.
    const benchIds = list.map(({ fit }) => fit.benchId);
    beam.userData.instanceBenchIds = rowBenchIds;
    strip.userData.instanceBenchIds = rowBenchIds;
    pool.userData.instanceBenchIds = benchIds;
    group.add(pool, beam, strip);

    let pointsMat = null;
    let pts = null;
    let count = 0;
    if (!reducedMotion && perFixture > 0) {
      count = list.length * perFixture;
      const base = new Float32Array(count * 3), dim = new Float32Array(count * 3), seed = new Float32Array(count * 4);
      let k = 0;
      list.forEach(({ fit, p }) => {
        const y = p.y ?? fit.topY ?? 0;
        const rot = p.rotationY || 0;
        for (let j = 0; j < perFixture; j += 1, k += 1) {
          // Each photon falls from one of the four LED rows, within that row's footprint.
          const f = LED_ROWS[j % LED_ROWS.length];
          const off = (f - 0.5) * fit.segLen;
          base.set([p.x - Math.sin(rot) * off, y + LED_FACE_LIFT_IN, p.z + Math.cos(rot) * off], k * 3);
          dim.set([fit.benchW * LED_ROW_W, fit.segLen * LED_ROW_L, rot], k * 3);
          // w = evenly spread rank so thinning by channel share is even, not random.
          seed.set([Math.random(), Math.random(), Math.random(), (j + Math.random()) / perFixture], k * 4);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(base, 3));
      g.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
      g.setAttribute("aDim", new THREE.BufferAttribute(dim, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
      pointsMat = new THREE.ShaderMaterial({
        ...additive, vertexShader: POINT_VS, fragmentShader: POINT_FS,
        uniforms: {
          uTime: { value: 0 }, uLen: { value: list.length ? reachSum / list.length : BEAM_LEN_IN }, uScale: { value: 900 },
          uCum: { value: new THREE.Vector4(...tgt.cum) },
          uCol: { value: pal.col }, uAlt: { value: pal.alt }, uAltShare: { value: pal.share },
        },
      });
      pts = new THREE.Points(g, pointsMat);
      pts.frustumCulled = false;
      pts.renderOrder = 7;
      pts.visible = false; // photons only draw (and animate) while animating is on
      pts.userData.slideHide = true; // per-particle bases can't travel; the rebuild after a slide redraws them
      group.add(pts);
      disposables.push(g, pointsMat);
    }

    (roomGroups[rid] || fallbackGroup).add(group);
    rooms[rid] = { group, beamMat, pointsMat, pts, cur: tgt, from: tgt, to: tgt, t0: 0, key: JSON.stringify(levelsOf(rr)) };
    stats.rooms[rid] = { fixtures: list.length, drawCalls: { beam: 1, emitter: 1, pool: 1, points: pointsMat ? 1 : 0 }, particles: count };
    stats.particles += count;
  });

  const lerp = (a, b, k) => a + (b - a) * k;
  const mixT = (a, b, k) => ({
    color: a.color.map((v, i) => lerp(v, b.color[i], k)),
    alpha: lerp(a.alpha, b.alpha, k),
    cum: a.cum.map((v, i) => lerp(v, b.cum[i], k)),
  });
  const write = (r, s) => {
    r.beamMat.uniforms.uColor.value.setRGB(...s.color);
    r.beamMat.uniforms.uAlpha.value = s.alpha;
    if (r.pointsMat) r.pointsMat.uniforms.uCum.value.set(...s.cum);
  };

  let easing = false;
  const applyRoomSpectra = (d) => {
    Object.entries(rooms).forEach(([rid, r]) => {
      const rm = (d?.rooms || []).find((x) => x.id === rid);
      const lv = levelsOf(rm);
      const key = JSON.stringify(lv);
      if (key === r.key) return;
      r.key = key;
      r.from = r.cur; r.to = targetFor(lv); r.t0 = performance.now();
      if (reducedMotion) { r.cur = r.to; write(r, r.cur); } else easing = true;
    });
    invalidate();
  };

  // PERFORMANCE: the scene renders on demand (idle = zero GPU work). The beams and
  // emitter strips are static, so they cost nothing between frames. The photons are
  // the only thing that animates, so they run ONLY while animating is switched on
  // (the Spectrum panel is open, or the Photons toggle), and are capped at 30 fps.
  // Otherwise they are hidden and the loop sleeps.
  let animating = false;
  let lastFrame = 0;
  const FRAME_MS = 1000 / 30;
  const syncPoints = () => {
    Object.values(rooms).forEach((r) => { if (r.pts) r.pts.visible = on && animating && !reducedMotion; });
  };

  // Called from the render loop. Returns true when a frame must be drawn, "wait" when
  // the loop should keep ticking without drawing (30 fps cap), false when idle.
  const tick = (now) => {
    if (!on || isDisposed()) return false;
    let active = false;
    if (easing) {
      easing = false;
      Object.values(rooms).forEach((r) => {
        if (r.cur === r.to) return;
        const k = Math.min(1, (now - r.t0) / EASE_MS);
        r.cur = k >= 1 ? r.to : mixT(r.from, r.to, k);
        write(r, r.cur);
        if (k < 1) easing = true;
      });
      active = true;
    }
    if (!reducedMotion && animating) {
      const anyPhotons = Object.values(rooms).some((r) => r.pointsMat && r.cur.cum[3] > 0);
      if (anyPhotons) {
        if (now - lastFrame >= FRAME_MS - 1) {
          lastFrame = now;
          Object.values(rooms).forEach((r) => {
            if (r.pointsMat) r.pointsMat.uniforms.uTime.value = (now / 1000) * 0.9;
          });
          active = true;
        } else if (!active) {
          return "wait";
        }
      }
    }
    return active;
  };

  const setAnimating = (v) => {
    animating = !!v;
    syncPoints();
    invalidate();
  };

  const setEnabled = (v) => {
    on = !!v;
    Object.values(rooms).forEach((r) => { r.group.visible = on; });
    syncPoints();
    invalidate();
  };

  const dispose = () => {
    Object.values(rooms).forEach((r) => r.group.parent?.remove(r.group));
    disposables.forEach((x) => x.dispose());
  };

  return { applyRoomSpectra, tick, setEnabled, setAnimating, dispose, stats };
}