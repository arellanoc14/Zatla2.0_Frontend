import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api";
import { redirectTarget, useAuth } from "@/lib/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
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
      if (res.status === 401) setError("Wrong email or password.");
      else if (res.status === 429) setError("Too many attempts. Please wait a few minutes and try again.");
      else setError(data.error || "Couldn't log you in. Please try again.");
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
        <h1 className="mt-6 text-3xl font-bold">Log in</h1>
        <p className="mt-2 text-sm text-industrial-muted">Welcome back.</p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary underline-offset-2 hover:underline">Forgot password?</Link>
            </div>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}
          <Button type="submit" size="lg" disabled={busy} className="w-full gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-industrial-muted">
          Need an account? <Link to={`/register${search}`} className="text-primary underline-offset-2 hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
