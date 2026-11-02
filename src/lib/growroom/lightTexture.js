import * as THREE from "three";

// Shared loader + cache so the grow-light image downloads once and is reused
// across every fixture plane in the scene.
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin("anonymous");
const texCache = new Map(); // url -> THREE.Texture

export function loadLightTexture(url) {
  if (texCache.has(url)) return texCache.get(url);
  const tex = texLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set(url, tex);
  return tex;
}

export function clearLightTextureCache() {
  texCache.forEach((t) => t.dispose());
  texCache.clear();
}

// Build a flat, top-facing fixture plane carrying the uploaded grow-light image
// as an emissive/diffuse texture. The plane spans wIn × dIn (the fixture footprint)
// and the image is letterboxed onto it so its aspect ratio is preserved (no
// stretching). Returns a THREE.Mesh laid flat in the XZ plane, image facing up.
//
//   wIn, dIn      → footprint in inches (X = width, Z = depth)
//   imgAspect     → native image aspect (w/h); used to fit without distortion
export function buildLightTexturePlane(wIn, dIn, texture, imgAspect, { grow = false } = {}) {
  // Fit the image inside the footprint preserving aspect ratio. The fixture
  // footprint aspect is wIn/dIn; scale the plane so the image is contained.
  const footAspect = wIn / dIn;
  let planeW = wIn;
  let planeD = dIn;
  if (imgAspect > footAspect) {
    // Image is wider than the footprint → width-bound, shrink depth.
    planeD = wIn / imgAspect;
  } else {
    // Image is taller/narrower → depth-bound, shrink width.
    planeW = dIn * imgAspect;
  }

  const geo = new THREE.PlaneGeometry(planeW, planeD);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: grow ? 0.9 : 0.6,
    metalness: 0.1,
    roughness: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  // Lay flat, image facing up.
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}