import { useEffect, useState } from "react";
import { PRODUCT, UCL_PRODUCT, CONTROLLER_PRODUCT } from "@/lib/product";
import { benchRect } from "@/lib/growroom/clearances";

// The shopping cart: the grow light, the under-canopy light (ucl) and the
// controller. The grow light's quantity has two parts:
//   designQty  the number of grow lights in the visitor's layout, written by
//              the designer itself (useDesignCartSync) on every change - the
//              visitor never adds or removes these by hand;
//   extraQty   lights added on the shop page or in the cart, on top of that.
// The UCL and the controller are plain quantities, added on the shop page.
// Kept in this browser's localStorage (ZATLA has no login), so it survives
// refreshes and follows the visitor from the designer to the shop. Components
// read it through useCart(), which re-renders on every change in this tab and
// in other tabs.
const KEY = "zatla_cart_v1";
const EVENT = "zatla-cart";
const EMPTY = { designQty: 0, extraQty: 0, ucl: 0, controller: 0 };
const MAX_OTHER = 200; // per product; the server refuses more than 200 of a line
const OTHER = { ucl: UCL_PRODUCT, controller: CONTROLLER_PRODUCT };
const whole = (v) => Math.max(0, Math.round(Number(v) || 0));

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw);
    return {
      designQty: whole(v?.designQty),
      extraQty: whole(v?.extraQty),
      ucl: Math.min(MAX_OTHER, whole(v?.ucl)),
      controller: Math.min(MAX_OTHER, whole(v?.controller)),
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

// The UCL and the controller: set how many are in the cart, or add some.
export function setOtherQty(sku, n) {
  if (!OTHER[sku]) return;
  write({ ...read(), [sku]: Math.min(MAX_OTHER, whole(n)) });
}
// Add n of any product: grow lights go on the "added by you" count.
export function addItem(sku, n = 1) {
  if (sku === "grow_light") addExtra(n);
  else if (OTHER[sku]) setOtherQty(sku, read()[sku] + n);
}

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
  const qty = cart.designQty + cart.extraQty; // grow lights only
  // One line per product in the cart: { sku, name, title, price, qty, total }.
  const lines = [
    { sku: "grow_light", name: PRODUCT.name, title: PRODUCT.name, price: PRODUCT.price, qty },
    { sku: "ucl", name: UCL_PRODUCT.name, title: UCL_PRODUCT.title, price: UCL_PRODUCT.price, qty: cart.ucl },
    { sku: "controller", name: CONTROLLER_PRODUCT.name, title: CONTROLLER_PRODUCT.title, price: CONTROLLER_PRODUCT.price, qty: cart.controller },
  ].filter((l) => l.qty > 0).map((l) => ({ ...l, total: l.qty * l.price }));
  const count = lines.reduce((n, l) => n + l.qty, 0); // everything in the cart
  const total = lines.reduce((n, l) => n + l.total, 0);
  return { ...cart, qty, count, lines, total, setExtraQty, addExtra, removeOne, setOtherQty, addItem, clearCart };
}

// Keeps the cart's design line equal to the layout's grow-light count, in real
// time: runs on every doc change in the 2D and 3D pages.
export function useDesignCartSync(doc) {
  const n = designLightCount(doc);
  useEffect(() => { setDesignQty(n); }, [n]);
}
