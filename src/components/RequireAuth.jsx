import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import PageLoader from "@/components/PageLoader";
import { useAuth } from "@/lib/AuthContext";

// Wraps a page that needs a signed-in visitor (the 3D design tool, checkout).
// While the stored token is still being checked it shows the page loader, so a
// signed-in visitor is never bounced to /login by a check that has not finished.
// Signed out: on to /login?redirect=<where they were headed>, which the log-in
// and register pages send them back to.
export default function RequireAuth({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const { pathname, search } = useLocation();
  if (isLoadingAuth) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to={`/login?redirect=${encodeURIComponent(pathname + search)}`} replace />;
  return children;
}
