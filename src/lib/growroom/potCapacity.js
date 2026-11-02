// Pot-capacity math for grow benches.
// Tight grid, no spacing between pots. Bench dims are in inches.
// Plants across = floor(widthIn / potIn); along = floor(lengthIn / potIn).

export const DEFAULT_POT_IN = 6;

export function potsForBench(widthIn, lengthIn, potIn = DEFAULT_POT_IN) {
  const across = Math.floor(widthIn / potIn);
  const along = Math.floor(lengthIn / potIn);
  return { across, along, total: across * along };
}

// Reference bench sizes (feet → inches), in the order the spec lists them.
export const BENCH_SIZES = [
  { key: "4x8", label: "4×8", widthFt: 4, lengthFt: 8 },
  { key: "4x4", label: "4×4", widthFt: 4, lengthFt: 4 },
  { key: "5x8", label: "5×8", widthFt: 5, lengthFt: 8 },
  { key: "5x4", label: "5×4", widthFt: 5, lengthFt: 4 },
];

export function capacityTable(potIn = DEFAULT_POT_IN) {
  return BENCH_SIZES.map((b) => {
    const widthIn = b.widthFt * 12, lengthIn = b.lengthFt * 12;
    const { across, along, total } = potsForBench(widthIn, lengthIn, potIn);
    return { ...b, widthIn, lengthIn, across, along, total };
  });
}

// Match a bench object to one of the reference sizes by its width/length in inches.
export function benchSizeKey(widthIn, lengthIn) {
  const wFt = Math.round(widthIn / 12), lFt = Math.round(lengthIn / 12);
  const found = BENCH_SIZES.find((b) => b.widthFt === wFt && b.lengthFt === lFt);
  return found ? found.key : `${wFt}x${lFt}`;
}

// Total pots across all benches currently in the layout.
export function totalPotsForBenches(benches = [], potIn = DEFAULT_POT_IN) {
  return (benches || []).reduce((sum, b) => sum + potsForBench(b.widthIn, b.lengthIn, potIn).total, 0);
}