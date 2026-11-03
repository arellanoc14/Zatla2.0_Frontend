import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api";

const MIN_PASSWORD = 8;

// Opened from the emailed link (/reset-password?token=…): picks a new password
// and sends { token, password } to the server. An expired, invalid or
// already-used token comes back as an error from the server and is shown with a
// link to ask for a new one.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // The link was opened without a token, or the server said the token is no good.
  const [linkBad, setLinkBad] = useState(!token);

  const mismatch = confirm !== "" && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD) return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/auth/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDone(true);
      } else if (res.status === 400 && /link/i.test(data.error || "")) {
        // Expired, invalid or already used.
        setLinkBad(true);
        setError(data.error);
      } else {
        setError(data.error || "Couldn't reset your password. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-xl px-6 py-8">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="h-4 w-4" /> Back to log in
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Choose a new password</h1>

        {done ? (
          <div className="mt-8 space-y-4">
            <div role="status" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">Your password has been changed.</div>
            <Button asChild size="lg" className="w-full"><Link to="/login">Log in</Link></Button>
          </div>
        ) : linkBad ? (
          <div className="mt-8 space-y-4">
            <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
              {error || "This reset link isn't valid, has expired, or was already used."}
            </div>
            <Button asChild size="lg" className="w-full"><Link to="/forgot-password">Request a new reset link</Link></Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="text-xs text-industrial-muted">At least {MIN_PASSWORD} characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} required />
              {mismatch && <p className="text-xs text-red-400">The two passwords don't match.</p>}
            </div>
            {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}
            <Button type="submit" size="lg" disabled={busy || mismatch} className="w-full gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Change password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
