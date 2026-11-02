// Spectrum model for the home page.
//
// ILLUSTRATIVE, NOT MEASURED. The curves below are built from the four channel
// peaks on the product sheet (UVA, 437.5 nm blue + 6200K white, 660 nm deep red,
// 730 nm far-red) and calibrated so that all four channels at 100% reproduce the
// shape and peak heights of the factory spectrum chart. A measured spectral
// report would replace CURVES wholesale; nothing else here depends on them.

export const WL_MIN = 320;
export const WL_MAX = 780;
export const Y_MAX = 35; // chart top, same scale as the sheet's chart

// Channel names and factory shares come from the product sheet.
export const CHANNELS = [
  { id: "uva", detail: "Channel 1 · UVA", factory: 5.5, color: "#8b5cf6", note: "Just below visible light" },
  { id: "blue", detail: "Channel 2 · 437.5 nm blue + 6200K white", factory: 70, color: "#60a5fa", note: "Blue peak plus the broad white" },
  { id: "red", detail: "Channel 3 · 660 nm deep red", factory: 18, color: "#ef4444", note: "The tallest single peak" },
  { id: "farred", detail: "Channel 4 · 730 nm far-red", factory: 6.5, color: "#b91c1c", note: "Nearly invisible to the eye" },
];

// Photon colours used by the emission animation, per channel.
export const PARTICLE_COLORS = [
  ["#a78bfa"],
  ["#60a5fa", "#fff3d6", "#fff3d6"],
  ["#ff5252"],
  ["#b91c1c"],
];

export const FACTORY_LEVELS = [100, 100, 100, 100];

const g = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2);
const ag = (x, mu, sl, sr) => g(x, mu, x < mu ? sl : sr);

const CURVES = [
  (x) => 5.0 * g(x, 395, 7),
  (x) => 17.0 * g(x, 437, 11) + 7.5 * ag(x, 565, 55, 70),
  (x) => 29.0 * g(x, 662, 12),
  (x) => 9.0 * g(x, 730, 14),
];

// Area under each channel curve at 100% (relative photon output).
export const CHANNEL_AREAS = CURVES.map((f) => {
  let s = 0;
  for (let x = WL_MIN; x < WL_MAX; x += 1) s += f(x + 0.5);
  return s;
});

export function spectrumAt(levels, x) {
  let s = 0;
  for (let i = 0; i < CURVES.length; i += 1) s += (levels[i] / 100) * CURVES[i](x);
  return s;
}

export function spectrumCurve(levels, step = 2) {
  const out = [];
  for (let x = WL_MIN; x <= WL_MAX; x += step) out.push([x, spectrumAt(levels, x)]);
  return out;
}

export function totalPhotons(levels) {
  let s = 0;
  for (let i = 0; i < CHANNEL_AREAS.length; i += 1) s += (levels[i] / 100) * CHANNEL_AREAS[i];
  return s;
}
const FACTORY_TOTAL = totalPhotons(FACTORY_LEVELS);

export const BANDS = [
  { id: "uva", label: "UV-A", from: 320, to: 400, color: "#8b5cf6" },
  { id: "blue", label: "Blue", from: 400, to: 500, color: "#3b82f6" },
  { id: "green", label: "Green", from: 500, to: 600, color: "#22c55e" },
  { id: "red", label: "Red", from: 600, to: 700, color: "#ef4444" },
  { id: "farred", label: "Far-red", from: 700, to: 780, color: "#b91c1c" },
];

export function bandTotals(levels) {
  const sums = BANDS.map(() => 0);
  for (let x = WL_MIN; x < WL_MAX; x += 1) {
    const v = spectrumAt(levels, x + 0.5);
    const k = BANDS.findIndex((b) => x + 0.5 >= b.from && x + 0.5 < b.to);
    if (k >= 0) sums[k] += v;
  }
  return sums;
}

// Share of the modelled output in each band, in percent (sums to 100, or all 0).
export function bandShares(levels) {
  const sums = bandTotals(levels);
  const total = sums.reduce((a, b) => a + b, 0);
  return sums.map((v) => (total > 0 ? (v / total) * 100 : 0));
}

