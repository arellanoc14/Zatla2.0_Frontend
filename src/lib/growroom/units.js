// Measurement engine — all geometry stored in INCHES internally.
// Display layer converts to feet+inches (imperial) or meters/cm (metric).

export const IN_PER_FT = 12;
export const CM_PER_IN = 2.54;

// Format inches -> feet'inches" e.g. 319 -> 26' 7"
export function formatImperial(inches, { precise = false } = {}) {
  if (inches == null || isNaN(inches)) return "—";
  const sign = inches < 0 ? "-" : "";
  let v = Math.abs(inches);
  const ft = Math.floor(v / IN_PER_FT);
  let rem = v - ft * IN_PER_FT;
  if (precise) {
    // nearest 1/8"
    const eighths = Math.round(rem * 8);
    const whole = Math.floor(eighths / 8);
    const frac = eighths % 8;
    let inStr = `${whole}`;
    if (frac > 0) {
      const g = gcd(frac, 8);
      inStr += ` ${frac / g}/${8 / g}`;
    }
    return `${sign}${ft}' ${inStr}"`;
  }
  rem = Math.round(rem);
  let f = ft;
  let r = rem;
  if (r === 12) { f += 1; r = 0; }
  if (r === 0) return `${sign}${f}'`;
  return `${sign}${f}' ${r}"`;
}

export function formatMetric(inches) {
  if (inches == null || isNaN(inches)) return "—";
  const m = (inches * CM_PER_IN) / 100;
  if (Math.abs(m) >= 1) return `${m.toFixed(2)} m`;
  return `${(inches * CM_PER_IN).toFixed(1)} cm`;
}

export function formatLength(inches, units, opts) {
  return units === "metric" ? formatMetric(inches) : formatImperial(inches, opts);
}

// sqft from area in square inches
export function sqft(areaSqIn) {
  return areaSqIn / (IN_PER_FT * IN_PER_FT);
}

export function formatArea(areaSqIn, units) {
  if (units === "metric") {
    const sqm = areaSqIn * CM_PER_IN * CM_PER_IN / 10000;
    return `${sqm.toFixed(1)} m²`;
  }
  return `${Math.round(sqft(areaSqIn))} sqft`;
}

// Flexible parse: 26'11", 26' 11, 26.5', 323in, 8.2m, 250cm, 96
export function parseLength(text, units = "imperial") {
  if (text == null) return null;
  const s = String(text).trim().toLowerCase();
  if (s === "") return null;
  // metric
  let m = s.match(/^([\d.]+)\s*m$/);
  if (m) return parseFloat(m[1]) * 100 / CM_PER_IN;
  m = s.match(/^([\d.]+)\s*cm$/);
  if (m) return parseFloat(m[1]) / CM_PER_IN;
  m = s.match(/^([\d.]+)\s*in$/);
  if (m) return parseFloat(m[1]);
  // feet'inches"
  m = s.match(/^([\d.]+)\s*'\s*([\d.]+)?\s*"?$/);
  if (m) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    return ft * IN_PER_FT + inch;
  }
  // bare number — interpret per units
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (units === "metric") return n / CM_PER_IN; // treat as cm
  return n; // treat as inches
}

function gcd(a, b) {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}