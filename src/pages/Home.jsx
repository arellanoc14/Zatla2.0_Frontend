import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/home/SiteHeader";
import Cursor from "@/components/home/Cursor";
import HeroCube from "@/components/HeroCube";
import "@/components/home/home.css";

// Home page: the hero (the header video as its background, with the copy on
// the left and a tumbling 3D cube on the right layered over it — see
// HeroCube.jsx), then a placeholder for the body and footer. Two ways in —
// Start Designing (/design, the 3D studio) and Explore Products (/shop).

// The header video fills the hero on any screen, cropped to cover and never
// stretched. Replace public/hero/header.mp4 (same name) to change it.
const HEADER_VIDEO = "/hero/header.mp4";

// The hero cube's six sides, in order: face 1 faces front first (and is the
// one shown with reduced motion), then right, back, left, top, bottom. Each
// picture is a square in public/hero/cube/ at 1024 px, with a 512 px copy for
// phones (mobileSrc). To change a side, replace its file (same name) or edit
// its entry; href is where a click on that side goes. A side can be a video:
//   { id, type: "video", src: "/hero/cube/clip.mp4", poster: "/hero/cube/clip.webp", alt, href }
// It plays muted and looped on desktop; phones, and any failure, show the poster.
// Faces 1–5 are frames from the ToonBuds animated intro (a YouTube video);
// face 6 is the ZATLA light.
const HERO_CUBE_FACES = [
  { id: "face-1", type: "image", src: "/hero/cube/face-1.webp", mobileSrc: "/hero/cube/face-1-sm.webp", href: "/design", alt: "Cartoon bud character with a joint, dancing under green stage lights" },
  { id: "face-2", type: "image", src: "/hero/cube/face-2.webp", mobileSrc: "/hero/cube/face-2-sm.webp", href: "/design", alt: "Cartoon character frowning in a patched green armchair" },
  { id: "face-3", type: "image", src: "/hero/cube/face-3.webp", mobileSrc: "/hero/cube/face-3-sm.webp", href: "/design", alt: "Cartoon character grinning in an armchair with a remote as green smoke rolls past" },
  { id: "face-4", type: "image", src: "/hero/cube/face-4.webp", mobileSrc: "/hero/cube/face-4-sm.webp", href: "/design", alt: "Cartoon lighter character playing a cello on a stage" },
  { id: "face-5", type: "image", src: "/hero/cube/face-5.webp", mobileSrc: "/hero/cube/face-5-sm.webp", href: "/design", alt: "Cartoon character in headphones over a green wireframe landscape" },
  { id: "face-6", type: "image", src: "/hero/cube/face-6.webp", mobileSrc: "/hero/cube/face-6-sm.webp", href: "/shop", alt: "The ZATLA grow light, face-on with its LED bars lit" },
];
const HERO_ACTIONS = (
  <>
    <Link to="/design" className="btn btn-primary">Start Designing</Link>
    <Link to="/shop" className="btn btn-secondary">Explore Products</Link>
  </>
);

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

export default function Home() {
  useMotion();
  return (
    <div className="home">
      <Cursor />
      <SiteHeader />

      {/* Hero: the header video is the background; the copy and the cube are
          layered over it. */}
      <section className="hero hero-cine relative isolate overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={HEADER_VIDEO}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <HeroCube
          faces={HERO_CUBE_FACES}
          heading="Get the Most Out of Your Grow."
          eyebrow="Plan · Visualize · Equip"
          subheading="Plan layouts, configure equipment, and visualize your grow environment with precision."
          actions={HERO_ACTIONS}
        />
      </section>

      {/* Body and footer: placeholder for now. */}
      <div className="wrap py-20 text-[color:var(--home-muted)]">body and footer text</div>
    </div>
  );
}
