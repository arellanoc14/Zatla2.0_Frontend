// Estimate a residential electricity rate ($/kWh) from a US zip code.
// We derive the state from the zip's leading digits, then look up that state's
// approximate average residential rate. Purely a heuristic estimate — the user
// can always override it. Falls back to $0.10/kWh when unknown.

export const DEFAULT_RATE = 0.10;

// Approximate average residential rates by state ($/kWh).
const STATE_RATES = {
  AL: 0.15, AK: 0.24, AZ: 0.14, AR: 0.13, CA: 0.30, CO: 0.15, CT: 0.27,
  DE: 0.15, FL: 0.15, GA: 0.14, HI: 0.43, ID: 0.11, IL: 0.16, IN: 0.15,
  IA: 0.13, KS: 0.14, KY: 0.13, LA: 0.12, ME: 0.23, MD: 0.16, MA: 0.28,
  MI: 0.18, MN: 0.14, MS: 0.13, MO: 0.13, MT: 0.12, NE: 0.12, NV: 0.15,
  NH: 0.23, NJ: 0.18, NM: 0.14, NY: 0.23, NC: 0.13, ND: 0.11, OH: 0.15,
  OK: 0.12, OR: 0.13, PA: 0.17, RI: 0.27, SC: 0.14, SD: 0.13, TN: 0.13,
  TX: 0.14, UT: 0.11, VT: 0.21, VA: 0.14, WA: 0.11, WV: 0.14, WI: 0.16,
  WY: 0.12, DC: 0.16,
};

// Map a zip code to a state using ZIP code prefix (first 3 digits) ranges.
function stateFromZip(zip) {
  const n = parseInt(String(zip).slice(0, 3), 10);
  if (isNaN(n)) return null;
  const ranges = [
    [["MA"], 10, 27], [["RI"], 28, 29], [["NH"], 30, 38], [["ME"], 39, 49],
    [["VT"], 50, 59], [["MA"], 55, 55], [["CT"], 60, 69], [["NJ"], 70, 89],
    [["NY"], 90, 149], [["PA"], 150, 196], [["DE"], 197, 199], [["DC"], 200, 205],
    [["VA"], 220, 246], [["WV"], 247, 268], [["NC"], 270, 289], [["SC"], 290, 299],
    [["GA"], 300, 319], [["FL"], 320, 349], [["AL"], 350, 369], [["TN"], 370, 385],
    [["MS"], 386, 397], [["GA"], 398, 399], [["KY"], 400, 427], [["OH"], 430, 459],
    [["IN"], 460, 479], [["MI"], 480, 499], [["IA"], 500, 528], [["SD"], 570, 577],
    [["ND"], 580, 588], [["MN"], 550, 567], [["MT"], 590, 599], [["IL"], 600, 629],
    [["MO"], 630, 658], [["KS"], 660, 679], [["NE"], 680, 693], [["LA"], 700, 714],
    [["AR"], 716, 729], [["OK"], 730, 749], [["TX"], 750, 799], [["TX"], 885, 885],
    [["CO"], 800, 816], [["WY"], 820, 831], [["ID"], 832, 838], [["UT"], 840, 847],
    [["AZ"], 850, 865], [["NM"], 870, 884], [["NV"], 889, 898], [["CA"], 900, 961],
    [["HI"], 967, 968], [["OR"], 970, 979], [["WA"], 980, 994], [["AK"], 995, 999],
  ];
  for (const [[st], lo, hi] of ranges) {
    if (n >= lo && n <= hi) return st;
  }
  return null;
}

// Returns { rate, state, estimated }. estimated=true when derived from a zip.
export function estimateRateFromZip(zip) {
  const clean = String(zip || "").replace(/\D/g, "");
  if (clean.length < 5) return { rate: DEFAULT_RATE, state: null, estimated: false };
  const state = stateFromZip(clean);
  if (state && STATE_RATES[state]) {
    return { rate: STATE_RATES[state], state, estimated: true };
  }
  return { rate: DEFAULT_RATE, state: null, estimated: false };
}