import * as THREE from "three";

// The walkthrough's backdrop: a vertical gradient instead of a flat clear
// colour. The old flat 0xeef1f4 skipped tone mapping and sat in the same value
// band as the floor, so the scene had no horizon and nothing to read depth
// against. sRGB-tagged so it renders exactly as drawn (an sRGB background
// texture is not tone mapped). Cached per theme and shared across rebuilds;
// it is not a material, so the scene's dispose pass never touches it.
export const BACKDROP_THEME = "light"; // the one-constant switch: "light" | "dark"

const THEMES = {
  light: ["#f3f5f7", "#dfe3e7", "#c7ccd2"],
  dark: ["#3a3f46", "#262a30", "#15181c"],
};

const cache = {};
export function getBackdropTexture(theme = BACKDROP_THEME) {
  if (cache[theme]) return cache[theme];
  const [top, mid, bottom] = THEMES[theme] || THEMES.light;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache[theme] = tex;
  return tex;
}

export function setSceneBackdrop(scene, theme = BACKDROP_THEME) {
  scene.background = getBackdropTexture(theme);
}
