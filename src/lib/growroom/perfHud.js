// Optional on-screen performance readout for the 3D view, to MEASURE lag instead of
// guessing at it. Off by default. Turn it on with ?perf in the URL (or
// localStorage.setItem("zatla_perf", "1")), e.g. https://your-app/?perf
//
// The 3D view renders on demand, so a healthy idle scene shows "idle" (0 redraws).
// If it shows a steady fps while you are not touching anything, something is
// forcing continuous redraws; the draw-call and triangle counts show what each
// redraw costs.
export function perfHudEnabled() {
  try {
    const stored = window.localStorage.getItem("zatla_perf");
    if (stored === "0") return false; // switched off with the Stats button
    return stored === "1" || /[?&]perf(=|&|$)/.test(window.location.search);
  } catch {
    return false;
  }
}

// Long tasks (the page's JavaScript blocking for >50 ms) since the 3D view opened.
// A laggy page with a healthy renderer shows up here, not in the draw calls.
const longTasks = { count: 0, totalMs: 0, started: false };
export function startLongTaskWatch() {
  if (longTasks.started || typeof PerformanceObserver === "undefined") return;
  try {
    const po = new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => { longTasks.count += 1; longTasks.totalMs += e.duration; });
    });
    po.observe({ entryTypes: ["longtask"] });
    longTasks.started = true;
  } catch {
    /* longtask timing not supported in this browser */
  }
}
export function getLongTasks() {
  return longTasks.started ? { count: longTasks.count, totalMs: longTasks.totalMs } : null;
}

// Remember the on/off choice so the readout survives reloads.
export function setPerfHudEnabled(on) {
  try {
    window.localStorage.setItem("zatla_perf", on ? "1" : "0");
  } catch {
    /* storage blocked: the readout just won't persist */
  }
}

export function createPerfHud() {
  if (typeof document === "undefined" || !perfHudEnabled()) return null;
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed", "left:8px", "bottom:8px", "z-index:2147483000", "pointer-events:none",
    "font:11px/1.4 ui-monospace,Menlo,monospace", "color:#d1fae5", "background:rgba(0,0,0,.7)",
    "padding:6px 9px", "border-radius:6px", "white-space:pre",
  ].join(";");
  el.textContent = "3D perf: waiting for a frame…";
  document.body.appendChild(el);

  let frames = 0;
  let winStart = performance.now();
  let lastFrameAt = 0;
  let lastText = "";
  let lastInfo = null;
  let extraFn = null;

  const paint = (fps) => {
    const i = lastInfo;
    const extra = extraFn ? extraFn() : "";
    const head = fps === null ? "3D  idle (no redraws: render-on-demand)" : `3D  ${fps.toFixed(0)} redraws/s`;
    const body = i
      ? `\ndraw calls ${i.calls}   triangles ${i.triangles.toLocaleString("en-US")}\ngeometries ${i.geometries}   textures ${i.textures}`
      : "";
    const text = head + body + (extra ? `\n${extra}` : "");
    if (text !== lastText) { el.textContent = text; lastText = text; }
  };

  const timer = setInterval(() => {
    const now = performance.now();
    if (now - lastFrameAt > 700) { paint(null); frames = 0; winStart = now; }
  }, 500);

  return {
    // Call right after each renderer.render(). `extra` is an optional () => string.
    frame(renderer, extra) {
      const now = performance.now();
      lastFrameAt = now;
      frames += 1;
      extraFn = extra || null;
      const r = renderer.info;
      lastInfo = { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
      if (now - winStart >= 500) {
        paint((frames * 1000) / (now - winStart));
        frames = 0;
        winStart = now;
      }
    },
    dispose() {
      clearInterval(timer);
      el.remove();
    },
  };
}
