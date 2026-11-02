import React, { useEffect, useRef, useState } from "react";

// A 3D stage for the home page. `mount(host, opts)` builds a scene into the div
// and returns { setActive, setReducedMotion, setParallax?, dispose }; the stage
// runs its loop only while on screen and the tab is visible, honours reduced
// motion, feeds it pointer / device-tilt parallax, lazy-loads it when it comes
// near the viewport, and shows `poster` while loading or when WebGL is missing.
//
// One stage = one renderer = one loop. Strict cleanup on unmount, and the mount
// is guarded against React re-running the effect, so a scene can never be built
// twice into the same host (which is what "two models stacked" looks like).
export default function SceneStage({ mount, poster, posterAlt = "", className = "", eager = false, label }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | failed

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const motionMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth < 768;
    let scene = null, cancelled = false, onScreen = false, near = eager, started = false;

    const sync = () => scene?.setActive(onScreen && document.visibilityState === "visible");
    const start = () => {
      if (started || cancelled) return;
      started = true;
      setStatus("loading");
      scene = mount(host, {
        reducedMotion: !!motionMq?.matches,
        mobile,
        onReady: () => { if (!cancelled) setStatus("ready"); },
        onError: () => { if (!cancelled) setStatus("failed"); },
      });
      if (!scene) { setStatus("failed"); return; }
      sync();
    };

    // Near: start loading a screen ahead. On screen: run the loop.
    const ioNear = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near = true; start(); ioNear.disconnect(); } }, { rootMargin: "600px 0px" });
    ioNear.observe(host);
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { threshold: 0.05 });
    io.observe(host);
    if (near) start();
    document.addEventListener("visibilitychange", sync);
    const onMotion = (e) => scene?.setReducedMotion(e.matches);
    motionMq?.addEventListener?.("change", onMotion);

    // Parallax: the pointer over the stage on desktop, the phone's tilt on touch
    // devices. Values are -1..1 and the scene eases toward them.
    const onPointer = (e) => {
      if (!scene?.setParallax) return;
      const r = host.getBoundingClientRect();
      scene.setParallax(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onLeave = () => scene?.setParallax?.(0, 0);
    let tiltBase = null;
    const onTilt = (e) => {
      if (!scene?.setParallax || e.gamma == null || e.beta == null) return;
      if (!tiltBase) tiltBase = { g: e.gamma, b: e.beta }; // the way the phone is held is "level"
      const x = Math.max(-1, Math.min(1, (e.gamma - tiltBase.g) / 25));
      const y = Math.max(-1, Math.min(1, (e.beta - tiltBase.b) / 25));
      scene.setParallax(x, y);
    };
    let tiltOn = false;
    const enableTilt = async () => {
      // A scene without parallax (the hero cube) never asks iOS for motion access.
      if (tiltOn || (scene && !scene.setParallax)) return;
      try {
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return; // iOS: must follow a tap
        }
        window.addEventListener("deviceorientation", onTilt);
        tiltOn = true;
      } catch { /* no tilt */ }
    };
    if (mobile) {
      if (typeof DeviceOrientationEvent === "undefined" || typeof DeviceOrientationEvent.requestPermission !== "function") enableTilt();
      else window.addEventListener("touchend", enableTilt, { once: true, passive: true });
    } else {
      host.addEventListener("pointermove", onPointer);
      host.addEventListener("pointerleave", onLeave);
    }

    return () => {
      cancelled = true;
      ioNear.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motionMq?.removeEventListener?.("change", onMotion);
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("touchend", enableTilt);
      scene?.dispose();
      scene = null;
    };
  }, [mount, eager]);

  return (
    <div className={`relative ${className}`} aria-label={label} role="img" data-status={status}>
      <div ref={hostRef} className="absolute inset-0" />
      {/* The poster is gone the instant the live scene is ready: fading it out under
          a moving model reads as two fixtures stacked on each other. */}
      {poster && status !== "ready" && (
        <img
          src={poster}
          alt={posterAlt}
          draggable={false}
          className={`pointer-events-none absolute inset-0 h-full w-full select-none object-contain ${status === "failed" ? "opacity-100" : "opacity-60"}`}
        />
      )}
    </div>
  );
}
