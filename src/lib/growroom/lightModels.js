// The selectable grow-light fixture MODELS and their GlobalModels library
// slots. Visual model choice only — placement, wattage, PPFD and yield math are
// untouched.
//
// Only one option is offered: Zatla Growlight. It keeps the internal key
// "phoenix" because that key is the default used across the codebase
// (Walkthrough3D, roomLights, facility, mergeRooms) and is already stored on
// existing rooms. Rooms saved with any older key (griffin, ultra, chameleon,
// eagle) fall back to this entry via lightSlotForModel below. It renders
// whatever GLB is in the growLightUrl slot.
export const LIGHT_MODELS = [
  { key: "phoenix", label: "Zatla Growlight", slot: "growLightUrl" },
];

export function lightSlotForModel(key) {
  return (LIGHT_MODELS.find((m) => m.key === key) || LIGHT_MODELS[0]).slot;
}
