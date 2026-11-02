// Keep the rooms array in sync with the flat working fields on save.
//
// The studio's controls operate on the flat top-level doc fields (room, settings,
// benches, lights, doors) which are the working copy of the ACTIVE room. On save
// we write those fields back into the matching entry of the rooms array (matched
// by d.activeRoomId), preserving every other room plus each room's id/name/offset.
// The legacy top-level fields are still written by the caller exactly as before,
// so this remains additive and behavior with a single room is identical to today.

// Legacy top-level fields kept mirrored to the active room's flat working fields,
// so any consumer of the flat fields stays correct instead of reading a stale
// default. Write-to-both: the flat working copy already reflects the on-screen
// active room, so we persist it as the legacy top-level room/settings/etc. too.
export function mirrorLegacyTopLevelPayload(d) {
  return {
    room: d.room,
    settings: d.settings,
    benches: d.benches || [],
    lights: d.lights || [],
    doors: d.doors || [],
    objects: d.objects || [],
  };
}

// Given the studio doc `d`, return the updated `rooms` array with the active
// room's geometry replaced by the current flat working fields.
export function mirrorActiveRoomPayload(d) {
  const baseRooms = Array.isArray(d.rooms) && d.rooms.length > 0
    ? d.rooms
    : [{ id: d.activeRoomId || "room_1", name: "Room 1", offset: { x: 0, y: 0 } }];
  const activeId = d.activeRoomId;

  // Hard safety rule: if no valid room is actively selected, saving must not guess
  // and write the flat working copy into rooms[0]. That stale fallback could copy
  // one room's dimensions/benches into another room after deselecting, making rooms
  // appear to resize or move after Home/reload.
  if (!activeId || !baseRooms.some((r) => r.id === activeId)) return baseRooms;

  return baseRooms.map((r) => {
    if (r.id !== activeId) return r;
    // Preserve id / name / offset AND the room's committed rotationDeg. Only mirror
    // the active room's editable contents into its own matching slot.
    return {
      ...r,
      room: d.room,
      settings: d.settings,
      benches: d.benches || [],
      lights: d.lights || [],
      doors: d.doors || [],
      objects: d.objects || [],
    };
  });
}