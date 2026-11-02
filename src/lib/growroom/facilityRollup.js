// Facility-level rollup — DISPLAY/CALCULATION SUMMATION ONLY.
//
// Sums deterministic per-room metrics across every room in a project. It NEVER
// changes per-room calculation logic or any layout data — it re-uses the exact
// same primitives the per-room panels use (computeStats, the plant-count
// formula, computeUnderCanopy, the 1000W/top-light power model, and the same
// yield → revenue math) and adds the per-room results together.
//
// The active room is edited through the flat top-level doc fields, so its
// numbers come from those. Every other room is read from doc.rooms[] using its
// own stored geometry. Falls back to the single flat room for legacy projects.

import { computeStats } from "./autolayout";
import { computeUnderCanopy } from "./underCanopy";
import { roomEquipmentWatts, roomHasEnrichedCO2 } from "./equipmentLoad";
import { plantsForBench } from "./plantLayout";
import { isUclMode } from "./canopyLightFit";

const MODULE_IN = 48;
const GRAMS_PER_LB = 453.592;
const SQFT_TO_M2 = 10.7639;
const DLI_DIVISOR = 1_000_000;

// Plant count for one room's benches — the same rule the 3D view places plants by
// (plantLayout.js): 6 per bench deck, one block per tier, repeated per 8 ft.
function plantsForBenches(benches) {
  let plants = 0;
  benches.forEach((b) => {
    plants += plantsForBench(b.lengthIn || 0, b.tiers);
  });
  return plants;
}

// Top-light fixture count for a room — same as computeStats.totalLights
// (one fixture per 4ft module along every bench).
function topLights(benches) {
  return benches.reduce(
    (sum, b) => sum + Math.max(1, b.modules || Math.round((b.lengthIn || 0) / MODULE_IN)),
    0
  );
}

// Single-harvest yield (grams) for a room, mirroring YieldEstimator's deterministic
// path with the shared assumptions passed in. Used only to roll revenue up.
function roomGramsPerHarvest(room, benches, assumptions) {
  const { gPerMol, cycleDays, photoperiod, lightPPFD, co2Factor, vpdFactor } = assumptions;
  const factor = parseFloat(gPerMol) || 0;
  const days = parseFloat(cycleDays) || 0;
  const photoH = parseFloat(photoperiod) || 0;
  if (!benches.length || !factor || !days || !photoH || !lightPPFD) return 0;

  // Canopy interception proxy = the room's bench-floor utilization (same as the
  // per-room model's `efficiency`).
  const stats = computeStats(room, benches);
  const interceptFrac = (stats.efficiency ?? 100) / 100;

  let totalCanopyM2 = 0;
  benches.forEach((b) => {
    const t = Math.max(1, Math.round(b.tiers || 1));
    const sqft = (b.lengthIn * b.widthIn * t) / 144;
    totalCanopyM2 += sqft / SQFT_TO_M2;
  });
  if (totalCanopyM2 <= 0) return 0;

  const dli = (lightPPFD * (photoH * 3600)) / DLI_DIVISOR;
  const totalMols = dli * totalCanopyM2 * days;
  const baseGrams = totalMols * factor;
  const finalGrams = baseGrams * interceptFrac * co2Factor * vpdFactor;
  return Math.max(0, finalGrams);
}

// Normalize a project/doc into the list of rooms to roll up. Active room uses the
// flat working fields; the others use their own stored geometry.
export function getRollupRooms(doc) {
  const rooms = Array.isArray(doc.rooms) && doc.rooms.length > 0 ? doc.rooms : null;
  const activeId = doc.activeRoomId;
  if (!rooms) {
    return [{
      id: "room_1",
      name: doc.name || "Room 1",
      room: doc.room,
      settings: doc.settings || {},
      benches: doc.benches || [],
      lights: doc.lights || [],
      canopyMode: doc.canopyMode || "canopy",
    }];
  }
  return rooms.map((rm) => {
    const isActive = rm.id === activeId;
    return {
      id: rm.id,
      name: rm.name,
      room: isActive ? doc.room : (rm.room || doc.room),
      settings: isActive ? (doc.settings || {}) : (rm.settings || {}),
      benches: isActive ? (doc.benches || []) : (rm.benches || []),
      lights: isActive ? (doc.lights || []) : (rm.lights || []),
      objects: isActive ? (doc.objects || []) : (rm.objects || []),
      canopyMode: rm.canopyMode || "canopy",
    };
  });
}

