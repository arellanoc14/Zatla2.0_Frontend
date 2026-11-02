// Serialized scene keys for Walkthrough3D — pure functions, no three.js.
// docKey: rebuild the scene ONLY on structural data changes (not reference churn
// from the undo/redo store). Door pos/rotation is structural (re-cuts the wall),
// ducting rotation is structural (re-fits length); all other objects exclude
// pos/rotationDeg so moves/rotates reconcile in place (no rebuild flash). Room
// `offset` and activeRoomId are intentionally excluded (reconciled in place).
const serializeObj = (o) =>
  o.type === "door"
    ? { id: o.id, type: o.type, rotationDeg: o.rotationDeg, spec: o.spec, pos: o.pos }
    : o.type === "ducting"
      // Ducting length is fit BEFORE rotation (positionEquipmentGroup applies the
      // angle), so rotationDeg never changes the built geometry — exclude it so a
      // rotate animates the mesh in place (smooth spin) instead of rebuilding.
      ? { id: o.id, type: o.type, spec: o.spec }
      : { id: o.id, type: o.type, spec: o.spec };

export function computeDocKey(doc, visibility) {
  const hasRooms = Array.isArray(doc.rooms) && doc.rooms.length > 0;
  return JSON.stringify({
    equipment: doc.equipment,
    models: doc.models,
    globalModels: doc.globalModels,
    // Rebuild when a layer's visibility changes (view-only, but meshes must
    // be added/removed).
    visibility,
    ...(hasRooms
      ? {
          // Canonical MERGED room list: every room serializes its OWN stored
          // data, except the ACTIVE room, whose entry uses the live flat fields
          // (the same source the 3D renders it from). The key is therefore
          // independent of WHICH room is active — a pure room selection (active
          // room switch) never changes the key, so clicking rooms in 3D pans/
          // highlights in place with no rebuild flash. Structural edits to any
          // room's data still change the key and rebuild as before.
          // offset/lightModel/activeRoomId are excluded (reconciled in place).
          // spectrum is excluded too: slider ticks reconcile beams in place.
          // eslint-disable-next-line no-unused-vars
          rooms: doc.rooms.map(({ offset, lightModel, spectrum, ...rm }) => {
            const isActive = rm.id === doc.activeRoomId;
            const src = isActive
              ? {
                  ...rm,
                  room: doc.room,
                  settings: doc.settings,
                  benches: doc.benches || [],
                  lights: doc.lights || [],
                  doors: doc.doors || [],
                  objects: doc.objects || [],
                  // Same source the 3D render path uses for the active room.
                  rotationDeg: doc.rotationDeg || rm.rotationDeg || 0,
                }
              : { ...rm, rotationDeg: rm.rotationDeg || 0 };
            return { ...src, objects: (src.objects || []).map(serializeObj) };
          }),
        }
      : {
          // Legacy single-room doc (no rooms[]): flat fields are the identity.
          room: doc.room,
          benches: doc.benches,
          lights: doc.lights,
          settings: doc.settings,
          activeRotationDeg: doc.rotationDeg,
          canopyMode: doc.canopyMode || "canopy",
          objects: (doc.objects || []).map(serializeObj),
        }),
  });
}

// Stable signature of EVERY room's facility offset, kept OUT of docKey on
// purpose: a pure offset move (drag-commit or undo) changes this — but not
// docKey — so the offsets effect reconciles room groups in place (no rebuild).
export function computeRoomOffsetsKey(doc) {
  return JSON.stringify(
    (doc.rooms || []).map((rm) => [rm.id, rm.offset?.x || 0, rm.offset?.y || 0])
  );
}

// Current tier value shown in the toggle (most common tier among benches).
export function computeTierMode(benches) {
  const counts = {};
  (benches || []).forEach((b) => {
    const t = Math.max(1, Math.min(3, Math.round(b.tiers || 1)));
    counts[t] = (counts[t] || 0) + 1;
  });
  let best = 1, bestN = -1;
  [1, 2, 3].forEach((t) => { if ((counts[t] || 0) > bestN) { bestN = counts[t] || 0; best = t; } });
  return best;
}