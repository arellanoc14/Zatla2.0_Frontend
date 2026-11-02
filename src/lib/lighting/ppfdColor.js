// The PPFD heat ramp, shared by the spec-sheet map (PpfdMapChart) and the 3D
// canopy heatmap (top + 3D views) so both read the same. No blue anywhere:
// dark green → lime → yellow → orange → red. t in [0, 1] → [r, g, b] 0–255.
const STOPS = [[0, [0x1a, 0x7f, 0x37]], [0.25, [0x8f, 0xd6, 0x2e]], [0.5, [0xf5, 0xe0, 0x3a]], [0.75, [0xf7, 0x93, 0x1e]], [1, [0xe8, 0x32, 0x1e]]];
export function heatRgbVivid(t) {
  const c = Math.max(0, Math.min(1, t || 0));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, a] = STOPS[i];
    if (c <= t1) {
      const [t0, b] = STOPS[i - 1];
      const u = (c - t0) / (t1 - t0);
      return b.map((v, k) => Math.round(v + (a[k] - v) * u));
    }
  }
  return STOPS[STOPS.length - 1][1].slice();
}
export const heatRgb = heatRgbVivid;

// Label colour for a cell at t: white on the dark-green and red ends, dark on
// the lime/yellow/orange middle.
export const heatTextColor = (t) => (t > 0.12 && t < 0.88 ? "#1a1a1a" : "#fff");

export const heatCss = (t) => `rgb(${heatRgb(t).join(",")})`;
export const heatCssVivid = (t) => `rgb(${heatRgbVivid(t).join(",")})`;