// Roll every room's metrics up into facility totals. `assumptions` are the live
// shared values from the side panel so the totals stay consistent with the
// per-room panels.
//   wattsPerLight, rate ($/kWh), photoperiod (h), voltage,
//   calculateCanopy (bool), gPerMol, cycleDays, buffer (days), pricePerLb,
//   lightPPFD, co2Factor, vpdFactor
export function computeFacilityRollup(doc, assumptions = {}) {
  const {
    wattsPerLight = 1000,
    rate = 0.10,
    photoperiod = 12,
    voltage = 120,
    includeTopLights = true,
    includeEquipment = true,
    cycleDays = 60,
    buffer = 0,
    pricePerLb = 0,
  } = assumptions;

  const rooms = getRollupRooms(doc);

  let canopySqft = 0;
  let plants = 0;
  let benchCount = 0;
  let lightCount = 0;
  let totalWatts = 0;
  let equipmentWatts = 0;
  let canopyRoomCount = 0;
  let gramsPerHarvest = 0;

  rooms.forEach((r) => {
    const benches = r.benches || [];
    const stats = computeStats(r.room, benches);
    canopySqft += stats.plantingAreaSqft;
    plants += plantsForBenches(benches);
    benchCount += benches.length;

    const fixtures = topLights(benches);
    lightCount += fixtures;

    // Power — each source gated by its own include toggle (same rules as
    // PowerUsagePanel). Equipment Load tile always shows the true equipment
    // draw; only its contribution to Total Power is gated.
    const topW = includeTopLights ? fixtures * wattsPerLight : 0;
    const roomCanopyOn = isUclMode(r.canopyMode); // UCL bar or UCL on stands — same fixture
    if (roomCanopyOn) canopyRoomCount += 1;
    const canopyW = roomCanopyOn ? computeUnderCanopy(benches, voltage).watts : 0;
    const equipW = roomEquipmentWatts(r.objects || []);
    equipmentWatts += equipW;
    totalWatts += topW + canopyW + (includeEquipment ? equipW : 0);

    // CO₂ → yield: an enriched CO₂ tank in this room forces the Enriched (1.0)
    // factor; otherwise use the shared assumption. Evaluated per room.
    const roomCo2 = roomHasEnrichedCO2(r.objects || []) ? 1.0 : assumptions.co2Factor;
    gramsPerHarvest += roomGramsPerHarvest(r.room, benches, { ...assumptions, co2Factor: roomCo2 });
  });

  // Revenue / ROI — blended across the whole facility using the same cycles math.
  const days = parseFloat(cycleDays) || 0;
  const buf = parseFloat(buffer) || 0;
  const harvestsPerYear = days > 0 ? 365 / (days + buf) : 0;
  const lbsPerHarvest = gramsPerHarvest / GRAMS_PER_LB;
  const annualLbs = harvestsPerYear * lbsPerHarvest;
  const price = parseFloat(pricePerLb) || 0;
  const annualRevenue = annualLbs * price;

  const totalKw = totalWatts / 1000;
  const dailyKwh = totalKw * photoperiod;
  const annualKwh = dailyKwh * 365;
  const annualPowerCost = annualKwh * rate;
  // Blended operating ROI = (annual revenue − annual power cost) ÷ revenue.
  const roiPct = annualRevenue > 0 ? Math.round(((annualRevenue - annualPowerCost) / annualRevenue) * 100) : 0;

  return {
    roomCount: rooms.length,
    canopySqft: Math.round(canopySqft),
    plants: Math.round(plants),
    benchCount,
    lightCount,
    totalKw: Math.round(totalKw * 10) / 10,
    totalWatts: Math.round(totalWatts),
    equipmentKw: Math.round((equipmentWatts / 1000) * 10) / 10,
    equipmentWatts: Math.round(equipmentWatts),
    canopyRoomCount,
    totalAmps: voltage > 0 ? Math.round((totalWatts / voltage) * 10) / 10 : 0,
    lbsPerHarvest: Math.round(lbsPerHarvest * 10) / 10,
    annualLbs: Math.round(annualLbs),
    annualRevenue: Math.round(annualRevenue),
    annualPowerCost: Math.round(annualPowerCost),
    roiPct,
    harvestsPerYear: Math.round(harvestsPerYear * 10) / 10,
  };
}