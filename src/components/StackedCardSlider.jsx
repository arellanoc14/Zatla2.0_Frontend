import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// A dark two-column section: heading + body on the left, a stacked deck of
// cards on the right that auto-advances. Plain CSS transitions, no library.
//
// Props
//   cards       [{ id, title, description, image, imageAlt, href }]
//               image may be null/empty: the card shows a "image TODO" panel.
//               href starting with http(s) renders an <a>, anything else a router <Link>.
//   intervalMs  time each card stays in front (default 4000)
//   heading     left-column heading
//   media       optional node (e.g. a <video>) shown in the right column
//               INSTEAD of the card deck.
//   action      optional node (e.g. a button link) shown under the body text.
//   body        left-column text: a string, or an array of strings (one block each).
//               Every block (and the heading) slides + fades in on its own beat
//               when the section scrolls into view.
//
// Deck: the front card is full size; the next two sit behind it, offset 24px
// left each, scaled 0.95 / 0.90 and dimmed to 0.6 / 0.35. The rest are hidden.
// Clicking a back card brings it to the front; clicking the front card follows
// its link. Arrow keys step through the deck while it has focus. Hover or focus
// pauses the auto-advance; reduced motion turns it off and makes swaps instant.

const SLOTS = [
  { x: 0, scale: 1, opacity: 1 },
  { x: -24, scale: 0.95, opacity: 0.6 },
  { x: -48, scale: 0.9, opacity: 0.35 },
];
// Where a card goes when it leaves the front (only when it drops out of view):
// back, a little further left, faded out — so it crossfades under the next one.
const LEAVING = { x: -40, scale: 0.88, opacity: 0 };
const HIDDEN = { x: -72, scale: 0.85, opacity: 0 };
const EASE = "cubic-bezier(0.45, 0, 0.55, 1)"; // ease-in-out
const DURATION = 600;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

function useInView(ref, reduced) {
  const [inView, setInView] = useState(reduced);
  useEffect(() => {
    if (reduced) { setInView(true); return undefined; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, reduced]);
  return inView;
}

const isExternal = (href) => /^https?:\/\//i.test(href || "");

const CardLink = React.forwardRef(function CardLink({ href, className, children, ...rest }, ref) {
  if (isExternal(href)) return <a ref={ref} href={href} className={className} {...rest}>{children}</a>;
  return <Link ref={ref} to={href || "/"} className={className} {...rest}>{children}</Link>;
});

export default function StackedCardSlider({ cards = [], intervalMs = 4000, heading, body, media, action }) {
  const n = cards.length;
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef(null);
  const cardRefs = useRef([]);
  const inView = useInView(sectionRef, reduced);
  const paused = !!media || hovered || focused || reduced || n < 2;

  // Auto-advance. Keyed on `active`, so any manual move restarts the clock.
  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => setActive((a) => (a + 1) % n), intervalMs);
    return () => clearTimeout(t);
  }, [active, paused, intervalMs, n]);

  // Keep `active` valid if the card list shrinks.
  useEffect(() => { if (active >= n && n > 0) setActive(0); }, [active, n]);

  const goTo = useCallback((i, focus) => {
    const next = ((i % n) + n) % n;
    setActive(next);
    if (focus) requestAnimationFrame(() => cardRefs.current[next]?.focus());
  }, [n]);

  const onDeckKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1, true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1, true); }
  };

  const onDeckBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };

  const lines = body == null ? [] : Array.isArray(body) ? body : [body];
  const rise = (i) => ({
    opacity: inView ? 1 : 0,
    transform: inView ? "none" : "translate(-28px, 16px)",
    transition: reduced ? "none" : `opacity 900ms cubic-bezier(0.2,0.7,0.2,1) ${i * 140}ms, transform 900ms cubic-bezier(0.2,0.7,0.2,1) ${i * 140}ms`,
  });

  return (
    <section ref={sectionRef} className="bg-industrial-bg text-industrial-copy">
      <div className="mx-auto grid w-[min(100%-2rem,76rem)] grid-cols-1 items-center gap-12 py-20 md:w-[min(100%-5rem,76rem)] md:grid-cols-2 md:gap-10 md:py-28">
        {/* Left: heading + body, each block rising in on its own beat */}
        <div>
          {heading && (
            <h2 className="display text-3xl md:text-[2.6rem]" style={rise(0)}>{heading}</h2>
          )}
          {lines.map((line, i) => (
            <p key={i} className="mt-5 max-w-[44ch] text-base leading-relaxed text-industrial-muted md:text-lg" style={rise(i + 1)}>
              {line}
            </p>
          ))}
          {action && (
            <div className="mt-8" style={rise(lines.length + 1)}>{action}</div>
          )}
        </div>

        {/* Right: the media, or the deck */}
        {media ? (
          <div style={rise(lines.length + 1)}>{media}</div>
        ) : (
        <div
          className="relative w-full pl-12 md:max-w-md md:justify-self-end"
          role="region"
          aria-roledescription="carousel"
          aria-label={heading ? `${heading} cards` : "Cards"}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={onDeckBlur}
          onKeyDown={onDeckKeyDown}
        >
          <div className="grid">
            {cards.map((card, i) => {
              const pos = (i - active + n) % n;
              const visible = pos < SLOTS.length;
              const leaving = !visible && pos === n - 1;
              const s = visible ? SLOTS[pos] : leaving ? LEAVING : HIDDEN;
              const front = pos === 0;
              return (
                <div
                  key={card.id ?? i}
                  className="[grid-area:1/1]"
                  style={{
                    transform: `translateX(${s.x}px) scale(${s.scale})`,
                    transformOrigin: "left center",
                    opacity: s.opacity,
                    // Leaving card stays on top while it fades, so it crossfades over the new front.
                    zIndex: leaving ? 40 : 30 - pos,
                    pointerEvents: visible ? "auto" : "none",
                    transition: reduced ? "none" : `transform ${DURATION}ms ${EASE}, opacity ${DURATION}ms ${EASE}`,
                  }}
                  aria-hidden={visible ? undefined : true}
                >
                  <CardLink
                    href={card.href}
                    ref={(el) => { cardRefs.current[i] = el; }}
                    tabIndex={visible ? 0 : -1}
                    aria-label={front ? undefined : `Show ${card.title}`}
                    onClick={(e) => { if (!front) { e.preventDefault(); goTo(i); } }}
                    className={cn(
                      "group block h-full cursor-pointer overflow-hidden rounded-2xl border border-industrial-line bg-industrial-surface",
                      "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] outline-none",
                      "focus-visible:ring-2 focus-visible:ring-[#ffd84a] focus-visible:ring-offset-2 focus-visible:ring-offset-industrial-bg",
                      front && !reduced && "transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_-20px_rgba(0,0,0,0.85)]"
                    )}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-industrial-raised">
                      {card.image ? (
                        <img
                          src={card.image}
                          alt={card.imageAlt || ""}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest text-industrial-muted">
                          Image TODO
                        </div>
                      )}
                    </div>
                    <div className="p-6">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-industrial-muted">{card.title}</h3>
                      <p className="mt-3 leading-relaxed text-industrial-copy/90">{card.description}</p>
                    </div>
                  </CardLink>
                </div>
              );
            })}
          </div>
          <p className="sr-only" aria-live="polite">
            {n > 0 ? `${cards[active]?.title}, card ${active + 1} of ${n}` : ""}
          </p>
        </div>
        )}
      </div>
    </section>
  );
}
