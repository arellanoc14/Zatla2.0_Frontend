import React, { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

// One of the top links (Design / Shop / Cart). Each one switches on like an
// LED bar: on hover a glass pill springs in behind the label with a light bar
// under it; on press the pill squishes and floods green while a flash of light
// bursts from the press point and a ring pulses out (styles in home.css).
//
// The press runs from pointerdown, in React state, rather than from :active:
// a quick tap on a phone would otherwise show almost nothing before the page
// changes, and state survives re-renders where a hand-added class would not.
// The burst and ring are keyed by press, so pressing again restarts them.
export default function TopLink({ to, children, className = "", ...rest }) {
  const [burst, setBurst] = useState(null);
  const seq = useRef(0);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const fire = (x, y) => {
    clearTimeout(timer.current);
    seq.current += 1;
    setBurst({ id: seq.current, x, y });
    timer.current = setTimeout(() => setBurst(null), 650);
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    fire(e.clientX - r.left, e.clientY - r.top);
  };
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const el = e.currentTarget;
    fire(el.offsetWidth / 2, el.offsetHeight / 2);
  };
  // A finger that starts a scroll on the link is not a press.
  const onPointerCancel = () => {
    clearTimeout(timer.current);
    setBurst(null);
  };

  return (
    <NavLink
      to={to}
      className={`top-link${burst ? " is-pressed" : ""}${className ? ` ${className}` : ""}`}
      onPointerDown={onPointerDown}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      {...rest}
    >
      <span className="top-link-fx" aria-hidden="true">
        {burst && <span key={burst.id} className="top-link-burst" style={{ left: burst.x, top: burst.y }} />}
      </span>
      {burst && <span key={`ring-${burst.id}`} className="top-link-ring" aria-hidden="true" />}
      <span className="top-link-label">{children}</span>
    </NavLink>
  );
}
