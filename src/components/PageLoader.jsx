import React from "react";
import ZatlaLogo from "@/components/home/ZatlaLogo";

// The loading screen shown while a page's code is on its way (see the lazy
// routes in App.jsx). Two rising arrows beside a three-ring molecule, drawn as
// outlines that light up and cycle amber -> green -> violet, with the wordmark
// on its own line underneath — the mark never sits over the artwork.
//
// The whole thing is inline SVG and CSS (a few KB, crisp at any size) rather
// than a video, so it costs nothing to show and never has to buffer.
//
// It stays invisible for the first 140ms: a page whose chunk is already cached
// arrives faster than that, and flashing a loader at someone for three frames
// looks like a glitch. Slow loads get the full animation.
//
// Geometry: pointy-top hexagons, circumradius 30, fused into a triangle —
// A(165,110) bottom-left, B(191,65) top, C(217,110) bottom-right — with bonds
// off B's two upper corners and off A's lower-left corner.
const GLYPH = [
  // the two rising arrows
  "M33 10 L56 55 L46.5 55 L46.5 101 L19.5 101 L19.5 55 L10 55 Z",
  "M87 34.5 L104.5 68 L95.5 68 L95.5 97 L78.5 97 L78.5 68 L69.5 68 Z",
  // ring A, ring B, ring C
  "M165 80 L191 95 L191 125 L165 140 L139 125 L139 95 Z",
  "M191 35 L217 50 L217 80 L191 95 L165 80 L165 50 Z",
  "M217 80 L243 95 L243 125 L217 140 L191 125 L191 95 Z",
  // bonds: up from B's upper-left, up-right from B's upper-right, left from A's lower-left
  "M165 50 L165 28.5",
  "M217 50 L231.5 35.5",
  "M139 125 L80 127.5",
];
const NODES = [
  [165, 22, 6.5],
  [236, 31, 6.5],
  [73, 128, 7],
];

export default function PageLoader({ label = "Loading" }) {
  return (
    <div className="pl-wrap" role="status" aria-live="polite" aria-label={label}>
      <div className="pl-stack">
        <svg className="pl-glyph" viewBox="0 0 248 150" aria-hidden="true" focusable="false">
          <g className="pl-ink" fill="none" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
            {GLYPH.map((d, i) => (
              <path key={d} d={d} className="pl-el" style={{ "--i": i }} />
            ))}
            {NODES.map(([cx, cy, r], i) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} className="pl-el" style={{ "--i": GLYPH.length + i }} />
            ))}
          </g>
        </svg>
        <ZatlaLogo className="pl-mark" height="1.75rem" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
