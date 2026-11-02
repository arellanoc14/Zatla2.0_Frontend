import React, { useEffect, useId, useRef } from "react";
import { BANDS, WL_MAX, WL_MIN, Y_MAX, spectrumCurve, wavelengthToRgb } from "@/lib/spectrum";

const prefersReduced = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The curve eases toward the slider values, so dragging a slider morphs the
// chart instead of snapping. Paths are updated directly (no React re-render per frame).
const CW = 640;
const CH = 300;
const ML = 40;
const MR = 12;
const MT = 16;
const MB = 34;
const cx = (nm) => ML + ((nm - WL_MIN) / (WL_MAX - WL_MIN)) * (CW - ML - MR);
const cy = (v) => MT + (1 - v / Y_MAX) * (CH - MT - MB);

const GRAD_STOPS = (() => {
  const out = [];
  for (let nm = WL_MIN; nm <= WL_MAX; nm += 10) {
    const [r, g, b] = wavelengthToRgb(nm);
    out.push({ offset: ((nm - WL_MIN) / (WL_MAX - WL_MIN)) * 100, color: `rgb(${r},${g},${b})` });
  }
  return out;
})();

export default function SpectrumChart({ levels }) {
  const gradId = `zatla-spec-grad-${useId().replace(/:/g, "")}`;
  const areaRef = useRef(null);
  const lineRef = useRef(null);
  const cur = useRef(levels.slice());
  const target = useRef(levels);
  const raf = useRef(0);
  const last = useRef(0);

  const paint = () => {
    const pts = spectrumCurve(cur.current, 2);
    let d = "";
    pts.forEach(([nm, v], i) => { d += `${i ? "L" : "M"}${cx(nm).toFixed(1)} ${cy(v).toFixed(1)}`; });
    lineRef.current?.setAttribute("d", d);
    areaRef.current?.setAttribute("d", `${d}L${cx(WL_MAX).toFixed(1)} ${cy(0).toFixed(1)}L${cx(WL_MIN).toFixed(1)} ${cy(0).toFixed(1)}Z`);
  };

  useEffect(() => {
    target.current = levels;
    if (prefersReduced()) {
      cur.current = levels.slice();
      paint();
      return undefined;
    }
    const tick = (now) => {
      raf.current = 0;
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      const e = 1 - Math.exp(-dt * 9);
      let moving = false;
      for (let i = 0; i < cur.current.length; i += 1) {
        const d = target.current[i] - cur.current[i];
        if (Math.abs(d) > 0.05) { cur.current[i] += d * e; moving = true; } else cur.current[i] = target.current[i];
      }
      paint();
      if (moving) raf.current = requestAnimationFrame(tick);
    };
    last.current = performance.now();
    if (!raf.current) raf.current = requestAnimationFrame(tick);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const yTicks = [0, 10, 20, 30];
  const xTicks = [350, 400, 450, 500, 550, 600, 650, 700, 750];
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" role="img" aria-label="Emission spectrum of the light for the current channel settings">
      <defs>
        <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
          {GRAD_STOPS.map((s) => <stop key={s.offset} offset={`${s.offset}%`} stopColor={s.color} />)}
        </linearGradient>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={ML} x2={CW - MR} y1={cy(t)} y2={cy(t)} stroke="rgba(255,255,255,0.08)" />
          <text x={ML - 8} y={cy(t) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.45)">{t}</text>
        </g>
      ))}
      {BANDS.slice(1).map((b) => (
        <line key={b.id} x1={cx(b.from)} x2={cx(b.from)} y1={MT} y2={cy(0)} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
      ))}
      {BANDS.map((b) => (
        <text key={b.id} x={cx((b.from + b.to) / 2)} y={MT + 9} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)">{b.label}</text>
      ))}
      <path ref={areaRef} fill={`url(#${gradId})`} fillOpacity="0.92" />
      <path ref={lineRef} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" strokeLinejoin="round" />
      {xTicks.map((t) => (
        <text key={t} x={cx(t)} y={CH - 14} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">{t}</text>
      ))}
      <text x={(ML + CW - MR) / 2} y={CH - 1} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">Wavelength (nm)</text>
      <text transform={`translate(11 ${(MT + CH - MB) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">Relative intensity</text>
    </svg>
  );
}