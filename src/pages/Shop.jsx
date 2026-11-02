import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProductModel3D from "@/components/shop/ProductModel3D";
import { ArrowLeft, Check, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { PRODUCT, formatPrice } from "@/lib/product";
import { useCart } from "@/lib/cart";

// Checkout moves to Stripe Checkout on this app's own server in a later step;
// until then the button says so plainly.
export default function Shop() {
  const success = new URLSearchParams(window.location.search).get("success");
  const { qty, total, designQty, addExtra, removeOne, clearCart } = useCart();

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        {success && (
          <div className="mt-6 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">Thank you! Your order has been placed.</div>
        )}
        <div className="mt-8 grid md:grid-cols-2 gap-10 items-center">
          <div className="rounded-2xl bg-industrial-surface border border-industrial-line aspect-square overflow-hidden">
            <ProductModel3D />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Shop</p>
            <h1 className="mt-2 text-4xl font-bold">{PRODUCT.name}</h1>
            <p className="mt-3 text-3xl font-semibold">{formatPrice(PRODUCT.price)}</p>
            <p className="mt-4 text-industrial-muted">{PRODUCT.description}</p>
            <ul className="mt-6 space-y-2">
              {PRODUCT.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />{f}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" className="gap-2" onClick={() => addExtra(1)}>
                <ShoppingCart className="w-4 h-4" /> Add to cart
              </Button>
              <Button asChild size="lg" variant="outline"><Link to="/cart">Cart{qty > 0 ? ` (${qty})` : ""}</Link></Button>
            </div>
            {qty > 0 && (
              <div className="mt-6 rounded-xl border border-industrial-line bg-industrial-surface p-4" aria-label="Your cart">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{PRODUCT.name}</p>
                    <p className="text-xs text-industrial-muted">
                      {qty} in cart{designQty > 0 ? ` · ${designQty} from your design` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">{formatPrice(total)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Remove one" onClick={removeOne} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-industrial-line hover:bg-white/5"><Minus className="h-4 w-4" /></button>
                    <span className="min-w-[2rem] text-center text-lg font-bold" aria-live="polite">{qty}</span>
                    <button type="button" aria-label="Add one" onClick={() => addExtra(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-industrial-line hover:bg-white/5"><Plus className="h-4 w-4" /></button>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={clearCart}>
                    <Trash2 className="h-4 w-4" /> Empty cart
                  </Button>
                </div>
              </div>
            )}
            <p className="mt-3 text-sm text-industrial-muted">Lights placed in the <Link to="/design" className="text-primary underline-offset-2 hover:underline">designer</Link> are added to your cart automatically.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
