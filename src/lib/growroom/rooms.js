import { DEFAULT_SETTINGS } from "@/lib/growroom/catalog";

// Multi-room data model helpers.
//
// A Project may hold a `rooms` array; each room owns its own dimensions,
// settings, benches, lights and doors, positioned at `offset` within the
// facility. `models` stays at the Project level (shared library) and is never
// moved into a room. `rooms[0]` is the active/primary room.
//
// These helpers are NON-DESTRUCTIVE: they read from `rooms[0]` when present,
// otherwise they wrap the project's legacy top-level fields into a room shape
// on the fly. They never delete or rewrite the legacy fields.

const DEFAULT_ROOM = { lengthIn: 480, widthIn: 360, ceilingIn: 144 };

// Build the canonical rooms[0] object from a project's legacy top-level fields.
// Used both for the in-memory read path and the persisted backfill migration.
export function roomFromLegacy(project) {
  return {
    id: "room_1",
    name: "Room 1",
    offset: { x: 0, y: 0 },
    room: project.room || { ...DEFAULT_ROOM },
    settings: project.settings || { ...DEFAULT_SETTINGS },
    benches: project.benches || [],
    lights: project.lights || [],
    doors: project.doors || [],
    // Smart equipment objects (incl. doors placed as objects) — must round-trip,
    // so carry them through the legacy-wrap path instead of dropping to [].
    objects: project.objects || [],
  };
}

// Return the active room for a project. Honors the saved activeRoomId so reload
// reopens (and re-hydrates the rotation of) the room the user was last editing;
// falls back to rooms[0], then to wrapping the legacy top-level fields for
// not-yet-migrated single-room projects.
export function getActiveRoom(project) {
  if (Array.isArray(project?.rooms) && project.rooms.length > 0) {
    if (project.activeRoomId) {
      const match = project.rooms.find((r) => r.id === project.activeRoomId);
      if (match) return match;
    }
    return project.rooms[0];
  }
  return roomFromLegacy(project);
}

// Facility footprint — falls back to the active room's dimensions so a
// single-room project's facility matches the room exactly.
export function getFacility(project, activeRoom) {
  if (project?.facility?.widthIn && project?.facility?.lengthIn) {
    return project.facility;
  }
  const r = (activeRoom || getActiveRoom(project)).room || DEFAULT_ROOM;
  return { widthIn: r.widthIn, lengthIn: r.lengthIn };
}

// True when a project still needs the rooms[0] + facility backfill written.
export function needsMigration(project) {
  return !Array.isArray(project?.rooms) || project.rooms.length === 0;
}

// Produce the NON-DESTRUCTIVE migration patch for a project: wrap its current
// top-level fields into rooms[0] and set facility to match that room. Legacy
// top-level fields are intentionally left untouched. Returns null when no
// migration is needed.
export function buildMigrationPatch(project) {
  if (!needsMigration(project)) return null;
  const room0 = roomFromLegacy(project);
  return {
    rooms: [room0],
    facility: { widthIn: room0.room.widthIn, lengthIn: room0.room.lengthIn },
  };
}