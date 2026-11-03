import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import AccountNav from "@/components/AccountNav";
import { PRODUCT, UCL_PRODUCT, CONTROLLER_PRODUCT, formatPrice } from "@/lib/product";

const stepper = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-industrial-line hover:bg-white/5 disabled:opacity-40";

// A plain quantity row for the under-canopy light and the controller.
function OtherLine({ product, qty, onChange }) {
  return (
    <div className="rounded-2xl border border-industrial-line bg-industrial-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{product.title}</p>
          <p className="text-sm text-industrial-muted">{formatPrice(product.price)} each</p>
        </div>
        <p className="text-lg font-semibold">{formatPrice(qty * product.price)}</p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" aria-label={`One fewer ${product.title}`} onClick={() => onChange(qty - 1)} className={stepper}><Minus className="h-4 w-4" /></button>
        <span className="min-w-[2.5rem] text-center text-2xl font-bold">{qty}</span>
        <button type="button" aria-label={`One more ${product.title}`} onClick={() => onChange(qty + 1)} className={stepper}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// The cart page. The grow light comes first: the design's lights come in on their
// own (the designer keeps that number in step with the layout) and the visitor can
// add more on top. The under-canopy light and the controller are added on the shop
// page and changed here.
export default function Cart() {
  const { designQty, extraQty, qty, ucl, controller, count, total, setExtraQty, setOtherQty } = useCart();

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <AccountNav />
        </div>
        <h1 className="mt-6 flex items-center gap-3 text-3xl font-bold"><ShoppingCart className="h-7 w-7" /> Your cart</h1>

        {count === 0 ? (
          <div className="mt-8 rounded-2xl border border-industrial-line bg-industrial-surface p-8 text-center">
            <p className="text-industrial-muted">Your cart is empty.</p>
            <p className="mt-2 text-sm text-industrial-muted">Lay out a room in the designer and the grow lights it uses are added here automatically, or pick products in the shop.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild><Link to="/design">Design a room</Link></Button>
              <Button asChild variant="outline"><Link to="/shop">Shop</Link></Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {qty > 0 && (
              <div className="rounded-2xl border border-industrial-line bg-industrial-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{PRODUCT.name}</p>
                    <p className="text-sm text-industrial-muted">{formatPrice(PRODUCT.price)} each</p>
                  </div>
                  <p className="text-lg font-semibold">{formatPrice(qty * PRODUCT.price)}</p>
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
                      <button type="button" aria-label="One fewer" onClick={() => setExtraQty(extraQty - 1)} disabled={extraQty <= 0} className={stepper}><Minus className="h-4 w-4" /></button>
                      <span className="min-w-[2.5rem] text-center text-2xl font-bold">{extraQty}</span>
                      <button type="button" aria-label="One more" onClick={() => setExtraQty(extraQty + 1)} className={stepper}><Plus className="h-4 w-4" /></button>
                    </div>
                    <p className="mt-1 text-sm text-industrial-muted">Spares, or lights for a room you haven't drawn.</p>
                  </div>
                </div>
              </div>
            )}

            {ucl > 0 && <OtherLine product={UCL_PRODUCT} qty={ucl} onChange={(n) => setOtherQty("ucl", n)} />}
            {controller > 0 && <OtherLine product={CONTROLLER_PRODUCT} qty={controller} onChange={(n) => setOtherQty("controller", n)} />}

            <p className="text-sm text-industrial-muted">
              Need more? <Link to="/shop" className="text-primary underline-offset-2 hover:underline">Back to the shop</Link>.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-industrial-line bg-industrial-surface p-5">
              <div>
                <p className="text-sm text-industrial-muted">{count} item{count === 1 ? "" : "s"}</p>
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
