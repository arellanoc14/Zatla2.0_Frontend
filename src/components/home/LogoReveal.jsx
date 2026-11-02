import React, { useEffect, useRef, useState } from "react";
import { ZATLA_LOGO_SRC, ZATLA_LOGO_RATIO } from "@/components/home/ZatlaLogo";

const SEEN_KEY = "zatla-logo-intro-seen";
const SAMPLE_W = 420;
const SAMPLE_H = Math.round(SAMPLE_W / ZATLA_LOGO_RATIO);

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

// The ZATLA wordmark assembles itself from a brief scatter of its own pixels on
// first load: we sample the real logo PNG's opaque pixels (position + exact
// color), let a few hundred/thousand tiny dots drift in from random directions
// on a canvas laid exactly over the logo's box, then crossfade to the plain
// <img> once they've converged — so what's left is the crisp, native-rendered
// mark, not a canvas rasterization. Runs once per session; skipped entirely
// under prefers-reduced-motion. The real <img> always occupies the box (at
// opacity 0 during the intro) so there is never any layout shift, and nothing
// here delays the rest of the header. The <canvas> stays in the DOM the whole
// time (at opacity 0 outside the intro window) so its ref is always available
// the moment the effect needs to size and draw into it — no mount race.
export default function LogoReveal({ title = "ZATLA" }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const [imgOpacity, setImgOpacity] = useState(1);
  const [canvasOpacity, setCanvasOpacity] = useState(0);

  useEffect(() => {
    let reduced = false;
    let already = true;
    try { reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { /* noop */ }
    try { already = !!sessionStorage.getItem(SEEN_KEY); } catch { already = true; }
    if (reduced || already) { setImgOpacity(1); return undefined; }

    let cancelled = false;
    setImgOpacity(0);

    const run = async () => {
      try {
        const img = new Image();
        img.src = ZATLA_LOGO_SRC;
        if (img.decode) await img.decode().catch(() => {});
        if (cancelled || !imgRef.current || !canvasRef.current) { setImgOpacity(1); return; }

        const off = document.createElement("canvas");
        off.width = SAMPLE_W;
        off.height = SAMPLE_H;
        const octx = off.getContext("2d");
        octx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
        const data = octx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

        const points = [];
        for (let y = 0; y < SAMPLE_H; y++) {
          for (let x = 0; x < SAMPLE_W; x++) {
            const i = (y * SAMPLE_W + x) * 4;
            const a = data[i + 3];
            if (a > 80) points.push({ x, y, r: data[i], g: data[i + 1], b: data[i + 2], a: a / 255 });
          }
        }
        if (!points.length || cancelled || !imgRef.current || !canvasRef.current) { setImgOpacity(1); return; }

        for (let i = points.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [points[i], points[j]] = [points[j], points[i]];
        }
        const mobile = (() => { try { return window.matchMedia("(max-width: 640px)").matches; } catch { return false; } })();
        const maxParticles = mobile ? 420 : 1100;
        const picked = points.slice(0, Math.min(maxParticles, points.length));

        const box = imgRef.current.getBoundingClientRect();
        if (!box.width || !box.height) { setImgOpacity(1); return; }
        const scaleX = box.width / SAMPLE_W;
        const scaleY = box.height / SAMPLE_H;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(box.width * dpr);
        canvas.height = Math.ceil(box.height * dpr);
        canvas.style.width = `${box.width}px`;
        canvas.style.height = `${box.height}px`;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);

        const DUR = 1500;
        const SPREAD = Math.max(box.width, box.height) * 1.1;

        const particles = picked.map((p) => {
          const angle = Math.random() * Math.PI * 2;
          const dist = SPREAD * (0.5 + Math.random() * 0.6);
          const tx = p.x * scaleX;
          const ty = p.y * scaleY;
          return {
            sx: tx + Math.cos(angle) * dist,
            sy: ty + Math.sin(angle) * dist,
            tx,
            ty,
            color: `rgba(${p.r},${p.g},${p.b},`,
            alpha: p.a,
            size: 1 + Math.random() * 0.8,
            startSize: 2.4 + Math.random() * 1.6,
            delay: Math.random() * DUR * 0.45,
            dur: DUR * (0.55 + Math.random() * 0.35),
          };
        });

        setCanvasOpacity(1);
        const t0 = performance.now();

        const frame = (now) => {
          if (cancelled) return;
          const elapsed = now - t0;
          ctx.clearRect(0, 0, box.width, box.height);
          let allDone = true;
          for (const p of particles) {
            const local = elapsed - p.delay;
            const t = Math.max(0, Math.min(1, local / p.dur));
            if (t < 1) allDone = false;
            const e = easeOutQuint(t);
            const x = p.sx + (p.tx - p.sx) * e;
            const y = p.sy + (p.ty - p.sy) * e;
            const size = p.startSize + (p.size - p.startSize) * easeOutCubic(t);
            const op = t <= 0 ? 0 : Math.min(1, t * 1.6) * p.alpha;
            if (op <= 0.01) continue;
            ctx.beginPath();
            ctx.fillStyle = p.color + op.toFixed(3) + ")";
            if (t < 0.85) {
              ctx.shadowColor = "rgba(160,230,190,0.35)";
              ctx.shadowBlur = 2.5 * (1 - t);
            } else {
              ctx.shadowBlur = 0;
            }
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          }
          if (elapsed < DUR + 260 && !allDone) {
            rafRef.current = requestAnimationFrame(frame);
          } else {
            setImgOpacity(1);
            let fade = 1;
            const fadeStep = () => {
              if (cancelled) return;
              fade -= 0.08;
              setCanvasOpacity(Math.max(0, fade));
              if (fade > 0) {
                rafRef.current = requestAnimationFrame(fadeStep);
              } else {
                try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* noop */ }
              }
            };
            rafRef.current = requestAnimationFrame(fadeStep);
          }
        };
        rafRef.current = requestAnimationFrame(frame);
      } catch {
        if (!cancelled) setImgOpacity(1);
      }
    };

    run();
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <span style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
      <img
        ref={imgRef}
        src={ZATLA_LOGO_SRC}
        alt={title}
        draggable={false}
        className="inline-block select-none"
        style={{ width: "auto", opacity: imgOpacity, transition: "opacity 260ms ease" }}
        width={2184}
        height={569}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, opacity: canvasOpacity, pointerEvents: "none" }}
      />
    </span>
  );
}
