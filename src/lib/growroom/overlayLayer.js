// Editing overlays — the room highlight, the equipment selection box, the
// room-drag guides, the dimension labels, the floor grid — live on their own
// camera layer. Presentation mode is then ONE call per camera,
// layers.disable(OVERLAY_LAYER), with every overlay's own visibility logic
// (highlight fades, the Dimensions toggle, showOutline) left untouched, and
// engineering mode is layers.enable. Layers are per object, not inherited, so
// an overlay is marked where its meshes are CREATED (a child added later to a
// marked group would land back on layer 0). The Raycaster and the shadow
// camera see layer 0 only, so nothing on this layer is ever picked or casts.
export const OVERLAY_LAYER = 1;

export function markOverlay(obj) {
  obj.traverse((o) => o.layers.set(OVERLAY_LAYER));
  return obj;
}
