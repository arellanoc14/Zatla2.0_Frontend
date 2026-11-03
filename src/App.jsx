import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSystemDarkMode } from '@/hooks/useSystemDarkMode';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import RequireAuth from './components/RequireAuth';
import ScrollToTop from './components/ScrollToTop';
import PageLoader from './components/PageLoader';
import Home from '@/pages/Home';

// Home ships in the main bundle — it is the page most visitors land on, and
// waiting on a second request for it would only delay the hero. Every other
// page is split into its own chunk, which keeps three.js and the designer out
// of the first load; PageLoader covers the moment that chunk is fetched.
const Design3D = lazy(() => import('@/pages/Design3D'));
const Shop = lazy(() => import('@/pages/Shop'));
const PublicView = lazy(() => import('@/pages/PublicView'));
const Cart = lazy(() => import('@/pages/Cart'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const OrderSuccess = lazy(() => import('@/pages/OrderSuccess'));
const Play = lazy(() => import('@/pages/Play'));
const Orders = lazy(() => import('@/pages/Orders'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<PageLoader />}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Home /></PageTransition>} />
        {/* The studio is 3D-only: there is no 2D plan anymore. */}
        <Route path="/design" element={<RequireAuth><Design3D /></RequireAuth>} />
        {/* Old addresses of the studio. */}
        <Route path="/design/3d" element={<Navigate to="/design" replace />} />
        <Route path="/studio-3d" element={<Navigate to="/design" replace />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="/order/:id" element={<OrderSuccess />} />
        <Route path="/view/:token" element={<PublicView />} />
        <Route path="/play" element={<Play />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
    </AnimatePresence>
  );
};

function App() {
  useSystemDarkMode();

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AnimatedRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
