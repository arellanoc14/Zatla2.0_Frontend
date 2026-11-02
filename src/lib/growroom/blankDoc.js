import { DEFAULT_SETTINGS } from "./catalog";
import { autoLayoutByRoom } from "./autolayout";
import { loadLocalDesign } from "./localDesign";

// Blank-room factory: a single empty room with default dimensions and no
// lights/doors/equipment. Used when the studio is opened without a saved project
// (no login, no ?id=) so the editor starts on a clean canvas.
//
// Lives here rather than in a component because BOTH studio entry points need it
// — the 2D section on the home page and the dedicated 3D page — and they must
// start from an identical document or switching views would rebuild the room.
export function buildBlankDoc() {
  const room = { lengthIn: 480, widthIn: 360, ceilingIn: 144 };
  const settings = { ...DEFAULT_SETTINGS };
  const { benches } = autoLayoutByRoom(room, settings, 4, "rolling", 1);
  const blankRoom = {
    id: "room_1",
    name: "Room 1",
    offset: { x: 0, y: 0 },
    room,
    settings,
    benches,
    lights: [],
    doors: [],
    objects: [],
    initialized: true,
  };
  return {
    name: "Untitled Room",
    customer: "",
    units: "imperial",
    room,
    settings,
    benches,
    lights: [],
    doors: [],
    objects: [],
    rotationDeg: 0,
    initialized: true,
    equipment: [],
    rooms: [blankRoom],
    activeRoomId: blankRoom.id,
    perRoomShipping: false,
    models: {},
    globalModels: {},
  };
}

// The design to open the studio with: whatever was last saved in this browser,
// or a fresh blank room. This is what carries a layout from the 2D section to the
// 3D page and back — LocalDesignSaver writes it, both entry points read it.
export function loadOrBlankDoc() {
  const saved = loadLocalDesign();
  const empty = saved
    && !(saved.rooms || []).some((r) => (r.benches || []).length)
    && !(saved.benches || []).length;
  return saved && !empty ? saved : buildBlankDoc();
}
