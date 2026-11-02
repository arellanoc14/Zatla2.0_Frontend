// Rectilinear (axis-aligned) polygon geometry for merged / odd-shaped rooms.
// All coordinates are plain {x, y} objects in inches. Pure functions — no THREE,
// no canvas — so both the 2D plan, the 3D wall builder, and the layout engine
// can share the exact same shape math.

const EPS = 0.5;

// A rect {x,y,w,h} as a 4-point clockwise polygon.
export function rectToPolygon(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

export function polygonBBox(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  poly.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Shoelace area (always positive).
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// Is pt on the axis-aligned segment a→b (within EPS)?
function onSegment(pt, a, b) {
  if (Math.abs(a.x - b.x) < EPS) {
    return Math.abs(pt.x - a.x) < EPS &&
      pt.y >= Math.min(a.y, b.y) - EPS && pt.y <= Math.max(a.y, b.y) + EPS;
  }
  if (Math.abs(a.y - b.y) < EPS) {
    return Math.abs(pt.y - a.y) < EPS &&
      pt.x >= Math.min(a.x, b.x) - EPS && pt.x <= Math.max(a.x, b.x) + EPS;
  }
  return false;
}

// Ray-cast point-in-polygon. `inclusive` counts boundary points as inside —
// needed for bench clipping so a bench flush against a wall isn't dropped.
export function pointInPolygon(pt, poly, inclusive = true) {
  if (inclusive) {
    for (let i = 0; i < poly.length; i++) {
      if (onSegment(pt, poly[i], poly[(i + 1) % poly.length])) return true;
    }
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Union of two rectilinear shapes (each a polygon; rects via rectToPolygon).
// Returns the single outline polygon of the merged footprint — the shared wall
// segment between the shapes is NOT part of the outline, which is exactly the
// "no wall where the X is" behavior. Returns null when the shapes don't touch,
// touch only at a corner, or would leave a hole — i.e. not mergeable.
//
// Implementation: a tiny coordinate grid over all vertex x/y values; a cell is
// covered when its center lies inside either shape. Boundary edges between
// covered and uncovered space are chained into one loop. Robust for any
// rect/L/T/plus combination, including merging into an already-merged room.
export function unionOutline(polyA, polyB) {
  const uniq = (arr) => [...new Set(arr.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  const pts = [...polyA, ...polyB];
  const xs = uniq(pts.map((p) => p.x));
  const ys = uniq(pts.map((p) => p.y));
  const nx = xs.length - 1, ny = ys.length - 1;
  if (nx < 1 || ny < 1) return null;

  // Coverage grid.
  const covered = [];
  for (let j = 0; j < ny; j++) {
    covered.push([]);
    for (let i = 0; i < nx; i++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
      covered[j].push(pointInPolygon(c, polyA, false) || pointInPolygon(c, polyB, false));
    }
  }

  // The union must be ONE connected region (4-neighborhood flood fill) —
  // otherwise the rooms don't actually share a wall.
  let first = null, total = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (covered[j][i]) { total++; if (!first) first = [j, i]; }
  }
  if (!first) return null;
  const seen = new Set([first.join(",")]);
  const stack = [first];
  while (stack.length) {
    const [j, i] = stack.pop();
    [[j - 1, i], [j + 1, i], [j, i - 1], [j, i + 1]].forEach(([jj, ii]) => {
      if (jj < 0 || ii < 0 || jj >= ny || ii >= nx || !covered[jj][ii]) return;
      const k = `${jj},${ii}`;
      if (!seen.has(k)) { seen.add(k); stack.push([jj, ii]); }
    });
  }
  if (seen.size !== total) return null;

  // Boundary segments between covered and uncovered space.
  const segs = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      const above = j > 0 && covered[j - 1][i];
      const below = j < ny && covered[j][i];
      if (above !== below) segs.push({ a: { x: xs[i], y: ys[j] }, b: { x: xs[i + 1], y: ys[j] } });
    }
  }
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const left = i > 0 && covered[j][i - 1];
      const right = i < nx && covered[j][i];
      if (left !== right) segs.push({ a: { x: xs[i], y: ys[j] }, b: { x: xs[i], y: ys[j + 1] } });
    }
  }
  if (segs.length === 0) return null;

  // Chain into ONE loop. Every vertex must have exactly 2 incident segments —
  // degree-4 vertices mean a corner-only touch, leftover segments mean a hole.
  const key = (p) => `${p.x},${p.y}`;
  const byPoint = new Map();
  segs.forEach((s, idx) => {
    [key(s.a), key(s.b)].forEach((k) => {
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(idx);
    });
  });
  for (const list of byPoint.values()) if (list.length !== 2) return null;

  const used = new Array(segs.length).fill(false);
  const loop = [segs[0].a, segs[0].b];
  used[0] = true;
  let count = 1;
  for (;;) {
    const cur = loop[loop.length - 1];
    const k = key(cur);
    const nextIdx = (byPoint.get(k) || []).find((idx) => !used[idx]);
    if (nextIdx == null) break;
    used[nextIdx] = true;
    count++;
    const s = segs[nextIdx];
    const nxt = key(s.a) === k ? s.b : s.a;
    if (key(nxt) === key(loop[0])) break;
    loop.push(nxt);
  }
  if (count !== segs.length) return null;

  // Drop collinear midpoints so each wall reads as one clean edge.
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const cur = loop[i];
    const next = loop[(i + 1) % loop.length];
    const collinear =
      (Math.abs(prev.x - cur.x) < EPS && Math.abs(cur.x - next.x) < EPS) ||
      (Math.abs(prev.y - cur.y) < EPS && Math.abs(cur.y - next.y) < EPS);
    if (!collinear) out.push(cur);
  }
  return out.length >= 4 ? out : null;
}

