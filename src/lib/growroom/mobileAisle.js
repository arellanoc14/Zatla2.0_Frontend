// Mobile aisle — the ONE movable main aisle in a bench room, and what tapping a
// bench column in 3D does to it. Pure functions, inches, no THREE. (Ported from
// GrowStudios' mobileAisle.js; ZATLA has one wall clearance, settings.wallIn,
// and no "between rows" walkway, so the gap normals are simpler.)
//
// A room's benches stand in COLUMNS side by side across the room (along X for
// rows that run front to back, along Y for rows laid side to side, where every
// bench is rotated 90°). Between the columns, and between the outer columns and
// the walls, are GAPS: gap 0 is against the first wall, gap n against the last,
// gap k sits between column k-1 and column k. Every gap has a NORMAL width — the
// wall clearance for the two wall gaps, 0 between columns — and the aisle is the
// gap with the most EXCESS over its normal. That excess E is the space that
// moves.
//
// Tapping column c slides it TOWARD the aisle, together with every column
// between it and the aisle, by E: the old aisle closes back to its normal width
// and the aisle reopens on the far side of the tapped column. Tapping the
// wall-side column therefore slides the whole bank and opens the aisle against
// that wall.
//
// The aisle position is remembered as settings.aisleAt (the gap index) and
// autoLayoutByRoom honours it, so a slide is committed as an ordinary re-layout
// (2D, 3D and every later re-layout agree), and the 3D animation only has to
// show the columns travelling to where that layout puts them.
import { benchRect } from "./clearances";

// Two benches whose cross-axis spans overlap by more than this share a column.
// Flush neighbours (one's edge == the next's edge) stay separate columns.
const OVERLAP_IN = 0.5;
// Excess below this is float noise, not an aisle — nothing slides.
export const MIN_SLIDE_IN = 1;
// Excess values this close count as a tie (then a between-columns gap wins).
const TIE_IN = 0.5;

const num = (v) => Math.max(0, Number(v) || 0);
const rot = (b) => ((((b?.rotationDeg || 0) % 360) + 360) % 360);
const valid = (b) =>
  !!b && !!b.pos && Number.isFinite(Number(b.pos.x)) && Number.isFinite(Number(b.pos.y)) &&
  Number(b.widthIn) > 0 && Number(b.lengthIn) > 0;

// "x" — rows run front to back, columns sit side by side along X (the default).
// "y" — every bench is rotated 90/270 (rows run side to side), columns along Y.
export function benchAxis(benches) {
  const list = (benches || []).filter(valid);
  if (!list.length) return "x";
  return list.every((b) => rot(b) === 90 || rot(b) === 270) ? "y" : "x";
}

const crossSpan = (b, axis) => {
  const r = benchRect(b);
  return axis === "y" ? { lo: r.y, hi: r.y + r.h } : { lo: r.x, hi: r.x + r.w };
};

