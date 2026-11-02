import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { PRODUCT, formatPrice } from "@/lib/product";

// The cart page. One product: the design's grow lights come in on their own
// (the designer keeps that number in step with the layout), and the visitor
// can add more on top.
export default function Cart() {
  const { designQty, extraQty, qty, total, setExtraQty } = useCart();

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="mt-6 flex items-center gap-3 text-3xl font-bold"><ShoppingCart className="h-7 w-7" /> Your cart</h1>

        {qty === 0 ? (
          <div className="mt-8 rounded-2xl border border-industrial-line bg-industrial-surface p-8 text-center">
            <p className="text-industrial-muted">Your cart is empty.</p>
            <p className="mt-2 text-sm text-industrial-muted">Lay out a room in the designer and the grow lights it uses are added here automatically.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild><Link to="/design">Design a room</Link></Button>
              <Button asChild variant="outline"><Link to="/shop">See the light</Link></Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-industrial-line bg-industrial-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{PRODUCT.name}</p>
                  <p className="text-sm text-industrial-muted">{formatPrice(PRODUCT.price)} each</p>
                </div>
                <p className="text-lg font-semibold">{formatPrice(total)}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-industrial-line p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-industrial-muted">From your design</p>
                  <p className="mt-1 text-2xl font-bold">{designQty}</p>
                  <p className="mt-1 text-sm text-industrial-muted">
                    Follows the layout: change benches, tiers or lights in the <Link to="/design" className="text-primary underline-offset-2 hover:underline">designer</Link> and this updates on its own.
                  </p>
                </div>
                <div className="rounded-xl border border-industrial-line p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-industrial-muted">Added by you</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" aria-label="One fewer" onClick={() => setExtraQty(extraQty - 1)} disabled={extraQty <= 0} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-industrial-line hover:bg-white/5 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                    <span className="min-w-[2.5rem] text-center text-2xl font-bold">{extraQty}</span>
                    <button type="button" aria-label="One more" onClick={() => setExtraQty(extraQty + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-industrial-line hover:bg-white/5"><Plus className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-1 text-sm text-industrial-muted">Spares, or lights for a room you haven't drawn.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-industrial-line bg-industrial-surface p-5">
              <div>
                <p className="text-sm text-industrial-muted">{qty} light{qty === 1 ? "" : "s"}</p>
                <p className="text-2xl font-bold">{formatPrice(total)}</p>
              </div>
              <div className="text-right">
                <Button asChild size="lg" className="gap-2"><Link to="/checkout"><ShoppingCart className="h-4 w-4" /> Checkout</Link></Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
