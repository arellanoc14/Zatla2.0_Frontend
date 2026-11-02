import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/product";

// The cart, as a pill on the design pages: how many grow lights the layout
// puts in the cart and what they come to, live. It nudges when the count
// changes so the visitor sees the layout and the cart move together.
export default function CartPill({ className = "" }) {
  const { qty, total } = useCart();
  const [bump, setBump] = useState(false);
  const last = useRef(qty);
  useEffect(() => {
    if (last.current === qty) return undefined;
    last.current = qty;
    setBump(true);
    const t = setTimeout(() => setBump(false), 450);
    return () => clearTimeout(t);
  }, [qty]);
  return (
    <Link
      to="/cart"
      aria-label={`Cart: ${qty} grow light${qty === 1 ? "" : "s"}, ${formatPrice(total)}`}
      className={`inline-flex h-[38px] items-center gap-2 rounded-full border border-white/15 bg-slate-950/85 pl-3 pr-3.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition-transform hover:bg-slate-900 ${bump ? "scale-105" : ""} ${className}`}
    >
      <span className="relative inline-flex">
        <ShoppingCart className="h-4 w-4" />
        {qty > 0 && (
          <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-emerald-500 px-1 text-center text-[10px] leading-[18px] text-black">{qty}</span>
        )}
      </span>
      <span className="hidden sm:inline">{qty} light{qty === 1 ? "" : "s"} · {formatPrice(total)}</span>
    </Link>
  );
}