// 600–700 nm output divided by 700–780 nm output. null when there is no far-red.
export function redToFarRed(levels) {
  const sums = bandTotals(levels);
  const red = sums[3];
  const far = sums[4];
  return far > 1e-6 ? red / far : null;
}

export function peakWavelength(levels) {
  let best = 0;
  let at = null;
  for (let x = WL_MIN; x <= WL_MAX; x += 1) {
    const v = spectrumAt(levels, x);
    if (v > best) { best = v; at = x; }
  }
  return best > 1e-6 ? at : null;
}

// Rainbow colour for a wavelength (Bruton), with UV and far-red faded to violet / dark red.
export function wavelengthToRgb(w) {
  if (w < 380) return [139, 92, 246];
  if (w > 780) return [90, 0, 0];
  let r = 0, gg = 0, b = 0;
  if (w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { gg = (w - 440) / 50; b = 1; }
  else if (w < 510) { gg = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; gg = 1; }
  else if (w < 645) { r = 1; gg = -(w - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (w < 420) f = 0.3 + (0.7 * (w - 380)) / 40;
  else if (w > 700) f = 0.3 + (0.7 * (780 - w)) / 80;
  const c = (v) => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8));
  return [c(r), c(gg), c(b)];
}

// ── Colour of the mix, as the eye would see it ───────────────────────────────
// CIE 1931 colour-matching functions via the multi-lobe Gaussian fit of
// Wyman, Sloan & Shirley (2013), then XYZ → linear sRGB.
const cg = (x, mu, s1, s2) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};
const xbar = (l) => 1.056 * cg(l, 599.8, 37.9, 31.0) + 0.362 * cg(l, 442.0, 16.0, 26.7) - 0.065 * cg(l, 501.1, 20.4, 26.2);
const ybar = (l) => 0.821 * cg(l, 568.8, 46.9, 40.5) + 0.286 * cg(l, 530.9, 16.3, 31.1);
const zbar = (l) => 1.217 * cg(l, 437.0, 11.8, 36.0) + 0.681 * cg(l, 459.0, 26.0, 13.8);

function xyz(levels) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 360; l <= 780; l += 2) {
    const s = spectrumAt(levels, l);
    X += s * xbar(l); Y += s * ybar(l); Z += s * zbar(l);
  }
  return { X, Y, Z };
}
const FACTORY_Y = xyz(FACTORY_LEVELS).Y;

const hex2 = (n) => n.toString(16).padStart(2, "0");

// rgb: display colour (0–255, normalised so the brightest channel is 255).
// brightness: how bright it looks to the eye relative to factory (UV and far-red add almost none).
// photons: total modelled output relative to factory. on: false when every channel is at 0.
export function spectrumColor(levels) {
  const total = totalPhotons(levels);
  if (total <= 1e-6) return { rgb: [120, 120, 120], hex: "#787878", brightness: 0, photons: 0, on: false };
  const { X, Y, Z } = xyz(levels);
  const lin = [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.2040 * Y + 1.0570 * Z,
  ].map((v) => Math.max(0, v));
  const brightness = Math.max(0, Y / FACTORY_Y);
  const photons = total / FACTORY_TOTAL;
  // Almost nothing the eye can see (UV-A and/or far-red only). The Gaussian
  // colour-matching fit is not reliable that far into the tails, so show the
  // tint of the invisible band instead: dark red for far-red, violet for UV-A.
  if (brightness < 0.02) {
    const uv = (levels[0] / 100) * CHANNEL_AREAS[0];
    const fr = (levels[3] / 100) * CHANNEL_AREAS[3];
    const rgb = fr >= uv ? [127, 29, 29] : [109, 40, 217];
    return { rgb, hex: `#${rgb.map(hex2).join("")}`, brightness, photons, on: true };
  }
  const m = Math.max(...lin);
  const rgb = m < 1e-9 ? [127, 29, 29] : lin.map((v) => Math.round(255 * Math.pow(v / m, 1 / 2.2)));
  return { rgb, hex: `#${rgb.map(hex2).join("")}`, brightness, photons, on: true };
}
