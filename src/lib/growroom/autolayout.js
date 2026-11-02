// Build-by-Room auto-layout engine. All inches. Pure functions.
import { CART_MIN_IN } from "./catalog";

let idc = 0;
const uid = (p = "b") => `${p}_${Date.now().toString(36)}_${idc++}`;

const MODULE_IN = 48; // 4ft planting module

// Density-pack bench columns into two banks split by a movable main aisle.
// Benches run the full usable LENGTH (length - front - back) as a single row each.
// room: { lengthIn, widthIn }, aisles: { frontIn, backIn, centerIn, wallIn }
// benchWidthFt: 4 | 5
export function autoLayoutByRoom(room, aisles, benchWidthFt = 4, benchType = "rolling", tiers = 1) {
  const benches = [];
  const warnings = [];
  const benchWidthIn = benchWidthFt * 12;

  const { lengthIn, widthIn } = room;
  const { frontIn, backIn, centerIn, wallIn } = aisles;

  const runLen = lengthIn - frontIn - backIn;
  const usableWidth = widthIn - 2 * wallIn - centerIn;

  if (runLen < MODULE_IN || benchWidthIn > (widthIn - 2 * wallIn - centerIn) / 1) {
    if (benchWidthIn > usableWidth) {
      return { benches: [], stats: emptyStats(room), warnings: ["Room too narrow for the selected bench width with these clearances"] };
    }
  }
  if (runLen < MODULE_IN) {
    return { benches: [], stats: emptyStats(room), warnings: ["Room too short for benches with these aisle settings"] };
  }

  // Fit the maximum whole number of columns after reserving both wall
  // clearances and the requested main aisle. An odd total intentionally makes
  // one bank larger, shifting the aisle instead of discarding a usable column.
  const totalColumns = Math.max(0, Math.floor(usableWidth / benchWidthIn));
  if (totalColumns < 2) {
    return { benches: [], stats: emptyStats(room), warnings: ["No two-bank layout fits — reduce bench width, wall or center clearance"] };
  }

  if (centerIn < CART_MIN_IN) warnings.push(`Center aisle ${centerIn}" — below ${CART_MIN_IN}" cart minimum`);

  // Snap usable run down to whole 4ft modules, then break that run into
  // discrete bench objects: as many 8ft (2-module) benches as fit, plus a
  // trailing 4ft (1-module) bench when there's an odd module left over.
  const SUB = 24; // 2ft sub-module — lets the run pack 8ft, 6ft, and 4ft benches.
  const totalSubs = Math.max(2, Math.floor(runLen / SUB));
  const segments = []; // { lenIn, modules }
  let remaining = totalSubs;
  while (remaining >= 4) { segments.push({ lenIn: 4 * SUB, modules: 2 }); remaining -= 4; } // 8ft
  if (remaining >= 3) { segments.push({ lenIn: 3 * SUB, modules: 1 }); remaining -= 3; } // 6ft
  if (remaining >= 2) { segments.push({ lenIn: 2 * SUB, modules: 1 }); remaining -= 2; } // 4ft

  const wF = benchWidthFt; // 4 or 5
  const presetFor = (lenIn) => (lenIn === 96 ? `${wF}x8` : lenIn === 72 ? `${wF}x6` : `${wF}x4`);

  // Keep FRONT and BACK aisles exact. The run is snapped to 4ft bench modules;
  // any tiny leftover is distributed between bench segments instead of aisles.
  const snappedRun = segments.reduce((s, seg) => s + seg.lenIn, 0);
  const startY = frontIn;
  const segmentGap = segments.length > 1 ? Math.max(0, runLen - snappedRun) / (segments.length - 1) : 0;

  // Build a full column of stacked bench segments at a given x.
  const addColumn = (x) => {
    let y = startY;
    segments.forEach((seg) => {
      benches.push({
        id: uid("b"),
        preset: presetFor(seg.lenIn),
        lengthIn: seg.lenIn,
        widthIn: benchWidthIn,
        modules: seg.modules,
        type: benchType,
        tiers: Math.max(1, tiers),
        pos: { x, y },
        rotationDeg: 0,
        color: "#16a34a",
      });
      y += seg.lenIn + segmentGap;
    });
  };

  // Split the maximum column count between two banks. Odd counts put the extra
  // column on the right, which moves the aisle left while keeping both wall
  // clearances and the requested aisle intact.
  const leftColumns = Math.floor(totalColumns / 2);
  const rightColumns = totalColumns - leftColumns;
  const leftBankWidth = leftColumns * benchWidthIn;
  const packedBenchWidth = totalColumns * benchWidthIn;
  const leftover = Math.max(0, usableWidth - packedBenchWidth);
  const effectiveCenter = centerIn + leftover;

  // Remembered mobile aisle (aisles.aisleAt, written by a 3D column slide — see
  // mobileAisle.js): the GAP the aisle sits in, 0 = against the left wall,
  // totalColumns = against the right wall, k = between column k-1 and column k.
  // Every column stays flush with its neighbour and ALL the non-bench width
  // (the requested centre aisle plus the packing leftover) lands in gap k. At
  // the default split below the picture is the same as aisleAt = leftColumns;
  // unset, the code below runs as it always has.
  const aisleRaw = aisles.aisleAt;
  const aisleNum = aisleRaw === null || aisleRaw === undefined || aisleRaw === "" ? NaN : Number(aisleRaw);
  const aisleAt = Number.isFinite(aisleNum) ? Math.max(0, Math.min(totalColumns, Math.round(aisleNum))) : null;
  const aisleX = Math.max(0, widthIn - 2 * wallIn - packedBenchWidth);
  if (aisleAt !== null) {
    for (let i = 0; i < totalColumns; i++) {
      addColumn(wallIn + i * benchWidthIn + (i >= aisleAt ? aisleX : 0));
    }
  } else {
    // Both banks remain flush-packed; all non-module width stays in the main aisle.
    for (let i = 0; i < leftColumns; i++) {
      addColumn(wallIn + i * benchWidthIn);
    }

    const rightStart = wallIn + leftBankWidth + effectiveCenter;
    for (let i = 0; i < rightColumns; i++) {
      addColumn(rightStart + i * benchWidthIn);
    }
  }

  return { benches, stats: computeStats(room, benches), warnings };
}

