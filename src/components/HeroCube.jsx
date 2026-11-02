import React, { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SceneStage from "@/components/home/SceneStage";
import { mountHeroCubeScene } from "@/lib/home/heroCubeScene";

// The home hero's content: the copy and buttons on one side and a tumbling 3D
// cube on the other, layered OVER the hero's own background. The header video
// behind it stays untouched; this only adds on top. Styles: home.css, "Hero cube".
//
// Props
//   faces       up to 6 × { id, type: "image" | "video", src, alt, href,
//               mobileSrc?, poster? }. Face 1 faces front first.
//               mobileSrc: a smaller picture for phones. poster: a video's
//               still, shown on phones and if the video can't play.
//   heading     the h1. eyebrow, subheading, actions: the line under it, the
//               paragraph, and the buttons (a node).
//   slides      the pagination dots: [{ face, label }] (face = index or id).
//               Default: one dot per face, labelled with its alt text.
//   side        "right" (default) puts the cube right of the copy; "left"
//               mirrors the layout. Phones always stack: copy, then the cube.
//
// The copy keeps the hero's staggered rise (the .rise classes) wherever it sits.
// Clicking a face opens its href, a dot turns that face to the front, and a
// face's link is also reachable by keyboard (shown when focused). The scene
// itself lives in lib/home/heroCubeScene.js; SceneStage runs it only while it
// is on screen and the tab is visible.

const isExternal = (href) => /^https?:\/\//i.test(href || "");

export default function HeroCube({ faces = [], heading, eyebrow, subheading, actions, slides, side = "right" }) {
  const navigate = useNavigate();
  const apiRef = useRef(null);
  const [front, setFront] = useState(0);
  const [live, setLive] = useState(true); // false without WebGL: no dots that do nothing

  // The scene reads faces and navigation through refs, so the mount function
  // only changes (and the WebGL scene is only rebuilt) when the media changes.
  const facesRef = useRef(faces);
  facesRef.current = faces;
  const open = useCallback((i) => {
    const href = facesRef.current[i]?.href;
    if (!href) return;
    if (isExternal(href)) window.location.assign(href);
    else navigate(href);
  }, [navigate]);
  const openRef = useRef(open);
  openRef.current = open;

  const mediaKey = faces.slice(0, 6).map((f) => [f?.type, f?.src, f?.mobileSrc, f?.poster].join("|")).join("||");
  const mount = useCallback((host, opts) => {
    const api = mountHeroCubeScene(host, {
      ...opts,
      onError: (e) => { setLive(false); opts.onError?.(e); },
      onReady: () => { setLive(true); opts.onReady?.(); },
      faces: facesRef.current.slice(0, 6),
      onFaceChange: (i) => { if (i >= 0) setFront(i); },
      onFaceClick: (i) => openRef.current(i),
    });
    if (!api) { setLive(false); return null; }
    apiRef.current = api;
    return {
      ...api,
      dispose() {
        if (apiRef.current === api) apiRef.current = null;
        api.dispose();
      },
    };
  }, [mediaKey]); // only the media: faces and navigation are read through refs

  const shown = faces.slice(0, 6);
  const dots = (slides?.length ? slides : shown.map((f, i) => ({ face: i, label: f?.alt })))
    .map((s, k) => {
      const face = typeof s.face === "number" ? s.face : shown.findIndex((f) => f?.id === s.face);
      return { key: `${k}-${face}`, face, label: s.label || shown[face]?.alt || `Face ${face + 1}` };
    })
    .filter((d) => d.face >= 0 && d.face < shown.length);

  return (
    <div className="hero-cube wrap" data-side={side === "left" ? "left" : "right"}>
      <div className="hero-cube-copy">
        {heading && (
          <h1 className="display hero-title rise text-[2.6rem] sm:text-[3.4rem] lg:text-[3.9rem] xl:text-[4.4rem]" style={{ "--i": 0 }}>
            {heading}
          </h1>
        )}
        {eyebrow && (
          <>
            <span className="hero-streak rise" style={{ "--i": 1 }} aria-hidden="true" />
            <p className="hero-eyebrow rise" style={{ "--i": 2 }}>{eyebrow}</p>
          </>
        )}
        {subheading && (
          <p className="rise mt-4 max-w-[34ch] text-lg leading-relaxed text-[color:var(--home-cine-muted,#c3cfc6)] md:mt-5 md:text-xl" style={{ "--i": 3 }}>
            {subheading}
          </p>
        )}
        {actions && (
          <div className="hero-cube-actions rise mt-6 flex flex-wrap items-center gap-3 md:mt-9" style={{ "--i": 4 }}>{actions}</div>
        )}
        {live && dots.length > 1 && (
          <div className="hero-cube-dots rise" style={{ "--i": 5 }} role="group" aria-label="Turn the cube">
            {dots.map((d) => (
              <button
                key={d.key}
                type="button"
                className="hero-cube-dot"
                aria-label={`Show face ${d.face + 1}: ${d.label}`}
                aria-pressed={front === d.face}
                onClick={() => apiRef.current?.showFace(d.face)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="hero-cube-stage">
        <SceneStage
          eager
          mount={mount}
          poster={null}
          label="A slowly turning cube with a picture on each side"
          className="hero-cube-canvas"
        />
        {/* Keyboard and screen-reader way to each face's link; hidden until focused. */}
        <ul className="hero-cube-links">
          {shown.map((f, i) => f?.href && (
            <li key={f.id ?? i}>
              {isExternal(f.href)
                ? <a href={f.href}>{`Face ${i + 1}: ${f.alt || f.href}`}</a>
                : <Link to={f.href}>{`Face ${i + 1}: ${f.alt || f.href}`}</Link>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