// Scale a room-local outline as the room's bounding box is resized, so an
// L/T-shaped (merged or drawn) room keeps its shape while it grows/shrinks
// instead of snapping back to a plain rectangle.
export function scalePolygon(poly, oldW, oldL, newW, newL) {
  if (!Array.isArray(poly) || poly.length < 3) return null;
  const sx = (newW || 0) / (oldW || 1);
  const sy = (newL || 0) / (oldL || 1);
  return poly.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

// Is an axis-aligned rect fully inside the polygon? Sampled on a 5×5 grid of
// the (slightly inset) rect so a bench crossing a notch/cutout is rejected.
export function rectInsidePolygon(rect, poly) {
  const inset = 0.25;
  const x0 = rect.x + inset, y0 = rect.y + inset;
  const x1 = rect.x + rect.w - inset, y1 = rect.y + rect.h - inset;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / 4, y: y0 + ((y1 - y0) * j) / 4 };
      if (!pointInPolygon(p, poly)) return false;
    }
  }
  return true;
}

// Nearest rectilinear polygon wall to a room-local point. Returns
// { side, coord, lo, hi, dist } where `side` behaves like a plain room wall
// (top/bottom/left/right, judged by which way the interior lies) and `coord` is
// that wall line's constant room-local coordinate.
export function nearestPolygonWall(poly, cx, cy) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const horizontal = Math.abs(a.y - b.y) < EPS;
    const vertical = Math.abs(a.x - b.x) < EPS;
    if (!horizontal && !vertical) continue;
    const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
    const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const along = horizontal ? cx : cy;
    const fixed = horizontal ? a.y : a.x;
    const perp = Math.abs((horizontal ? cy : cx) - fixed);
    const outside = along < lo ? lo - along : along > hi ? along - hi : 0;
    const dist = Math.hypot(perp, outside);
    if (best && dist >= best.dist) continue;
    const mid = (lo + hi) / 2;
    const side = horizontal
      ? (pointInPolygon({ x: mid, y: fixed + 2 }, poly, false) ? "top" : "bottom")
      : (pointInPolygon({ x: fixed + 2, y: mid }, poly, false) ? "left" : "right");
    best = { side, coord: fixed, lo, hi, dist };
  }
  return best;
}

// Nudge a rect fully inside the polygon (short outward grid search). Returns the
// nearest position where the rect fits, or the original when none is found.
export function fitRectInPolygon(rect, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return { x: rect.x, y: rect.y };
  if (rectInsidePolygon(rect, poly)) return { x: rect.x, y: rect.y };
  const STEP = 6, RINGS = 16;
  for (let ring = 1; ring <= RINGS; ring++) {
    let best = null;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cand = { ...rect, x: rect.x + dx * STEP, y: rect.y + dy * STEP };
        if (!rectInsidePolygon(cand, poly)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { x: cand.x, y: cand.y, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  // Ring search exhausted (object dropped far outside the outline): scan the whole
  // shape on a coarse grid and take the nearest position that fits, so an object is
  // NEVER left sitting outside the room.
  const bb = polygonBBox(poly);
  let fallback = null;
  const N = 24;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const cand = {
        ...rect,
        x: bb.x + ((bb.w - rect.w) * i) / N,
        y: bb.y + ((bb.h - rect.h) * j) / N,
      };
      if (!rectInsidePolygon(cand, poly)) continue;
      const d = Math.hypot(cand.x - rect.x, cand.y - rect.y);
      if (!fallback || d < fallback.d) fallback = { x: cand.x, y: cand.y, d };
    }
  }
  return fallback ? { x: fallback.x, y: fallback.y } : { x: rect.x, y: rect.y };
}

// Shape-aware bench fill: keep only benches whose footprint sits fully inside
// the room's polygon outline (room-local coordinates). Benches falling in a
// notch/cutout of an L/T shape are dropped; everything else is untouched.
export function clipBenchesToPolygon(benches, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return benches || [];
  return (benches || []).filter((b) =>
    rectInsidePolygon(
      { x: b.pos?.x || 0, y: b.pos?.y || 0, w: b.widthIn || 0, h: b.lengthIn || 0 },
      polygon
    )
  );
}