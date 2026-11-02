import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/home/SiteHeader";
import Cursor from "@/components/home/Cursor";
import SceneStage from "@/components/home/SceneStage";
import ZatlaLogo from "@/components/home/ZatlaLogo";
import { mountParticleTunnel } from "@/lib/home/particleTunnel";
import "@/components/home/home.css";

// Home page: a tunnel of glowing specks behind the whole page (lib/home/
// particleTunnel.js), the hero with the two ways in — Start Designing (/design,
// the 3D studio) and Play Now (/play, the runner) — the "core upgrades" cards,
// the room video band, and the footer.

const CARDS = [
  { title: "3D Room Designer", text: "Lay out benches, lights and aisles, then walk the room in 3D.", img: "/brand/room-3d-layout-2026-10.webp", to: "/design", wide: true },
  { title: "Full-Spectrum Light", text: "1,000 W, 3.26 µmol/J, tunable for veg and flower.", img: "/brand/zatla-light-front.jpg", to: "/shop" },
  { title: "Canopy Results", text: "Even PPFD from the first tier to the last.", img: "/brand/canopy-red.webp", to: "/shop" },
];

const FOOTER = [
  { heading: "Product", links: [["Design", "/design"], ["Shop", "/shop"], ["Cart", "/cart"]] },
  { heading: "Community", links: [["Play", "/play"], ["Share a design", "/design"]] },
  { heading: "Legal", links: [["Terms", "#"], ["Privacy", "#"]] },
];

// Sections reveal as they scroll into view (once), and buttons on pointer
// devices lean a few pixels toward the cursor. Both are no-ops with reduced motion.
function useMotion() {
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const els = [...document.querySelectorAll("[data-reveal]")];
    if (reduced) { els.forEach((el) => el.classList.add("in")); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.18 });
    els.forEach((el) => io.observe(el));
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    const onMove = (e) => {
      const b = e.target.closest?.(".btn"); if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      b.style.setProperty("--tx", `${(e.clientX - (r.left + r.width / 2)) * 0.12}px`);
      b.style.setProperty("--ty", `${(e.clientY - (r.top + r.height / 2)) * 0.18}px`);
    };
    const onOut = (e) => { const b = e.target.closest?.(".btn"); if (b) { b.style.setProperty("--tx", "0px"); b.style.setProperty("--ty", "0px"); } };
    if (fine) { document.addEventListener("pointermove", onMove, { passive: true }); document.addEventListener("pointerout", onOut); }
    return () => { io.disconnect(); document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerout", onOut); };
  }, []);
}

// The newsletter field. ponytail: front end only — the backend has no
// newsletter endpoint yet, so the address goes nowhere; add one and post here.
function JoinForm() {
  const [done, setDone] = useState(false);
  if (done) return <p className="mt-6 text-sm text-[color:var(--home-green)]">Thanks — you're on the list.</p>;
  return (
    <form className="join mt-6" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
      <label htmlFor="join-email" className="sr-only">Email</label>
      <input id="join-email" type="email" required placeholder="Join the grow list…" />
      <button type="submit" className="btn btn-light">Join</button>
    </form>
  );
}

export default function Home() {
  useMotion();
  return (
    <div className="home home-v2">
      <Cursor />
      <SiteHeader />
      {/* In <body>, not here: the page-transition wrapper's transform would
          pin a fixed layer to the page instead of the screen. */}
      {createPortal(<SceneStage eager mount={mountParticleTunnel} poster={null} label="" className="zatla-tunnel" />, document.body)}

      <section className="hero hero-cine v2-hero">
        <div className="wrap">
          <h1 className="display v2-title rise" style={{ "--i": 0 }}>Grow Without<br />Limits</h1>
          <p className="rise mt-5 max-w-[38ch] text-lg leading-relaxed text-[color:var(--home-copy)] md:text-xl" style={{ "--i": 1 }}>
            Plan your room in 3D, light it with ZATLA, and watch the canopy fill in.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ "--i": 2 }}>
            <Link to="/design" className="btn btn-light">Start Designing</Link>
            <Link to="/play" className="btn btn-secondary">Play Now</Link>
          </div>
        </div>
      </section>

      <section className="wrap py-20 md:py-28">
        <h2 className="display v2-h2" data-reveal>Core Upgrades</h2>
        <div className="v2-cards mt-10">
          {CARDS.map((c) => (
            <Link key={c.title} to={c.to} className={`v2-card${c.wide ? " wide" : ""}`} data-reveal>
              <img src={c.img} alt="" loading="lazy" />
              <div className="v2-card-copy">
                <h3 className="display">{c.title}</h3>
                <p>{c.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="v2-band" data-reveal>
        <video src="/body/zatla-body.mp4" poster="/body/zatla-body.webp" autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
        <div className="wrap v2-band-copy">
          <h2 className="display v2-h2">Built for<br />the Canopy</h2>
          <p className="mt-4 max-w-[36ch] text-lg text-[color:var(--home-copy)]">Rolling benches, multi-tier racks, every square foot lit.</p>
        </div>
      </section>

      <footer className="v2-footer">
        <div className="wrap grid gap-10 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <ZatlaLogo height="2.2rem" />
            <p className="mt-4 max-w-[30ch] text-[color:var(--home-muted)]">Commercial grow lighting and room design, start to harvest.</p>
            <JoinForm />
          </div>
          {FOOTER.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="v2-foot-h">{col.heading}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map(([label, to]) => (
                  <li key={label}>{to.startsWith("/") ? <Link to={to} className="nav-link">{label}</Link> : <a href={to} className="nav-link">{label}</a>}</li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="wrap border-t border-[color:var(--home-line)] py-6 text-sm text-[color:var(--home-muted)]">© {new Date().getFullYear()} ZATLA. All rights reserved.</div>
      </footer>
    </div>
  );
}
