import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
// Shared loader + a tiny per-URL cache so a model used on many benches loads once.
const loader = new GLTFLoader();

// Draco mesh compression decoder — REQUIRED for .glb files that declare
// "extensionsRequired": ["KHR_draco_mesh_compression"]. Without a working
// DRACOLoader attached, GLTFLoader rejects/empties any such file.
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
// Force the WASM decoder (faster + more reliable than the JS fallback) and PRELOAD
// it now, at module init, so the decoder worker is fully ready before the first
// bench GLB is loaded. Without preloading, the very first Draco-compressed model
// can race the worker's async wasm fetch and reject with an opaque loader error —
// which is exactly the "model doesn't render" symptom for Draco-required files.
dracoLoader.setDecoderConfig({ type: "wasm" });
dracoLoader.preload();
// Attach the SAME draco-enabled loader used for both upload validation and scene
// rendering, BEFORE any load/parse call below.
loader.setDRACOLoader(dracoLoader);
console.log("DRACOLoader attached + preloaded ✓", { decoderPath: DRACO_DECODER_PATH });
// meshopt compression — some GLBs use EXT_meshopt_compression instead of Draco.
// Registering the decoder lets the same loader handle those files too.
loader.setMeshoptDecoder(MeshoptDecoder);

// KTX2 / Basis Universal compressed textures (KHR_texture_basisu). Without this,
// a GLB using KTX2 textures fails to parse cleanly → the upload row silently
// reverts to "Upload" with no error. Transcoder hosted on gstatic.
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath("https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/");
try {
  const _probe = new THREE.WebGLRenderer();
  ktx2Loader.detectSupport(_probe);
  _probe.dispose();
} catch (e) {
  console.warn("KTX2 detectSupport probe failed (non-fatal):", e?.message || e);
}
loader.setKTX2Loader(ktx2Loader);
console.log("KTX2Loader attached ✓");

const cache = new Map(); // url -> Promise<THREE.Object3D> (the loaded scene)

export function clearGLBCache() {
  cache.clear();
}

export function loadGLB(url, onProgress) {
  // Guard: never hand the loader a null/empty URL — that produces an opaque
  // "Loader error". Reject clearly instead so the caller can skip/report it.
  if (typeof url !== "string" || url.trim() === "") {
    return Promise.reject(new Error("No model URL provided (empty or null)"));
  }
  // A cached (already-decoded) model is effectively 100% loaded — report it so
  // callers can dismiss their loader immediately instead of waiting on events.
  if (cache.has(url)) {
    if (typeof onProgress === "function") onProgress(100);
    return cache.get(url);
  }
  const p = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      (evt) => {
        // Forward download progress as a 0–100 percentage when the server sends
        // a Content-Length (lengthComputable); otherwise leave it indeterminate.
        if (typeof onProgress === "function" && evt && evt.lengthComputable && evt.total) {
          onProgress(Math.min(99, (evt.loaded / evt.total) * 100));
        }
      },
      (err) => {
        cache.delete(url); // retry on next call instead of caching the failure forever
        console.error("[GLB] load failed:", errMessage(err), "→", url);
        reject(new Error(`${errMessage(err)} (${url})`));
      }
    );
  });
  cache.set(url, p);
  return p;
}

// Fully fetch + parse a GLB through the same loader (Draco/meshopt/uncompressed)
// to VERIFY it decodes before we persist its URL. Resolves with the decoded scene
// or rejects with the real error so the UI can surface it. Logs each step.
// Coerce any thrown value (Error, ErrorEvent, plain object, string) into a
// readable message so callers never end up showing "[object Object]".
export function errMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  if (err.error?.message) return err.error.message; // GLTFLoader sometimes wraps in ErrorEvent
  if (err.type) return `Loader error (${err.type})`;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export async function parseGLBFromUrl(url) {
  console.log("[GLB] fetching URL", url);
  let res;
  try {
    res = await fetch(url);
  } catch (netErr) {
    console.error("[GLB] network/CORS error", netErr);
    throw new Error(`Network/CORS error fetching ${url}: ${errMessage(netErr)}`);
  }
  console.log("[GLB] response status", res.status, res.statusText, url);
  if (!res.ok) throw new Error(`Download failed (${res.status} ${res.statusText}) for ${url}`);

  const buffer = await res.arrayBuffer();
  console.log("[GLB] parse start", `${(buffer.byteLength / 1024).toFixed(0)}KB`, url);
  // Race the parse against a 30s timeout so a hang (unsupported compression/texture)
  // surfaces a clear error instead of leaving the upload row stuck/silently reverted.
  const scene = await Promise.race([
    new Promise((resolve, reject) => {
      loader.parse(buffer, "",
        (gltf) => resolve(gltf.scene),
        (err) => { console.error("[GLB] decode/parse failed:", errMessage(err), "→", url); reject(new Error(`Decode failed: ${errMessage(err)}`)); }
      );
    }),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error("Parse timed out (30s) — file may use an unsupported texture/compression format or be too large.")),
      30000
    )),
  ]);
  if (!scene) throw new Error("Parsed GLB contained no scene");
  // Guard against an empty scene (no meshes) — surfaces a clear reason instead of
  // a silent revert.
  let meshCount = 0;
  scene.traverse((o) => { if (o.isMesh) meshCount++; });
  if (meshCount === 0) throw new Error("GLB parsed but contains no meshes — re-export including the mesh, or the file may use an unsupported feature.");
  console.log("[GLB] parse success", { meshCount }, url);
  // Prime the cache so the subsequent render reuses this exact decoded result.
  cache.set(url, Promise.resolve(scene));
  return scene;
}

