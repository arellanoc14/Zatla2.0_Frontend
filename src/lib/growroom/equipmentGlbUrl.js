// Resolve the uploaded GLB URL for a smart-equipment object TYPE from the shared
// model library slots. Returns a non-empty string when a GLB exists for that type,
// else null. Used so the 3D scene can hide the procedural placeholder mesh until
// the GLB swaps in (no flash of the old procedural model), and reveal it on error.
export function equipmentGlbUrlForType(type, models = {}) {
  const url = {
    fan: models.fanUrl,
    minisplit: models.acUrl,
    controller: models.controllerUrl,
    co2tank: models.co2TankUrl,
    dehumidifier: models.dehumidifierUrl,
    ducting: models.ductingUrl,
  }[type];
  return typeof url === "string" && url.trim() !== "" ? url : null;
}