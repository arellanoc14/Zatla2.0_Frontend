import * as THREE from "three";

// ZATLA Runner: an endless run down a greenhouse aisle. Three lanes; jump over
// fans, roll under irrigation pipes, run up and over rolling bench carts, and
// pick up glowing leaves. The world moves toward +z; the runner stays at z = 0.
//
// mountRunner(host, { onState, onScore, mobile }) → { start, dispose }
//   onState("menu" | "playing" | "over", { score, leaves })
//   onScore({ score, leaves })   while playing, a few times a second

const LANE_W = 12;
const LANES = [-LANE_W, 0, LANE_W];
const SPEED_START = 70, SPEED_MAX = 130, ACCEL = 2.2; // units/s, units/s²
const GRAVITY = -260, JUMP_V = 105, DIVE_V = -200;
const LANE_TIME = 0.16, ROLL_TIME = 0.6;
const STAND_H = 14, ROLL_H = 6;
const CHUNK = 160, CHUNKS = 5;
const SPAWN_Z = -520, DESPAWN_Z = 60;

const FAN_H = 6;                 // jump over
const PIPE_Y = 9;                // roll under (the pipe's underside)
const CART_H = 16, CART_L = 50, RAMP_L = 34;

const C = {
  sky: 0x07120c, floor: 0x3a3f3c, line: 0x2fc272, bench: 0x5b6670, plant: 0x2e8b3e,
  light: 0xb8ffb0, fan: 0x2a3036, fanRing: 0x9be15d, pipe: 0xc7ccd1, cart: 0x2fc272,
  leaf: 0x9be15d, skin: 0xf2c39b, hoodie: 0x1f7a45, pants: 0x23282d, shoe: 0xf5f5f5, sprout: 0x6ee36a,
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

export function mountRunner(host, { onState, onScore, mobile = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = !mobile;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.sky);
  scene.fog = new THREE.Fog(C.sky, 220, 520);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 700);

  scene.add(new THREE.HemisphereLight(0xd8ffe0, 0x1a2a20, 1.1));
  const sun = new THREE.DirectionalLight(0xeaffea, 1.6);
  sun.position.set(-40, 120, 40);
  sun.castShadow = !mobile;
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 300 });
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  // Everything made here is collected so dispose() can free it.
  const owned = [];
  const keep = (x) => (owned.push(x), x);

  // ── The aisle: floor, lane lines, benches of plants, grow lights ────────
  const M = {
    floor: keep(mat(C.floor, { roughness: 0.95 })),
    line: keep(new THREE.MeshBasicMaterial({ color: C.line })),
    bench: keep(mat(C.bench, { metalness: 0.5, roughness: 0.4 })),
    plant: keep(mat(C.plant, { roughness: 0.9 })),
    light: keep(new THREE.MeshBasicMaterial({ color: C.light })),
    housing: keep(mat(0x1b1f22)),
  };
  const G = {
    floor: keep(new THREE.PlaneGeometry(90, CHUNK)),
    line: keep(new THREE.PlaneGeometry(0.6, CHUNK)),
    benchTop: keep(new THREE.BoxGeometry(14, 1.5, CHUNK - 4)),
    benchLeg: keep(new THREE.BoxGeometry(1, 8, 1)),
    plant: keep(new THREE.ConeGeometry(2.4, 6, 6)),
    lightBar: keep(new THREE.BoxGeometry(70, 0.8, 3)),
    lightHousing: keep(new THREE.BoxGeometry(72, 1.6, 4)),
  };

  function makeChunk() {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(G.floor, M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    for (const x of [-LANE_W * 1.5, -LANE_W / 2, LANE_W / 2, LANE_W * 1.5]) {
      const l = new THREE.Mesh(G.line, M.line);
      l.rotation.x = -Math.PI / 2; l.position.set(x, 0.05, 0);
      g.add(l);
    }
    for (const side of [-1, 1]) {
      const top = new THREE.Mesh(G.benchTop, M.bench);
      top.position.set(side * 34, 8, 0); top.receiveShadow = true;
      g.add(top);
      for (let z = -CHUNK / 2 + 6; z < CHUNK / 2; z += 24) {
        for (const dx of [-6, 6]) {
          const leg = new THREE.Mesh(G.benchLeg, M.bench);
          leg.position.set(side * 34 + dx, 4, z);
          g.add(leg);
        }
      }
      for (let z = -CHUNK / 2 + 4; z < CHUNK / 2; z += 8) {
        for (const dx of [-3.5, 3.5]) {
          const p = new THREE.Mesh(G.plant, M.plant);
          p.position.set(side * 34 + dx, 11.5 + Math.random(), z);
          p.scale.y = 0.8 + Math.random() * 0.5;
          p.castShadow = !mobile;
          g.add(p);
        }
      }
    }
    for (let z = -CHUNK / 2 + 20; z < CHUNK / 2; z += 40) {
      const h = new THREE.Mesh(G.lightHousing, M.housing);
      h.position.set(0, 44, z); g.add(h);
      const bar = new THREE.Mesh(G.lightBar, M.light);
      bar.position.set(0, 43, z); g.add(bar);
    }
    scene.add(g);
    return g;
  }
  const chunks = Array.from({ length: CHUNKS }, (_, i) => { const c = makeChunk(); c.position.z = -i * CHUNK + CHUNK / 2; return c; });

  // ── The runner: a sprout-headed grower in a green hoodie ────────────────
  const R = {
    skin: keep(mat(C.skin, { roughness: 0.6 })), hoodie: keep(mat(C.hoodie)), pants: keep(mat(C.pants)),
    shoe: keep(mat(C.shoe)), sprout: keep(mat(C.sprout, { emissive: 0x1d5c1a })),
    eye: keep(new THREE.MeshBasicMaterial({ color: 0x111111 })),
  };
  const limbGeo = keep(new THREE.CapsuleGeometry(0.75, 3.2, 4, 8));
  const runner = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 8; runner.add(body);
  const torso = new THREE.Mesh(keep(new THREE.CapsuleGeometry(2, 3, 6, 12)), R.hoodie);
  torso.position.y = 1.5; torso.castShadow = true; body.add(torso);
  const head = new THREE.Group(); head.position.y = 6; body.add(head);
  const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(2, 16, 12)), R.skin); skull.castShadow = true; head.add(skull);
  const leafGeo = keep(new THREE.SphereGeometry(1.2, 10, 6));
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeo, R.sprout);
    leaf.scale.set(1.4, 0.35, 0.7); leaf.position.set(s * 1.1, 2.8, 0); leaf.rotation.z = s * -0.6;
    head.add(leaf);
  }
  const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.25, 1.6, 6)), R.sprout); stem.position.y = 2.2; head.add(stem);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(keep(new THREE.CircleGeometry(0.25, 8)), R.eye);
    eye.position.set(s * 0.7, 0.2, -1.95); eye.rotation.y = Math.PI; head.add(eye);
  }
  const limb = (m, x, y) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(limbGeo, m); mesh.position.y = -2.2; mesh.castShadow = true; pivot.add(mesh);
    body.add(pivot);
    return pivot;
  };
  const armL = limb(R.hoodie, -2.8, 3.4), armR = limb(R.hoodie, 2.8, 3.4);
  const legL = limb(R.pants, -1.1, -0.6), legR = limb(R.pants, 1.1, -0.6);
  const shoeGeo = keep(new THREE.BoxGeometry(1.5, 1, 2.4));
  for (const leg of [legL, legR]) { const sh = new THREE.Mesh(shoeGeo, R.shoe); sh.position.set(0, -4.6, -0.4); leg.add(sh); }
  scene.add(runner);

  // ── Obstacles and leaves ────────────────────────────────────────────────
  const O = {
    fan: keep(mat(C.fan, { metalness: 0.4 })), ring: keep(new THREE.MeshBasicMaterial({ color: C.fanRing })),
    pipe: keep(mat(C.pipe, { metalness: 0.8, roughness: 0.3 })), cart: keep(mat(C.cart, { roughness: 0.5 })),
    cartTop: keep(mat(0x8a949c, { metalness: 0.6, roughness: 0.4 })),
    leaf: keep(new THREE.MeshStandardMaterial({ color: C.leaf, emissive: 0x4caf50, emissiveIntensity: 0.8 })),
  };
  const OG = {
    fan: keep(new THREE.BoxGeometry(10, FAN_H, 3)), ring: keep(new THREE.TorusGeometry(2.4, 0.35, 6, 20)),
    pipe: keep(new THREE.CylinderGeometry(0.9, 0.9, LANE_W, 10)), post: keep(new THREE.CylinderGeometry(0.5, 0.5, PIPE_Y + 1, 6)),
    cart: keep(new THREE.BoxGeometry(10, CART_H - 1, CART_L)), cartTop: keep(new THREE.BoxGeometry(11, 1, CART_L + 1)),
    ramp: keep(new THREE.BoxGeometry(10, 1, Math.hypot(CART_H, RAMP_L))),
    leaf: keep(new THREE.SphereGeometry(1.6, 10, 6)),
  };

  const things = []; // { mesh, kind, lane, z0, z1, ramp? }
  function add(kind, lane, z) {
    const g = new THREE.Group();
    let z0 = -2, z1 = 2, ramp = false;
    if (kind === "fan") {
      const box = new THREE.Mesh(OG.fan, O.fan); box.position.y = FAN_H / 2; box.castShadow = !mobile; g.add(box);
      for (const dx of [-2.6, 2.6]) { const r = new THREE.Mesh(OG.ring, O.ring); r.position.set(dx, FAN_H / 2, 1.55); g.add(r); }
    } else if (kind === "pipe") {
      const p = new THREE.Mesh(OG.pipe, O.pipe); p.rotation.z = Math.PI / 2; p.position.y = PIPE_Y + 0.9; g.add(p);
      for (const dx of [-LANE_W / 2, LANE_W / 2]) { const post = new THREE.Mesh(OG.post, O.pipe); post.position.set(dx, (PIPE_Y + 1) / 2, 0); g.add(post); }
    } else if (kind === "cart" || kind === "cartRamp") {
      const c = new THREE.Mesh(OG.cart, O.cart); c.position.y = (CART_H - 1) / 2; c.castShadow = !mobile; g.add(c);
      const t = new THREE.Mesh(OG.cartTop, O.cartTop); t.position.y = CART_H - 0.5; g.add(t);
      z0 = -CART_L / 2; z1 = CART_L / 2;
      if (kind === "cartRamp") {
        ramp = true;
        const r = new THREE.Mesh(OG.ramp, O.cartTop);
        r.position.set(0, CART_H / 2, CART_L / 2 + RAMP_L / 2);
        r.rotation.x = Math.atan2(CART_H, RAMP_L);
        g.add(r);
        z1 += RAMP_L;
      }
    } else if (kind === "leaf") {
      const l = new THREE.Mesh(OG.leaf, O.leaf); l.scale.set(1, 0.3, 1.6); g.add(l);
    }
    g.position.set(LANES[lane], 0, z);
    scene.add(g);
    things.push({ mesh: g, kind, lane, z0, z1, ramp, y: 0 });
    return things[things.length - 1];
  }
  const leaf = (lane, y, z) => { const t = add("leaf", lane, z); t.y = y; t.mesh.position.y = y + 4; };

  let nextZ = -200;
  function pattern() {
    const z = nextZ;
    nextZ -= 110 + Math.random() * 90;
    const a = (Math.random() * 3) | 0, b = (a + 1 + ((Math.random() * 2) | 0)) % 3, free = 3 - a - b;
    const r = Math.random();
    if (r < 0.3) {
      add("cartRamp", a, z);
      for (let i = 0; i < 5; i++) leaf(a, CART_H, z + 15 - i * 9);
      add("cart", b, z - 20);
      for (let i = 0; i < 4; i++) leaf(free, 0, z + 20 - i * 10);
    } else if (r < 0.6) {
      add("fan", a, z); add("pipe", b, z - 50); add("fan", free, z - 100);
      for (let i = 0; i < 5; i++) leaf(a, Math.sin((i / 4) * Math.PI) * 12, z + 16 - i * 8);
    } else if (r < 0.85) {
      add("cart", a, z); add("cart", b, z);
      for (let i = 0; i < 6; i++) leaf(free, 0, z + 25 - i * 10);
    } else {
      for (let i = 0; i < 8; i++) leaf(a, 0, z + 20 - i * 9);
      add("pipe", b, z - 30);
    }
  }
  function clearThings() { things.forEach((t) => scene.remove(t.mesh)); things.length = 0; }

  // ── State ───────────────────────────────────────────────────────────────
  let state = "menu", score = 0, leaves = 0, speed = SPEED_START, lastReport = 0;
  const P = { lane: 1, x: 0, fromX: 0, laneT: LANE_TIME, y: 0, vy: 0, ground: 0, rolling: false, rollT: 0, anim: 0 };

  function start() {
    clearThings();
    nextZ = -160;
    while (nextZ > SPAWN_Z) pattern();
    Object.assign(P, { lane: 1, x: 0, fromX: 0, laneT: LANE_TIME, y: 0, vy: 0, ground: 0, rolling: false, rollT: 0 });
    runner.rotation.set(0, 0, 0);
    score = 0; leaves = 0; speed = SPEED_START;
    state = "playing";
    onState?.("playing", { score: 0, leaves: 0 });
  }
  function over() {
    state = "over";
    runner.rotation.x = -Math.PI / 2.4;
    onState?.("over", { score: Math.floor(score), leaves });
  }

  const move = (d) => {
    const lane = Math.max(0, Math.min(2, P.lane + d));
    if (lane === P.lane) return;
    P.lane = lane; P.fromX = P.x; P.laneT = 0;
  };
  const onGround = () => P.y <= P.ground + 0.5;
  const jump = () => { if (onGround() || P.rolling) { P.rolling = false; P.vy = JUMP_V; } };
  const roll = () => { P.rolling = true; P.rollT = 0; if (!onGround()) P.vy = DIVE_V; };

  const onKey = (e) => {
    if (state !== "playing") {
      if ((e.code === "Space" || e.code === "Enter") && state !== "playing") { e.preventDefault(); start(); }
      return;
    }
    const k = e.code;
    if (k === "ArrowLeft" || k === "KeyA") move(-1);
    else if (k === "ArrowRight" || k === "KeyD") move(1);
    else if (k === "ArrowUp" || k === "KeyW" || k === "Space") jump();
    else if (k === "ArrowDown" || k === "KeyS") roll();
    else return;
    e.preventDefault();
  };
  let tx = 0, ty = 0, tt = 0;
  const onTouchStart = (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = performance.now(); };
  const onTouchEnd = (e) => {
    if (state !== "playing" || performance.now() - tt > 450) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy < 0) jump(); else roll();
  };
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });

  // ── Loop ────────────────────────────────────────────────────────────────
  function step(dt) {
    speed = Math.min(SPEED_MAX, speed + ACCEL * dt);
    const dz = speed * dt;
    score += dz * 0.2;
    for (const c of chunks) { c.position.z += dz; if (c.position.z > CHUNK * 1.5) c.position.z -= CHUNK * CHUNKS; }

    P.laneT = Math.min(LANE_TIME, P.laneT + dt);
    const t = P.laneT / LANE_TIME;
    P.x = P.fromX + (LANES[P.lane] - P.fromX) * t * (2 - t);
    if (P.rolling && (P.rollT += dt) > ROLL_TIME) P.rolling = false;
    const h = P.rolling ? ROLL_H : STAND_H;

    let ground = 0, dead = false;
    for (let i = things.length - 1; i >= 0; i--) {
      const o = things[i];
      o.mesh.position.z += dz;
      const z = o.mesh.position.z;
      if (z > DESPAWN_Z) { scene.remove(o.mesh); things.splice(i, 1); continue; }
      if (o.kind === "leaf") o.mesh.rotation.y += dt * 3;
      if (Math.abs(P.x - LANES[o.lane]) > LANE_W * 0.45) continue;
      const lz = -z; // runner's z relative to the obstacle
      if (lz < o.z0 - 1.5 || lz > o.z1 + 1.5) continue;
      if (o.kind === "leaf") {
        if (P.y < o.y + 8 && P.y + h > o.y) { leaves++; score += 10; scene.remove(o.mesh); things.splice(i, 1); }
      } else if (o.kind === "fan") {
        if (P.y < FAN_H - 0.5) dead = true;
      } else if (o.kind === "pipe") {
        if (P.y + h > PIPE_Y && P.y < PIPE_Y + 2) dead = true;
      } else {
        // A cart: its top is ground; with a ramp the ground rises along it.
        let top = CART_H;
        if (o.ramp && lz > CART_L / 2) top = CART_H * (1 - (lz - CART_L / 2) / RAMP_L);
        if (P.y >= top - 4 || (P.vy < 0 && P.y >= top - 8)) ground = Math.max(ground, top);
        else dead = true;
      }
    }
    if (dead) return over();
    P.ground = ground;
    if (P.y > P.ground + 0.01 || P.vy > 0) {
      P.vy += GRAVITY * dt; P.y += P.vy * dt;
      if (P.y <= P.ground) { P.y = P.ground; P.vy = 0; }
    } else { P.y = P.ground; P.vy = 0; }

    // Pose: run, air, or roll.
    P.anim += speed * dt * 0.09;
    const s = Math.sin(P.anim);
    runner.position.set(P.x, P.y, 0);
    runner.rotation.z = (P.x - LANES[P.lane]) * 0.03;
    if (P.rolling) {
      body.position.y = 4; body.rotation.x = -P.rollT * 14;
      armL.rotation.x = armR.rotation.x = -2.4; legL.rotation.x = legR.rotation.x = 1.6;
    } else if (P.y > P.ground + 1) {
      body.position.y = 8; body.rotation.x = 0.15;
      armL.rotation.x = 2.6; armR.rotation.x = 2.2; legL.rotation.x = -0.9; legR.rotation.x = 0.4;
    } else {
      body.position.y = 8 + Math.abs(Math.cos(P.anim)) * 0.8; body.rotation.x = 0.12;
      armL.rotation.x = s * 1.6; armR.rotation.x = -s * 1.6;
      legL.rotation.x = -s * 1.3; legR.rotation.x = s * 1.3;
    }

    // Keep patterns queued out to SPAWN_Z; the queue moves with the world.
    nextZ += dz;
    while (nextZ > SPAWN_Z) pattern();

    const now = performance.now();
    if (now - lastReport > 120) { lastReport = now; onScore?.({ score: Math.floor(score), leaves }); }
  }

  const camAt = new THREE.Vector3();
  let raf = 0, last = 0, t0 = performance.now();
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = t; return; }
    const dt = Math.min((t - (last || t)) / 1000, 0.05);
    last = t;
    if (state === "playing") step(dt);
    if (state === "menu") {
      const a = (t - t0) / 3000;
      camera.position.set(Math.sin(a) * 40, 22, 50 + Math.cos(a) * 10);
      camera.lookAt(0, 8, 0);
      runner.rotation.y = a;
    } else {
      runner.rotation.y = 0;
      camera.position.x += (P.x * 0.55 - camera.position.x) * Math.min(1, dt * 8);
      camera.position.y += (30 + P.y * 0.3 - camera.position.y) * Math.min(1, dt * 6);
      camera.position.z = 52;
      camAt.set(P.x * 0.15, 6 + P.y * 0.1, -40);
      camera.lookAt(camAt);
    }
    renderer.render(scene, camera);
  }

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  onState?.("menu", { score: 0, leaves: 0 });
  raf = requestAnimationFrame(frame);

  return {
    start,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      clearThings();
      owned.forEach((x) => x.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
