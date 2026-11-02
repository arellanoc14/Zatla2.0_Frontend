// Layer system — groups objects into named categories for show/hide + lock-all.
//
// Layers are a VIEW concept layered on top of the existing data. They never change
// what objects exist, where they live, or how calcs/auto-layout work. Two controls
// per layer: visibility (transient view state) and lock (writes `locked` to the
// affected objects/benches/lights and persists).
//
// Equipment object types are mapped to a layer via EQUIP_LAYER. Benches and Lights
// are their own layers (whole arrays). Irrigation/Electrical are reserved
// placeholders with no object types yet.

import { Box, Sun, Snowflake, Droplets, Zap, DoorOpen, Wind } from "lucide-react";

// Layer ids (stable keys used for the visibility map + lock targeting).
export const LAYER_IDS = {
  BENCHES: "benches",
  LIGHTS: "lights",
  HVAC: "hvac",
  IRRIGATION: "irrigation",
  ELECTRICAL: "electrical",
  DOORS: "doors",
  CO2: "co2",
};

// Which equipment object types belong to which layer.
const EQUIP_LAYER = {
  minisplit: LAYER_IDS.HVAC,
  dehumidifier: LAYER_IDS.HVAC,
  fan: LAYER_IDS.HVAC,
  ducting: LAYER_IDS.HVAC,
  door: LAYER_IDS.DOORS,
  co2tank: LAYER_IDS.CO2,
};

// Map any equipment object to its layer id (null if unknown).
export function objectLayerId(obj) {
  return EQUIP_LAYER[obj?.type] || null;
}

// Ordered layer definitions shown in the panel. `source` tells the counter where
// the objects live: "benches"/"lights" = top-level arrays, "objects" = equipment.
export const LAYERS = [
  { id: LAYER_IDS.BENCHES, label: "Benches", icon: Box, source: "benches", color: "text-emerald-500" },
  { id: LAYER_IDS.LIGHTS, label: "Lights", icon: Sun, source: "lights", color: "text-amber-500" },
  { id: LAYER_IDS.HVAC, label: "HVAC", icon: Snowflake, source: "objects", color: "text-sky-500" },
  { id: LAYER_IDS.CO2, label: "CO₂", icon: Wind, source: "objects", color: "text-rose-500" },
  { id: LAYER_IDS.DOORS, label: "Doors", icon: DoorOpen, source: "objects", color: "text-violet-500" },
  { id: LAYER_IDS.IRRIGATION, label: "Irrigation", icon: Droplets, source: "objects", color: "text-cyan-500", reserved: true },
  { id: LAYER_IDS.ELECTRICAL, label: "Electrical", icon: Zap, source: "objects", color: "text-yellow-500", reserved: true },
];

// Count the objects on a given layer for the active room (display only).
export function countLayer(layer, doc) {
  if (layer.reserved) return 0;
  if (layer.source === "benches") return (doc.benches || []).length;
  if (layer.source === "lights") return (doc.lights || []).length;
  return (doc.objects || []).filter((o) => objectLayerId(o) === layer.id).length;
}

// Default visibility map — every layer visible.
export function defaultVisibility() {
  const v = {};
  LAYERS.forEach((l) => { v[l.id] = true; });
  return v;
}

// Is a bench layer hidden? (helper for the 2D/3D renderers)
export function isLayerHidden(visibility, layerId) {
  return visibility && visibility[layerId] === false;
}

// Is a given equipment object hidden by its layer's visibility?
export function isObjectHidden(visibility, obj) {
  const id = objectLayerId(obj);
  if (!id) return false;
  return isLayerHidden(visibility, id);
}

// Are ALL objects on a layer currently locked? (drives the lock toggle state)
export function isLayerLocked(layer, doc) {
  if (layer.reserved) return false;
  let arr;
  if (layer.source === "benches") arr = doc.benches || [];
  else if (layer.source === "lights") arr = doc.lights || [];
  else arr = (doc.objects || []).filter((o) => objectLayerId(o) === layer.id);
  if (arr.length === 0) return false;
  return arr.every((o) => !!o.locked);
}