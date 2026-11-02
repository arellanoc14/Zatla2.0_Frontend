import React, { useEffect, useRef } from "react";

// A soft ring that follows the pointer with a little lag and opens up over
// anything clickable. Pointer-fine devices only (never on touch), off with
// reduced motion, and purely decorative: the native cursor stays.
export default function Cursor() {
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine)").matches || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ring = ringRef.current, dot = dotRef.current;
    if (!ring || !dot) return undefined;
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0, shown = false, hot = false;
    const loop = () => {
      rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${hot ? 1.8 : 1})`;
      dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      raf = (Math.abs(x - rx) > 0.2 || Math.abs(y - ry) > 0.2) ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const onMove = (e) => {
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; ring.style.opacity = "1"; dot.style.opacity = "1"; rx = x; ry = y; }
      // The top links (Design / Shop / Cart) light up a pill of their own on
      // hover, so the ring and dot step aside there instead of circling it.
      const tuck = !!e.target.closest?.(".top-link");
      hot = !tuck && !!e.target.closest?.("a, button, [role=button], input, select, textarea");
      ring.classList.toggle("hot", hot);
      ring.classList.toggle("tucked", tuck);
      dot.classList.toggle("tucked", tuck);
      wake();
    };
    const onLeave = () => { shown = false; ring.style.opacity = "0"; dot.style.opacity = "0"; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => { window.removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("mouseleave", onLeave); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
