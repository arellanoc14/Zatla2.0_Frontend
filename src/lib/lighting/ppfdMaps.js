// The ZATLA grow light's printed PPFD map — DISPLAY ONLY. It feeds the 3D
// view's PPFD layer and the numbered spec-sheet card beside it; nothing in the
// cart, the price or the layout reads it.
//
// SOURCE. The grid is the manufacturer's printed "PPFD READING" lattice for the
// 1000 W fixture at 12 in, 100% output, over a 4×4 footprint. It is the sheet
// whose figures the ZATLA product page already quotes (lib/product.js): 1,000 W,
// 3,010 µmol/s photon flux, and a 1,962 µmol/m²/s peak at 12 in — the largest
// printed cell below. If ZATLA publishes its own measured map, replace GRID and
// keep the shape: rows top to bottom, null for a cell the sheet leaves blank.
//
// The sheet prints a lattice: only some cells carry a number. Blank cells are
// stored as null and NEVER given a number — fillGrid() interpolates them for
// colouring only, so the map reads as one surface without inventing readings.
const GRID = [
  [937, null, 1091, null, 1100, null, 1097, null, 905],
  [null, 1252, null, null, 1350, null, null, 1223, null],
  [1024, null, 1503, null, 1730, null, 1565, null, 1087],
  [null, null, null, 1930, 1917, 1916, null, null, null],
  [1245, 1454, 1818, 1944, 1945, 1962, 1799, 1540, 1270],
  [null, null, null, 1882, 1876, 1918, null, null, null],
  [1035, null, 1534, null, 1620, null, 1497, null, 1065],
  [null, 1276, null, null, 1268, null, null, 1237, null],
  [952, null, 1096, null, 1105, null, 1078, null, 914],
];

export const ZATLA_PPFD_MAP = {
  wattageW: 1000,
  heightIn: 12,
  dimmingPct: 100,
  coverage: "4×4 ft",
  grid: GRID,
};

// The printed map for a room's grow light → { map, label, watts }, or null when
// the room has its grow lights switched off ("none"). Every stored light key
// renders as the ZATLA Grow Light (see lightModels.js), so they all share it.
export function specSheetFor(modelKey) {
  if (modelKey === "none") return null;
  return { map: ZATLA_PPFD_MAP, label: "ZATLA Grow Light", watts: ZATLA_PPFD_MAP.wattageW };
}

// avg / max / min over the PRINTED cells only.
export function gridStats(grid) {
  const vals = grid.flat().filter((v) => typeof v === "number" && isFinite(v));
  if (!vals.length) return { avg: 0, max: 0, min: 0, count: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / vals.length),
    max: Math.max(...vals),
    min: Math.min(...vals),
    count: vals.length,
  };
}

// Fill blank (null) cells with the mean of their printed 8-neighbours,
// repeating until every cell has a value, so the whole grid can be coloured.
// Printed cells are never changed. Returns a new grid.
export function fillGrid(grid) {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  let out = grid.map((r) => r.map((v) => (typeof v === "number" ? v : null)));
  for (let pass = 0; pass < rows + cols; pass++) {
    let pending = false;
    const next = out.map((r) => r.slice());
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (out[y][x] != null) continue;
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dy && !dx) continue;
            const v = out[y + dy]?.[x + dx];
            if (v != null) { sum += v; n++; }
          }
        }
        if (n) next[y][x] = sum / n; else pending = true;
      }
    }
    out = next;
    if (!pending) break;
  }
  return out;
}
