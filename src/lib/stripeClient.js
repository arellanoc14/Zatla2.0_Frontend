import { loadStripe } from "@stripe/stripe-js";

// Loaded once and reused everywhere Elements mounts. The publishable key
// isn't secret, so it's a normal build-time Vite variable — set
// VITE_STRIPE_PUBLISHABLE_KEY (pk_test_... or pk_live_...) wherever the site
// is built. null until it's set, so Checkout.jsx can show a clear message
// instead of a blank crash.
const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
export const stripePromise = key ? loadStripe(key) : null;
