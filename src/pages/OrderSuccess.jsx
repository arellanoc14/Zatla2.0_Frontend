import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/product";
import { clearCart } from "@/lib/cart";
import { apiUrl } from "@/lib/api";

// Shows the order the Stripe webhook just marked paid (or still processing,
// for a payment method that confirms asynchronously). Polls briefly because
// the webhook can land a beat after the browser gets back here.
export default function OrderSuccess() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await fetch(apiUrl(`/api/orders/${id}`));
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || "Order not found.");
        if (cancelled) return;
        setOrder(data);
        if (data.status === "paid") {
          clearCart();
        } else if (tries < 10) {
          tries += 1;
          setTimeout(poll, 1500);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-industrial-bg px-6 text-center text-industrial-copy">
      {error ? (
        <>
          <p className="text-industrial-muted">{error}</p>
          <Button asChild className="mt-6"><Link to="/shop">Back to shop</Link></Button>
        </>
      ) : !order ? (
        <Loader2 className="h-8 w-8 animate-spin text-industrial-muted" />
      ) : order.status === "paid" ? (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 text-3xl font-bold">Order confirmed</h1>
          <p className="mt-2 text-industrial-muted">
            {formatPrice(order.amount / 100)} · a confirmation is on its way to {order.email}
          </p>
          <Button asChild className="mt-8"><Link to="/">Back home</Link></Button>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-industrial-muted" />
          <p className="mt-4 text-industrial-muted">Confirming your payment…</p>
        </>
      )}
    </div>
  );
}
