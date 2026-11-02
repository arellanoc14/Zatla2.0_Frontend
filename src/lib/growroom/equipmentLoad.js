// Equipment load — CALCULATION ONLY. Reads existing spec values off placed
// objects (rooms[].objects) and rolls them into power/amperage. Never mutates
// object data, benches, layout, or the 2D↔3D sync.
//
// Power draw rules (per object):
//   minisplit    → spec.powerKw
//   dehumidifier → spec.powerW × spec.quantity
//   fan          → spec.powerW (oscillating fan — its own line)
//   ducting      → spec.fanWatts (inline extraction fan — SEPARATE additive line,
//                  never the oscillating fan; carbon filter / duct draw nothing)
//   door, co2tank → 0 (no power draw)
//
// CO₂ rule: a room with at least one co2tank whose spec.enriched === true is
// "Enriched" (1.0 CO₂ factor). Each room is evaluated independently.

// Sum the power draw (in WATTS) of every object in a single room's objects[].
export function roomEquipmentWatts(objects = []) {
  let watts = 0;
  (objects || []).forEach((o) => {
    if (!o) return;
    const spec = o.spec || {};
    if (o.type === "minisplit") {
      watts += (Number(spec.powerKw) || 0) * 1000;
    } else if (o.type === "dehumidifier") {
      // powerW per unit × quantity (defaults: 700W, qty 1).
      watts += (Number(spec.powerW) || 0) * Math.max(1, Number(spec.quantity) || 1);
    } else if (o.type === "fan") {
      watts += Number(spec.powerW) || 0;
    } else if (o.type === "ducting") {
      // Inline extraction fan on the duct run — additive, distinct from the
      // oscillating fan object above (no double-counting).
      watts += Number(spec.fanWatts) || 0;
    }
    // door, co2tank → 0
  });
  return watts;
}

// Total extraction-fan CFM across all ducting runs in a room.
export function roomExhaustCfm(objects = []) {
  return (objects || []).reduce((sum, o) =>
    o?.type === "ducting" ? sum + (Number(o.spec?.fanCfm) || 0) : sum, 0);
}

// Air changes per hour: total exhaust CFM × 60 ÷ room volume (cubic feet).
// roomCuFt = width × length × ceiling, all in feet. Returns 0 when volume unknown.
export function roomAirChangesPerHour(objects = [], roomCuFt = 0) {
  if (!roomCuFt || roomCuFt <= 0) return 0;
  const cfm = roomExhaustCfm(objects);
  return (cfm * 60) / roomCuFt;
}

// Does this room have an enriched CO₂ tank? (≥1 co2tank with spec.enriched true)
export function roomHasEnrichedCO2(objects = []) {
  return (objects || []).some((o) => o?.type === "co2tank" && o?.spec?.enriched === true);
}

// CO₂ PPM target across the room's tanks (max of any present tank's target, or 0).
// Display/target only — NOT fed into any yield formula.
export function roomCO2PpmTarget(objects = []) {
  return (objects || []).reduce((max, o) =>
    o?.type === "co2tank" ? Math.max(max, Number(o.spec?.ppmTarget) || 0) : max, 0);
}

// Estimated days a CO₂ cylinder lasts, given its size and the room volume + PPM
// target. Deterministic rule of thumb: a 20 lb bottle holds ~174 cubic feet of
// gas at STP; sustaining a sealed room at the target above ~400 ppm ambient
// consumes roughly (target-400)/1e6 of the room volume per air-exchange, assumed
// ~8 enrichment cycles/day. Returns 0 when inputs are unknown. No yield math.
export function co2DaysRemaining(spec = {}, roomCuFt = 0) {
  const sizeLb = Number(spec.tankSizeLb) || 0;
  const ppm = Number(spec.ppmTarget) || 0;
  if (!sizeLb || !roomCuFt || roomCuFt <= 0 || ppm <= 400) return 0;
  const cuFtPerLb = 8.7;                 // ~174 ft³ per 20 lb bottle
  const tankCuFt = sizeLb * cuFtPerLb;
  const cyclesPerDay = 8;
  const perCycle = roomCuFt * ((ppm - 400) / 1e6);
  const dailyUse = perCycle * cyclesPerDay;
  if (dailyUse <= 0) return 0;
  return tankCuFt / dailyUse;
}