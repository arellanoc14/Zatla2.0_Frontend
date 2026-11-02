import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import LogoReveal from "@/components/home/LogoReveal";
import { useCart } from "@/lib/cart";

// One of the top links (Design / Shop / Cart). Each one switches on like an
// LED bar: on hover a glass pill springs in behind the label with a light bar
// under it; on press the pill squishes and floods green while a flash of light
// bursts from the press point and a ring pulses out (styles in home.css).
//
// The press runs from pointerdown, in React state, rather than from :active:
// a quick tap on a phone would otherwise show almost nothing before the page
// changes, and state survives re-renders where a hand-added class would not.
// The burst and ring are keyed by press, so pressing again restarts them.
function TopLink({ to, children }) {
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
      className={`top-link${burst ? " is-pressed" : ""}`}
      onPointerDown={onPointerDown}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <span className="top-link-fx" aria-hidden="true">
        {burst && <span key={burst.id} className="top-link-burst" style={{ left: burst.x, top: burst.y }} />}
      </span>
      {burst && <span key={`ring-${burst.id}`} className="top-link-ring" aria-hidden="true" />}
      <span className="top-link-label">{children}</span>
    </NavLink>
  );
}

// Top bar for the marketing pages: the wordmark, and the places to go.
export default function SiteHeader() {
  const { qty } = useCart();
  return (
    <header className="site-header absolute inset-x-0 top-0 z-20">
      {/* The wordmark floats over the bar at its own size — doubled from the old
          1.5rem — instead of sitting inline in the nav row, so it can be this
          much bigger without stretching the row height or crowding the links. */}
      <div className="wrap relative flex h-16 items-center justify-end md:h-20">
        <Link to="/" aria-label="ZATLA home" className="nav-link site-logo absolute left-0 inline-flex items-center">
          <LogoReveal />
        </Link>
        <nav aria-label="Site" className="top-nav flex items-center">
          <TopLink to="/design">Design</TopLink>
          <TopLink to="/shop">Shop</TopLink>
          <TopLink to="/cart">Cart{qty > 0 ? ` (${qty})` : ""}</TopLink>
        </nav>
      </div>
    </header>
  );
}
