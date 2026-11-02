import React from "react";
import ZatlaLogo from "@/components/home/ZatlaLogo";

// Loading screen for the 3D layout: the ZATLA wordmark, extruded into a few stacked
// layers so it reads as a solid 3D object, slowly turning in perspective over a soft
// green glow. Pure CSS (no asset download). With reduced motion it stays still and
// only breathes.
const CSS = `
.zl3d{display:flex;flex-direction:column;align-items:center;gap:2.2rem;user-select:none}
.zl3d-stage{position:relative;perspective:900px;padding:1.2rem 2rem}
.zl3d-glow{position:absolute;left:50%;top:50%;width:120%;height:220%;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(47,194,114,.28),rgba(47,194,114,0) 70%);filter:blur(18px);
  animation:zl3d-breathe 3.2s ease-in-out infinite}
.zl3d-solid{position:relative;transform-style:preserve-3d;animation:zl3d-turn 3.6s ease-in-out infinite}
.zl3d-layer{position:absolute;inset:0;pointer-events:none;filter:brightness(.38) saturate(.7)}
.zl3d-front{position:relative}
.zl3d-bar{position:relative;width:min(220px,50vw);height:2px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden}
.zl3d-bar i{position:absolute;inset:0;width:40%;border-radius:2px;
  background:linear-gradient(90deg,transparent,#5bf0a0,transparent);animation:zl3d-run 1.5s ease-in-out infinite}
@keyframes zl3d-turn{0%,100%{transform:rotateY(-30deg) rotateX(7deg) translateY(0)}
  50%{transform:rotateY(30deg) rotateX(-5deg) translateY(-8px)}}
@keyframes zl3d-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes zl3d-run{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
@media (prefers-reduced-motion:reduce){.zl3d-solid{animation:none;transform:rotateY(-14deg) rotateX(4deg)}
  .zl3d-bar i{animation:none;width:100%;opacity:.5}}
`;

const DEPTH = 7;   // extrusion layers

export default function ZatlaLoader3D({ reducedMotion = false }) {
  const size = "text-[2.3rem] sm:text-[3.6rem]";
  return (
    <div className="zl3d" role="status" aria-label="Loading 3D layout">
      <style>{CSS}</style>
      <div className="zl3d-stage">
        <div className="zl3d-glow" />
        <div className="zl3d-solid" style={reducedMotion ? { animation: "none", transform: "rotateY(-14deg) rotateX(4deg)" } : undefined}>
          {Array.from({ length: DEPTH }, (_, i) => (
            <div key={i} className="zl3d-layer" aria-hidden="true" style={{ transform: `translateZ(${-(i + 1) * 2.5}px)` }}>
              <ZatlaLogo className={size} />
            </div>
          ))}
          <div className="zl3d-front"><ZatlaLogo className={size} /></div>
        </div>
      </div>
      <div className="zl3d-bar" aria-hidden="true"><i /></div>
    </div>
  );
}
