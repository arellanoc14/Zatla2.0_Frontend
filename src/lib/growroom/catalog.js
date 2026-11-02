// Data-driven catalog of benches, lights, doors, equipment. Dimensions in inches.

export const BENCH_PRESETS = {
  "4x8": { lengthIn: 96, widthIn: 48, label: "4×8" },
  "4x6": { lengthIn: 72, widthIn: 48, label: "4×6" },
  "4x4": { lengthIn: 48, widthIn: 48, label: "4×4" },
  "5x8": { lengthIn: 96, widthIn: 60, label: "5×8" },
  "5x6": { lengthIn: 72, widthIn: 60, label: "5×6" },
  "5x4": { lengthIn: 48, widthIn: 60, label: "5×4" },
  "4col": { lengthIn: 96, widthIn: 48, label: "4×8" },
  "5col": { lengthIn: 96, widthIn: 60, label: "5×8" },
};

export const BENCH_TYPES = [
  { id: "rolling", label: "Rolling" },
];

export const LIGHT_PRESETS = {
  "4x4": { w: 48, h: 48, label: "4×4 Fixture" },
  bar: { w: 48, h: 4, label: "Bar Light" },
};

export const DOOR_PRESETS = {
  single: { widthIn: 36, label: "Single Door" },
  double: { widthIn: 60, label: "Double Door" },
  sliding: { widthIn: 48, label: "Sliding Door" },
  rollup: { widthIn: 96, label: "Roll-up Door" },
  window: { widthIn: 36, label: "Window" },
};

// Equipment with real default footprints (w x h in inches)
export const EQUIPMENT_CATALOG = [
  { kind: "ac", label: "Mini-Split / AC", w: 42, h: 14, group: "Climate" },
  { kind: "dehumidifier", label: "Dehumidifier", w: 24, h: 18, group: "Climate" },
  { kind: "humidifier", label: "Humidifier", w: 18, h: 18, group: "Climate" },
  { kind: "exhaust", label: "Exhaust Fan", w: 12, h: 12, group: "Climate" },
  { kind: "intake", label: "Intake Vent", w: 16, h: 8, group: "Climate" },
  { kind: "co2", label: "CO₂ Tank", w: 9, h: 9, group: "Climate" },
  { kind: "oscfan", label: "Oscillating Fan", w: 16, h: 16, group: "Air" },
  { kind: "floorfan", label: "Floor Fan", w: 20, h: 20, group: "Air" },
  { kind: "manifold", label: "Irrigation Manifold", w: 24, h: 12, group: "Water" },
  { kind: "reservoir", label: "Reservoir 100gal", w: 30, h: 30, group: "Water" },
  { kind: "dosing", label: "Dosing Rack", w: 24, h: 18, group: "Water" },
  { kind: "sink", label: "Sink / Wash", w: 24, h: 18, group: "Water" },
  { kind: "panel", label: "Electrical Panel", w: 24, h: 12, group: "Power", clearanceFrontIn: 36 },
  { kind: "subpanel", label: "Sub-panel", w: 18, h: 10, group: "Power" },
  { kind: "controller", label: "Env. Controller", w: 18, h: 12, group: "Power" },
  { kind: "cart", label: "Harvest Cart", w: 48, h: 28, group: "Workflow" },
  { kind: "bin", label: "Harvest Bin", w: 30, h: 24, group: "Workflow" },
  { kind: "trim", label: "Trim Station", w: 48, h: 24, group: "Workflow" },
  { kind: "shelving", label: "Shelving", w: 48, h: 12, group: "Workflow" },
];

export function equipmentByKind(kind) {
  return EQUIPMENT_CATALOG.find((e) => e.kind === kind);
}

export const DEFAULT_SETTINGS = { frontIn: 36, backIn: 6, centerIn: 36, wallIn: 0 };
export const CART_MIN_IN = 24;