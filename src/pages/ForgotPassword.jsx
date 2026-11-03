import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api";

// Asks the server to email a reset link. The API deliberately never says whether
// the address has an account, so this page doesn't either: whatever comes back
// (success, a server hiccup, no connection), the same message is shown.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(apiUrl("/api/auth/forgot"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // Same confirmation either way.
    }
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-xl px-6 py-8">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="h-4 w-4" /> Back to log in
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Forgot your password?</h1>
        <p className="mt-2 text-sm text-industrial-muted">Enter your email and we'll send you a link to choose a new one.</p>

        {sent ? (
          <div role="status" className="mt-8 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
            If an account exists for that email, a reset link was sent. The link works once and expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" size="lg" disabled={busy} className="w-full gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