// Returns a fresh clone of the loaded model, recentred at the local origin and
// scaled so its footprint exactly matches targetW × targetL (inches) and it sits
// ON the ground (its base at y=0). Geometry is never modified — only the wrapping
// group is transformed.
//
//   targetW      → size along X (inches)
//   targetL      → size along Z (inches)
//   targetH      → optional explicit height (inches). When provided, Y is scaled to
//                  this value regardless of the model's native proportions. Use this
//                  to force the 4x4 and 4x8 models to the same physical height.
//   uniform      → single uniform scale (aspect-preserving). Ignored when targetH set.
//   baseRotationY → apply a Y-axis rotation BEFORE measuring the bounding box,
//                   then reset it — bakes orientation correction into the model's
//                   base so scaling is computed against the rotated footprint.
// Force every material on a loaded GLB holder fully opaque + double-sided so it
// never renders see-through (some exported equipment models ship with transparency
// enabled). Optionally runs `onMaterial` per mesh (e.g. to track it for disposal).
export function forceOpaqueDoubleSided(holder, onMaterial) {
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.side = THREE.DoubleSide;
      m.alphaTest = 0;
      m.needsUpdate = true;
    });
    if (onMaterial) onMaterial(o.material);
  });
}

export function fitModelToFootprint(scene, targetW, targetL, { uniform = true, targetH = null, baseRotationY = 0, baseRotationX = 0, visualWidthScale = 1, visualLengthScale = 1, lengthAxis = null } = {}) {
  const model = scene.clone(true);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  // Apply base rotation correction before bounding-box measurement so the
  // scaled dimensions match the rotated model's actual footprint.
  const measure = () => {
    model.rotation.set(baseRotationX, baseRotationY, 0);
    model.updateMatrixWorld();
    box.setFromObject(model);
    box.getSize(size);
    box.getCenter(center);
  };
  measure();

  // ORIENTATION NORMALIZATION (lengthAxis: "z").
  //
  // A GLB can be authored with its long horizontal axis on either X or Z, and
  // nothing below rotates it — the scale factors are just assigned to whichever
  // axis is long. So a caller could not know which way the fitted model ends up
  // pointing, and the 3D view papered over it with a hardcoded +90 deg on every
  // bench. Re-uploading a model authored the other way then turned the whole room
  // sideways.
  //
  // With lengthAxis "z", a model authored long-along-X gets a quarter turn baked
  // into its base rotation, so after fitting the LENGTH always runs along local Z
  // and the WIDTH along local X — whichever way the GLB was exported. Callers can
  // then use the bench's own rotation and nothing else.
  if (lengthAxis === "z" && (size.x || 1) > (size.z || 1)) {
    baseRotationY += Math.PI / 2;
    measure();
  }

  const srcX = size.x || 1;
  const srcZ = size.z || 1;
  const srcH = size.y || 1;

  // Recentre the model so its footprint centre + base sit at the local origin.
  model.position.set(-center.x, -box.min.y, -center.z);
  // Keep the base rotation — it was accounted for in the bounding box, and the
  // caller applies per-bench rotation to the holder on top of it.

  const holder = new THREE.Group();
  holder.add(model);

  // Decide which NATIVE axis is the model's long horizontal axis, and scale that
  // axis to targetL (length) and the other to targetW (width). Critically, apply
  // each factor to the axis it was MEASURED from — not blindly to X/Z — so a GLB
  // modeled long-along-X is handled the same as one modeled long-along-Z.
  const xIsLong = srcX >= srcZ;
  // width factor uses the SHORTER native horizontal dim; length factor the LONGER.
  const wFactor = targetW / (xIsLong ? srcZ : srcX); // → short axis
  const lFactor = targetL / (xIsLong ? srcX : srcZ); // → long axis
  // Now assign back to the real X and Z axes. `visualWidthScale`/`visualLengthScale`
  // stretch ONLY the width/length axes of the rendered model (display normalization,
  // e.g. tier racks with empty native margin) — never the footprint targets or math.
  const scaleX = (xIsLong ? lFactor * visualLengthScale : wFactor * visualWidthScale);
  const scaleZ = (xIsLong ? wFactor * visualWidthScale : lFactor * visualLengthScale);

  if (targetH !== null) {
    // Independent per-axis scaling: X and Z fill the footprint exactly, Y hits targetH.
    const scaleY = targetH / srcH;
    holder.scale.set(scaleX, scaleY, scaleZ);
    holder.userData.fittedHeight = targetH;
  } else if (uniform) {
    const s = Math.min(scaleX, scaleZ);
    holder.scale.setScalar(s);
    holder.userData.fittedHeight = srcH * s;
  } else {
    // Stretch X/Z to fill; Y driven by the width scale so all 48"-wide benches
    // share the same height.
    const scaleY = scaleX;
    holder.scale.set(scaleX, scaleY, scaleZ);
    holder.userData.fittedHeight = srcH * scaleY;
  }
  return holder;
}