// Columns in cross-axis order: [{ lo, hi, ids }]. Clustering by overlapping span
// (not by an exact x) keeps a column together even if one section drifted.
export function columnsOf(benches, axis = benchAxis(benches)) {
  const items = (benches || [])
    .filter(valid)
    .map((b) => ({ id: b.id, ...crossSpan(b, axis) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const cols = [];
  items.forEach((it) => {
    const cur = cols[cols.length - 1];
    if (cur && it.lo < cur.hi - OVERLAP_IN) {
      cur.hi = Math.max(cur.hi, it.hi);
      cur.ids.push(it.id);
    } else {
      cols.push({ lo: it.lo, hi: it.hi, ids: [it.id] });
    }
  });
  return cols;
}

// Normal widths of the two wall gaps along the cross axis. Side-to-side rows are
// laid out on the transposed room, where the FRONT and BACK clearances play the
// wall role.
function wallNormals(axis, settings) {
  if (axis === "y") return { first: num(settings.frontIn), last: num(settings.backIn) };
  const wall = num(settings.wallIn);
  return { first: wall, last: wall };
}

// The room's aisle: { axis, columns, gaps, index, excess, lo, hi, extent }, or
// null when there are no benches. lo/hi bound the aisle gap on the cross axis
// (room-local inches); excess is E (0 when there is no real aisle).
export function aisleOf(benches, room, settings = {}) {
  if (!room) return null;
  const axis = benchAxis(benches);
  const columns = columnsOf(benches, axis);
  const extent = Number(axis === "y" ? room.lengthIn : room.widthIn) || 0;
  if (!columns.length || !(extent > 0)) return null;
  const walls = wallNormals(axis, settings || {});
  const n = columns.length;
  const gaps = [];
  for (let i = 0; i <= n; i++) {
    const lo = i === 0 ? 0 : columns[i - 1].hi;
    const hi = i === n ? extent : columns[i].lo;
    const wall = i === 0 || i === n;
    const normal = i === 0 ? walls.first : i === n ? walls.last : 0;
    gaps.push({ index: i, lo, hi, size: hi - lo, normal, excess: hi - lo - normal, wall });
  }
  let best = gaps[0];
  gaps.forEach((g) => {
    if (g.excess > best.excess + TIE_IN) best = g;
    else if (Math.abs(g.excess - best.excess) <= TIE_IN && best.wall && !g.wall) best = g;
  });
  return { axis, columns, gaps, index: best.index, excess: Math.max(0, best.excess), lo: best.lo, hi: best.hi, extent };
}

// What tapping the column holding `benchId` does, or null when nothing moves
// (unknown bench, no benches, no aisle to slide into).
//   from / to       aisle gap index before / after
//   axis, delta     cross axis and the signed distance every moved bench travels
//   movedIds        the benches that travel
//   columnStarts    every column's cross-axis start after the slide (in order)
//   aisleFrom/To    { lo, hi } of the aisle gap before / after
export function planColumnSlide(benches, room, settings, benchId) {
  const a = aisleOf(benches, room, settings);
  if (!a || a.excess < MIN_SLIDE_IN) return null;
  const c = a.columns.findIndex((col) => col.ids.includes(benchId));
  if (c < 0) return null;
  const k = a.index;
  const n = a.columns.length;
  // Left of the aisle: c..k-1 slide toward it (+E), the aisle reopens at gap c.
  // Right of it: k..c slide toward it (-E), the aisle reopens at gap c + 1.
  const [first, last, delta, to] = c < k ? [c, k - 1, a.excess, c] : [k, c, -a.excess, c + 1];
  const moved = (i) => i >= first && i <= last;
  const movedIds = [];
  for (let i = first; i <= last; i++) movedIds.push(...a.columns[i].ids);
  const columnStarts = a.columns.map((col, i) => col.lo + (moved(i) ? delta : 0));
  const columnEnd = (i) => a.columns[i].hi + (moved(i) ? delta : 0);
  return {
    axis: a.axis,
    from: k,
    to,
    delta,
    movedIds,
    columnStarts,
    aisleFrom: { lo: a.lo, hi: a.hi },
    aisleTo: { lo: to === 0 ? 0 : columnEnd(to - 1), hi: to === n ? a.extent : columnStarts[to] },
  };
}

// The settings.aisleAt to commit for a plan. `startsFor(k)` returns the column
// starts autoLayoutByRoom produces with aisleAt = k. In a rectangular room the
// plan's own index is exact (the first check returns it); in a merged/drawn
// room a column the outline clips away entirely shifts the layout's slot
// numbering, so search for the index whose columns land where the slide puts
// them.
export function resolveAisleAt(plan, startsFor, maxIndex) {
  const want = plan?.columnStarts || [];
  const score = (k) => {
    const got = startsFor(k) || [];
    if (!got.length || !want.length) return Infinity;
    const near = (from, to) => from.reduce((s, v) => s + Math.min(...to.map((w) => Math.abs(w - v))), 0);
    return near(want, got) + near(got, want);
  };
  let best = plan.to;
  let bestScore = score(plan.to);
  if (bestScore < 1) return best;
  for (let k = 0; k <= maxIndex; k++) {
    if (k === plan.to) continue;
    const s = score(k);
    if (s < bestScore - 0.5) { best = k; bestScore = s; }
  }
  return best;
}
