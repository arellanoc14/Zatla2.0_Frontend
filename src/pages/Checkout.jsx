import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { PRODUCT, formatPrice } from "@/lib/product";
import { stripePromise } from "@/lib/stripeClient";
import { apiUrl } from "@/lib/api";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

async function api(path, body) {
  const res = await fetch(apiUrl(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

// Collects the customer's info, asks the server for a PaymentIntent (which
// recomputes the total itself — this page's total is a preview, not what's
// actually charged), then mounts Stripe's embedded Payment Element to
// collect card details directly against Stripe. The order is only ever
// marked paid by the server's webhook, never by anything that happens here.
function PayForm({ orderId, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    const { error: payError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (payError) {
      setError(payError.message || "Payment failed. Check your card details and try again.");
      setBusy(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onPaid();
    } else {
      setError("Payment didn't complete. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={!stripe || busy} size="lg" className="w-full gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pay
      </Button>
    </form>
  );
}

export default function Checkout() {
  const navigate = useNavigate();
  const { qty, total } = useCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => qty > 0 && name.trim() && /\S+@\S+\.\S+/.test(email) && line1.trim() && city.trim() && state && postalCode.trim(),
    [qty, name, email, line1, city, state, postalCode],
  );

  const createIntent = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/orders/create-intent", {
        name: name.trim(),
        email: email.trim(),
        shipping: { line1: line1.trim(), line2: line2.trim(), city: city.trim(), state, postalCode: postalCode.trim() },
        items: [{ sku: "grow_light", qty }],
      });
      setClientSecret(data.clientSecret);
      setOrderId(data.orderId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (qty === 0 && !orderId) navigate("/cart", { replace: true });
  }, [qty, orderId, navigate]);

  if (!stripePromise) {
    return (
      <div className="min-h-screen bg-industrial-bg px-6 py-16 text-center text-industrial-copy">
        <p className="text-industrial-muted">Checkout isn&apos;t set up yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-xl px-6 py-8">
        <Link to="/cart" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="h-4 w-4" /> Cart
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Checkout</h1>
        <p className="mt-2 text-sm text-industrial-muted">
          {qty} {PRODUCT.name}{qty === 1 ? "" : "s"} · {formatPrice(total)}
        </p>

        {!clientSecret ? (
          <form onSubmit={createIntent} className="mt-8 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="line1">Address</Label>
              <Input id="line1" value={line1} onChange={(e) => setLine1(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="line2">Apt, suite, etc. (optional)</Label>
              <Input id="line2" value={line2} onChange={(e) => setLine2(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                >
                  <option value="" disabled>Select</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">ZIP</Label>
                <Input id="zip" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required />
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={!canSubmit || busy} size="lg" className="w-full gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue to payment
            </Button>
          </form>
        ) : (
          <div className="mt-8">
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PayForm orderId={orderId} onPaid={() => navigate(`/order/${orderId}`, { replace: true })} />
            </Elements>
          </div>
        )}
      </div>
    </div>
  );
}
