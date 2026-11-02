import { useRef, useState } from "react";

// Bench-swap crossfade: when a scene rebuild is driven by a bench TYPE/TIER
// change, the last rendered frame is snapshotted (the persistent renderer keeps
// its framebuffer) and held over the canvas while the scene rebuilds, then
// faded out once the new bench GLBs are actually on screen — a smooth crossfade
// instead of a hard flash-load, with no blank gap. Purely visual: the rebuild
// pipeline, renderer/canvas reuse, layout and sync are untouched.
export default function useBenchSwapFade() {
  const prevKeyRef = useRef(null);
  const timerRef = useRef(null);
  // build() calls this once every new bench GLB has loaded.
  const onBenchesReadyRef = useRef(null);
  const [benchFade, setBenchFade] = useState(null); // { url, fading }

  // Call at the start of every rebuild. Detects a bench swap (key changed on a
  // non-first build) and, if so, snapshots the renderer's current frame.
  const maybeBeginFade = (benchSwapKey, renderer, isFirstBuild) => {
    const swapped = !isFirstBuild && prevKeyRef.current !== null &&
      prevKeyRef.current !== benchSwapKey && !!renderer;
    prevKeyRef.current = benchSwapKey;
    if (!swapped) return;
    try {
      const snap = renderer.domElement.toDataURL("image/png");
      if (timerRef.current) clearTimeout(timerRef.current);
      setBenchFade({ url: snap, fading: false });
      let fired = false;
      const startFade = () => {
        if (fired) return;
        fired = true;
        onBenchesReadyRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        setBenchFade((cur) => (cur ? { ...cur, fading: true } : cur));
        timerRef.current = setTimeout(() => setBenchFade(null), 800);
      };
      // Fade when the new bench models are ready; hard fallback so the overlay
      // can never stick if a load hangs.
      onBenchesReadyRef.current = startFade;
      timerRef.current = setTimeout(startFade, 8000);
    } catch (_) { /* snapshot failed — rebuild without the fade */ }
  };

  const disposeFadeTimer = () => { if (timerRef.current) clearTimeout(timerRef.current); };

  return { benchFade, maybeBeginFade, onBenchesReadyRef, disposeFadeTimer };
}