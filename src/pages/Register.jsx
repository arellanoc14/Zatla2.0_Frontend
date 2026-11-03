import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api";
import { redirectTarget, useAuth } from "@/lib/AuthContext";

const MIN_PASSWORD = 8;

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [taken, setTaken] = useState(false);

  const mismatch = confirm !== "" && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setTaken(false);
    if (password.length < MIN_PASSWORD) return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        login(data.token, data.user);
        navigate(redirectTarget(search), { replace: true });
        return;
      }
      if (res.status === 409) { setTaken(true); setError("That email is already registered."); }
      else if (res.status === 429) setError("Too many attempts. Please wait a while and try again.");
      else setError(data.error || "Couldn't create your account. Please try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-xl px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Create an account</h1>
        <p className="mt-2 text-sm text-industrial-muted">Use an email and a password of at least {MIN_PASSWORD} characters.</p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} required />
            {mismatch && <p className="text-xs text-red-400">The two passwords don't match.</p>}
          </div>
          {error && (
            <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
              {error} {taken && <Link to={`/login${search}`} className="text-primary underline-offset-2 hover:underline">Log in instead</Link>}
            </div>
          )}
          <Button type="submit" size="lg" disabled={busy || mismatch} className="w-full gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Register
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-industrial-muted">
          Already have an account? <Link to={`/login${search}`} className="text-primary underline-offset-2 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
