import { useEffect, useState } from "react";
import { PRODUCT } from "@/lib/product";
import { benchRect } from "@/lib/growroom/clearances";

// The shopping cart. ZATLA sells one product, the grow light, and its quantity
// has two parts:
//   designQty  the number of grow lights in the visitor's layout, written by
//              the designer itself (useDesignCartSync) on every change - the
//              visitor never adds or removes these by hand;
//   extraQty   lights added on the shop page or in the cart, on top of that.
// Kept in this browser's localStorage (ZATLA has no login), so it survives
// refreshes and follows the visitor from the designer to the shop. Components
// read it through useCart(), which re-renders on every change in this tab and
// in other tabs.
const KEY = "zatla_cart_v1";
const EVENT = "zatla-cart";
const EMPTY = { designQty: 0, extraQty: 0 };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw);
    return {
      designQty: Math.max(0, Math.round(Number(v?.designQty) || 0)),
      extraQty: Math.max(0, Math.round(Number(v?.extraQty) || 0)),
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: the cart lives for this page only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

export function getCart() { return read(); }

// The designer calls this with the current grow-light count of the layout.
export function setDesignQty(n) {
  const cur = read();
  const designQty = Math.max(0, Math.round(Number(n) || 0));
  if (designQty === cur.designQty) return;
  write({ ...cur, designQty });
}

export function setExtraQty(n) {
  const cur = read();
  write({ ...cur, extraQty: Math.max(0, Math.round(Number(n) || 0)) });
}

export function addExtra(n = 1) { setExtraQty(read().extraQty + n); }

export function clearCart() { write({ ...EMPTY }); }

// Take one light out of the cart: the ones the visitor added come off first,
// then the ones the layout put there.
export function removeOne() {
  const cur = read();
  if (cur.extraQty > 0) write({ ...cur, extraQty: cur.extraQty - 1 });
  else if (cur.designQty > 0) write({ ...cur, designQty: cur.designQty - 1 });
}

// Count the grow lights in a design, the same way the 3D places them: one
// fixture per 4 ft of bench length (at least one), on every tier of every
// bench, in every room - except rooms whose grow lights are switched off
// ("No Grow Lights"). The active room's live fields win over its stored
// rooms[] copy, as everywhere else in the studio.
function fixturesOnBench(b) {
  if (!b || !b.pos) return 0;
  const r = benchRect(b);
  const len = Math.max(r.w, r.h);
  if (!(len > 0)) return 0;
  const tiers = Math.max(1, Math.min(3, Math.round(b.tiers || 1)));
  return Math.max(1, Math.round(len / 48)) * tiers;
}
export function designLightCount(doc) {
  if (!doc) return 0;
  const rooms = Array.isArray(doc.rooms) && doc.rooms.length ? doc.rooms : null;
  const countBenches = (list) => (list || []).reduce((n, b) => n + fixturesOnBench(b), 0);
  if (!rooms) return (doc.lightModel || "phoenix") === "none" ? 0 : countBenches(doc.benches);
  return rooms.reduce((n, rm) => {
    if ((rm.lightModel || "phoenix") === "none") return n;
    return n + countBenches(rm.id === doc.activeRoomId ? doc.benches : rm.benches);
  }, 0);
}

export function useCart() {
  const [cart, setCart] = useState(read);
  useEffect(() => {
    const onLocal = (e) => setCart(e.detail ? { ...e.detail } : read());
    const onStorage = (e) => { if (e.key === KEY || e.key === null) setCart(read()); };
    window.addEventListener(EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    setCart(read()); // a write may have landed between first render and subscribing
    return () => { window.removeEventListener(EVENT, onLocal); window.removeEventListener("storage", onStorage); };
  }, []);
  const qty = cart.designQty + cart.extraQty;
  return { ...cart, qty, total: qty * PRODUCT.price, setExtraQty, addExtra, removeOne, clearCart };
}

// Keeps the cart's design line equal to the layout's grow-light count, in real
// time: runs on every doc change in the 2D and 3D pages.
export function useDesignCartSync(doc) {
  const n = designLightCount(doc);
  useEffect(() => { setDesignQty(n); }, [n]);
}