// Place one light fixture centered over each 4ft module along every bench.
// lightWidthFt: 4 | 5 (cross-bench), modules are 4ft along length.
export function autoLayoutLights(benches, lightWidthFt = 4) {
  const lights = [];
  const wIn = lightWidthFt * 12;
  const hIn = MODULE_IN; // 4ft along bench length
  benches.forEach((b) => {
    const mods = Math.max(1, b.modules || Math.round(b.lengthIn / MODULE_IN));
    const cx = b.pos.x + b.widthIn / 2;
    for (let m = 0; m < mods; m++) {
      const cy = b.pos.y + m * MODULE_IN + MODULE_IN / 2;
      lights.push({
        id: uid("l"),
        footprintIn: { w: wIn, h: hIn },
        hangHeightIn: 24,
        pos: { x: cx - wIn / 2, y: cy - hIn / 2 },
        rotationDeg: 0,
        benchId: b.id,
      });
    }
  });
  return lights;
}

export function computeStats(room, benches) {
  const totalAreaSqIn = room.lengthIn * room.widthIn;
  let plantingSqIn = 0;     // canopy incl. tier stacking (productive growing area)
  let floorSqIn = 0;        // bench floor footprint only (for room-use %)
  const widthSet = new Set();
  const rowSet = new Set();
  const columnSet = new Set();
  const benchSizeCounts = { fourByEight: 0, fiveByEight: 0, fourByFour: 0, fiveByFour: 0, fourBySix: 0, fiveBySix: 0 };
  let runLen = 0;
  benches.forEach((b) => {
    plantingSqIn += b.lengthIn * b.widthIn * Math.max(1, b.tiers || 1);
    floorSqIn += b.lengthIn * b.widthIn;
    const widthFt = Math.round(b.widthIn / 12);
    const lengthFt = Math.round(b.lengthIn / 12);
    widthSet.add(widthFt);
    if (widthFt === 4 && lengthFt === 8) benchSizeCounts.fourByEight += 1;
    if (widthFt === 5 && lengthFt === 8) benchSizeCounts.fiveByEight += 1;
    if (widthFt === 4 && lengthFt === 6) benchSizeCounts.fourBySix += 1;
    if (widthFt === 5 && lengthFt === 6) benchSizeCounts.fiveBySix += 1;
    if (widthFt === 4 && lengthFt === 4) benchSizeCounts.fourByFour += 1;
    if (widthFt === 5 && lengthFt === 4) benchSizeCounts.fiveByFour += 1;
    // A row runs side-to-side, so benches sharing the same vertical position
    // belong to one row regardless of how many columns span the room.
    rowSet.add(Math.round((b.pos?.y || 0) * 10) / 10);
    columnSet.add(Math.round((b.pos?.x || 0) * 10) / 10);
  });
  const totalLights = benches.reduce((sum, b) => {
    const modules = Math.max(1, b.modules || Math.round(b.lengthIn / MODULE_IN));
    const tiers = Math.max(1, b.tiers || 1);
    return sum + modules * tiers;
  }, 0);
  if (benches.length) {
    const minX = Math.min(...benches.map((b) => b.pos.x));
    runLen = benches.filter((b) => Math.abs(b.pos.x - minX) < 1).reduce((s, b) => s + b.lengthIn, 0);
  }
  return {
    totalBenches: benches.length,
    benchSizeCounts,
    totalLights,
    benchRows: rowSet.size,
    benchColumns: columnSet.size,
    benchWidthFt: widthSet.size === 1 ? [...widthSet][0] : "mix",
    benchLengthFt: Math.round((runLen / 12) * 10) / 10,
    plantingAreaSqft: Math.round(plantingSqIn / 144),
    canopyFloorSqft: Math.round(floorSqIn / 144),
    totalAreaSqft: Math.round(totalAreaSqIn / 144),
    // Space used by canopy = bench floor footprint ÷ room floor area (aisles excluded
    // from numerator). Always ≤ 100% — no tier multiplier, no impossible readings.
    efficiency: totalAreaSqIn ? Math.min(100, Math.round((floorSqIn / totalAreaSqIn) * 100)) : 0,
  };
}

function emptyStats(room) {
  return {
    totalBenches: 0,
    benchSizeCounts: { fourByEight: 0, fiveByEight: 0, fourByFour: 0, fiveByFour: 0, fourBySix: 0, fiveBySix: 0 },
    totalLights: 0,
    benchRows: 0,
    benchColumns: 0,
    benchWidthFt: 0,
    benchLengthFt: 0,
    plantingAreaSqft: 0,
    canopyFloorSqft: 0,
    totalAreaSqft: Math.round((room.lengthIn * room.widthIn) / 144),
    efficiency: 0,
  };
}