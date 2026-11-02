import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/product";
import { clearCart } from "@/lib/cart";
import { apiUrl } from "@/lib/api";

// Shows the order once the server has it paid. The server checks the payment
// with Stripe on every poll while the order is pending, so this normally
// resolves within a few seconds even if Stripe's webhook is slow; a payment
// method that confirms asynchronously can take longer. Polling stops after
// WAIT_MS (a minute) and says so, instead of spinning forever; "Check again"
// starts another minute.
const WAIT_MS = 60_000;

export default function OrderSuccess() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by "Check again"

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();
    setTimedOut(false);
    // A hard stop, so a request that hangs can't keep the spinner going past the minute.
    const stopTimer = setTimeout(() => { if (!cancelled) setTimedOut(true); }, WAIT_MS);

    const poll = async () => {
      try {
        const res = await fetch(apiUrl(`/api/orders/${id}`));
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || "Order not found.");
        if (cancelled) return;
        setOrder(data);
        if (data.status === "paid") {
          clearTimeout(stopTimer);
          clearCart();
          return;
        }
        if (data.status === "failed") { clearTimeout(stopTimer); return; }
        const elapsed = Date.now() - startedAt;
        if (elapsed >= WAIT_MS) return;
        timer = setTimeout(poll, elapsed < 20_000 ? 2000 : 4000);
      } catch (err) {
        if (!cancelled) { clearTimeout(stopTimer); setError(err.message); }
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(stopTimer); };
  }, [id, attempt]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-industrial-bg px-6 text-center text-industrial-copy">
      {error ? (
        <>
          <p className="text-industrial-muted">{error}</p>
          <Button asChild className="mt-6"><Link to="/shop">Back to shop</Link></Button>
        </>
      ) : order?.status === "paid" ? (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 text-3xl font-bold">Order confirmed</h1>
          <p className="mt-2 text-industrial-muted">
            {formatPrice(order.amount / 100)} · a confirmation is on its way to {order.email}
          </p>
          <Button asChild className="mt-8"><Link to="/">Back home</Link></Button>
        </>
      ) : order?.status === "failed" ? (
        <>
          <h1 className="text-2xl font-bold">Your payment didn't go through</h1>
          <p className="mt-3 max-w-md text-industrial-muted">
            This order wasn't placed. Your cart is still there, so you can go back and try again.
          </p>
          <Button asChild className="mt-8"><Link to="/cart">Back to cart</Link></Button>
        </>
      ) : timedOut ? (
        <>
          <h1 className="text-2xl font-bold">We haven't confirmed your payment yet</h1>
          <p className="mt-3 max-w-md text-industrial-muted">
            If you were charged, please don't pay again. We'll email a confirmation
            {order?.email ? <> to {order.email}</> : null} as soon as it comes through.
          </p>
          <p className="mt-2 text-xs text-industrial-muted">Order reference: {id.slice(0, 8)}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => setAttempt((n) => n + 1)}>Check again</Button>
            <Button asChild variant="outline"><Link to="/shop">Back to shop</Link></Button>
          </div>
        </>
      ) : !order ? (
        <Loader2 className="h-8 w-8 animate-spin text-industrial-muted" />
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-industrial-muted" />
          <p className="mt-4 text-industrial-muted">Confirming your payment…</p>
        </>
      )}
    </div>
  );
}
