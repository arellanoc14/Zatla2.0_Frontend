// Shadow-pass flags for the live 3D scene, set once per object at the places
// that add geometry (applyBenchMaterials for every GLB holder, finishSwap for
// swapped equipment, the end of build() for everything procedural). Nothing
// here runs per frame. three.js defaults castShadow/receiveShadow to false, so
// an object this never visits (a light-texture plane that lands later, a PPFD
// tile) simply stays out of the shadow pass.
//
// userData.shadowMode on a node is inherited by its whole subtree:
//   "none"     neither casts nor receives: overlays, hit boxes, the ceiling deck
//   "receive"  receives only: floors, walkway, walls (a floor casting onto itself
//              is acne; a 10ft wall would throw an 80in strip across the benches)
//   absent     casts and receives: benches, racks, fixtures, equipment
// Whatever the tag, a mesh never casts when its material is a glow sprite
// (userData.glow), a depth-test-off overlay, or an invisible hit box, and a
// spinning fan blade (userData.spinFan subtree) is treated as "none": blades
// rotate without dirtying the shadow map, so a cast shadow would freeze mid-spin.
// Sprites and lines cannot cast and are left alone. material.transparent is
// deliberately NOT a rule: roomLights.setOpacity flips it during a crossfade
// and these flags are sticky.
export function setShadowFlags(root) {
  const walk = (obj, inherited) => {
    const u = obj.userData || {};
    const mode = u.shadowMode || (u.spinFan ? "none" : inherited);
    if (obj.isMesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const glow = mats.some((m) => m?.userData?.glow);
      const noCast = glow || mats.some((m) => !m || m.depthTest === false || m.visible === false);
      obj.castShadow = mode === undefined && !noCast;
      obj.receiveShadow = mode !== "none" && !glow;
    }
    obj.children.forEach((c) => walk(c, mode));
  };
  walk(root, undefined);
}
