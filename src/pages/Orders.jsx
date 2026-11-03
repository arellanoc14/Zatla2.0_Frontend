import React from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken, useAuth } from "@/lib/AuthContext";

// Placeholder: the account's past orders will be listed here. Orders aren't
// linked to accounts yet, so for now this only says so.
export default function Orders() {
  const { isAuthenticated, authChecked } = useAuth();
  if (!authChecked && getToken()) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-copy">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-industrial-muted hover:text-industrial-copy">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Order History</h1>
        <div className="mt-8 rounded-2xl border border-industrial-line bg-industrial-surface p-8 text-center">
          <p className="text-industrial-muted">Your past orders will show up here soon.</p>
          <Button asChild className="mt-6"><Link to="/shop">Shop</Link></Button>
        </div>
      </div>
    </div>
  );
}
