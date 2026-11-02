import * as THREE from "three";

// Rendering speed test for the 3D view — runs in the visitor's own browser, on their
// own GPU, so it measures the machine that is actually lagging.
//
// HOW IT WORKS
//  - It draws the real scene directly (renderer.render) and waits for the GPU to
//    finish each frame (a 1-pixel readback), so the time per frame is real
//    CPU + GPU time, not what the display happens to show.
//  - CONTRASTS: it draws the full scene, then again with each feature switched off
//    in turn (plants, grow lights, light beams, benches), and finally with all of
//    them off (walls, floor and labels only). The drop in time is that feature's
//    cost. It also draws once at pixel ratio 1 to show how much resolution costs.
//  - GOALS are fixed numbers (below) and each result is marked pass / fail.
//  - CONDITIONS: the layout currently open, this screen, this GPU; all recorded.
//
// Scene objects opt in to being switched off with userData.perfTag.

export const GOALS = {
  desktop: { frameMs: 16.7, drawCalls: 300, triangles: 1_500_000, idleRedraws: 0, maxShare: 0.4 },
  mobile: { frameMs: 33.3, drawCalls: 150, triangles: 400_000, idleRedraws: 0, maxShare: 0.4 },
};

const FEATURES = [
  ["plants", "Plants"],
  ["lights", "Grow lights"],
  ["beams", "Light beams"],
  ["benches", "Benches"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setTimeout(r, 0));

function gpuName(gl) {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch {
    return "unknown";
  }
}

export async function runSpeedTest({ renderer, scene, camera, mobile = false, getDrawn = () => 0, getLongTasks = null, onProgress = () => {} }) {
  const goals = mobile ? GOALS.mobile : GOALS.desktop;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const drawSync = () => { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };

  const tags = {};
  scene.traverse((o) => { const t = o.userData && o.userData.perfTag; if (t) (tags[t] = tags[t] || []).push(o); });
  const setHidden = (names, hidden) => names.forEach((n) => (tags[n] || []).forEach((o) => { o.visible = !hidden; }));
  const allTags = FEATURES.map(([id]) => id);

  // Time the scene in its current state: warm up, size the sample to ~0.5 s, average.
  const measure = async () => {
    drawSync(); drawSync();
    const t0 = performance.now(); drawSync(); const one = Math.max(0.2, performance.now() - t0);
    const n = Math.max(3, Math.min(30, Math.floor(500 / one)));
    const s = performance.now();
    for (let i = 0; i < n; i += 1) drawSync();
    const ms = (performance.now() - s) / n;
    const info = renderer.info.render;
    return { ms: +ms.toFixed(2), calls: info.calls, tris: info.triangles, frames: n };
  };

  const steps = 1 + FEATURES.length + 1 + 1 + 1;
  let done = 0;
  const step = async (label) => { onProgress({ label, done, total: steps }); await tick(); done += 1; };

  const rows = [];
  const visibleBefore = new Map();
  Object.values(tags).flat().forEach((o) => visibleBefore.set(o, o.visible));
  const pr0 = renderer.getPixelRatio();
  const size0 = renderer.getSize(new THREE.Vector2());

  try {
    await step("Full scene");
    const full = await measure();
    rows.push({ id: "full", label: "Full scene", ...full });

    for (const [id, label] of FEATURES) {
      await step(`Without ${label.toLowerCase()}`);
      if (!tags[id]) { rows.push({ id: `without_${id}`, label: `Without ${label.toLowerCase()}`, ms: full.ms, calls: full.calls, tris: full.tris, absent: true }); continue; }
      setHidden([id], true);
      const r = await measure();
      setHidden([id], false);
      rows.push({ id: `without_${id}`, label: `Without ${label.toLowerCase()}`, ...r });
    }

    await step("Walls, floor and labels only");
    setHidden(allTags, true);
    const base = await measure();
    setHidden(allTags, false);
    rows.push({ id: "baseline", label: "Walls, floor and labels only", ...base });

    await step("Resolution contrast (pixel ratio 1)");
    let lowRes = null;
    if (pr0 > 1) {
      renderer.setPixelRatio(1); renderer.setSize(size0.x, size0.y);
      lowRes = await measure();
      renderer.setPixelRatio(pr0); renderer.setSize(size0.x, size0.y);
      rows.push({ id: "pixel_ratio_1", label: `At pixel ratio 1 (screen is ${pr0})`, ...lowRes });
    }

    await step("Idle redraws (2 s, nothing touched)");
    const d0 = getDrawn();
    await sleep(2000);
    const idleRedraws = getDrawn() - d0;

    // ── Verdicts ──────────────────────────────────────────────────────────
    const shares = FEATURES.map(([id, label]) => {
      const r = rows.find((x) => x.id === `without_${id}`);
      const share = r && !r.absent ? Math.max(0, (full.ms - r.ms) / full.ms) : 0;
      return { id, label, share: +share.toFixed(3), savedMs: r && !r.absent ? +Math.max(0, full.ms - r.ms).toFixed(2) : 0, absent: !!(r && r.absent) };
    });
    const otherShare = +(Math.min(1, base.ms / full.ms)).toFixed(3);
    const worst = [...shares].sort((a, b) => b.share - a.share)[0];
    const checks = [
      { id: "frame", label: `Frame time ≤ ${goals.frameMs} ms`, value: `${full.ms} ms (${Math.round(1000 / full.ms)} fps max)`, pass: full.ms <= goals.frameMs },
      { id: "calls", label: `Draw calls ≤ ${goals.drawCalls}`, value: String(full.calls), pass: full.calls <= goals.drawCalls },
      { id: "tris", label: `Triangles ≤ ${(goals.triangles / 1e6).toFixed(1)}M`, value: full.tris.toLocaleString("en-US"), pass: full.tris <= goals.triangles },
      { id: "idle", label: "Idle redraws = 0 in 2 s", value: String(idleRedraws), pass: idleRedraws <= goals.idleRedraws },
      { id: "share", label: `No single feature > ${Math.round(goals.maxShare * 100)}% of frame time`, value: worst.share > 0 ? `${worst.label} ${Math.round(worst.share * 100)}%` : "none", pass: worst.share <= goals.maxShare },
    ];
    const lt = getLongTasks ? getLongTasks() : null;
    if (lt) checks.push({ id: "longtasks", label: "Page stalls (>50 ms) since the 3D view opened ≤ 25", value: `${lt.count} (${Math.round(lt.totalMs)} ms)`, pass: lt.count <= 25 });

    let diagnosis;
    const failing = checks.filter((c) => !c.pass).map((c) => c.id);
    if (failing.length === 0) {
      diagnosis = "The 3D view meets every goal on this machine. If it still feels laggy, the cost is outside the 3D canvas (the page, the 2D editor or the browser), not the renderer.";
    } else if (failing.includes("idle")) {
      diagnosis = "Something is forcing continuous redraws while nothing is happening. That alone makes the view lag; find what keeps waking the render loop.";
    } else if (failing.includes("share")) {
      diagnosis = `${worst.label} is the main cost (${Math.round(worst.share * 100)}% of every frame). Reduce that first.`;
    } else if (failing.includes("calls")) {
      diagnosis = "Too many draw calls: the CPU is the bottleneck. Merge or instance repeated objects.";
    } else if (failing.includes("tris")) {
      diagnosis = "Too many triangles for this GPU. Use lighter models for repeated objects.";
    } else if (failing.includes("frame") && lowRes && lowRes.ms < full.ms * 0.6) {
      diagnosis = "The cost scales with resolution, so the GPU's fill rate is the limit. Lower the pixel ratio or turn off antialiasing.";
    } else if (failing.includes("frame")) {
      diagnosis = "Frames are slow without any one clear culprit; the whole scene is heavy for this GPU.";
    } else {
      diagnosis = "The page stalls (long JavaScript tasks) outside the renderer. The lag is in the page code, not the 3D drawing.";
    }

    const report = {
      when: new Date().toISOString(),
      conditions: {
        gpu: gpuName(gl),
        pixelRatio: pr0,
        canvas: `${size0.x}x${size0.y}`,
        device: mobile ? "phone/tablet" : "desktop",
        plantsTagged: (tags.plants || []).length, lightsTagged: (tags.lights || []).length, benchesTagged: (tags.benches || []).length,
      },
      goals, rows, shares, otherShare, idleRedraws, checks, diagnosis, longTasks: lt,
    };
    report.text = toText(report);
    return report;
  } finally {
    visibleBefore.forEach((v, o) => { o.visible = v; });
    if (renderer.getPixelRatio() !== pr0) { renderer.setPixelRatio(pr0); renderer.setSize(size0.x, size0.y); }
  }
}

export function toText(r) {
  const L = [];
  L.push(`ZATLA 3D speed test  ${r.when}`);
  L.push(`GPU: ${r.conditions.gpu}`);
  L.push(`Device: ${r.conditions.device}   pixel ratio ${r.conditions.pixelRatio}   canvas ${r.conditions.canvas}`);
  L.push("");
  L.push("Frame time by condition (ms per frame, real GPU wait):");
  r.rows.forEach((x) => L.push(`  ${x.label.padEnd(38)} ${String(x.ms).padStart(8)} ms   ${String(x.calls).padStart(6)} calls   ${x.tris.toLocaleString("en-US").padStart(11)} tris${x.absent ? "   (not in scene)" : ""}`));
  L.push("");
  L.push("Share of frame time:");
  r.shares.forEach((s) => L.push(`  ${s.label.padEnd(14)} ${s.absent ? "not in scene" : `${Math.round(s.share * 100)}%  (${s.savedMs} ms)`}`));
  L.push(`  ${"Everything else".padEnd(14)} ${Math.round(r.otherShare * 100)}%`);
  L.push("");
  L.push("Goals:");
  r.checks.forEach((c) => L.push(`  ${c.pass ? "PASS" : "FAIL"}  ${c.label.padEnd(46)} ${c.value}`));
  L.push("");
  L.push(`Diagnosis: ${r.diagnosis}`);
  return L.join("\n");
}
