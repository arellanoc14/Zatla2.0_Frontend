import React from "react";
import { Link } from "react-router-dom";
import LogoReveal from "@/components/home/LogoReveal";
import TopLink from "@/components/home/TopLink";
import AccountNav from "@/components/AccountNav";
import { useCart } from "@/lib/cart";

// Top bar for the marketing pages: the wordmark, and the places to go.
export default function SiteHeader() {
  const { count } = useCart();
  return (
    <header className="site-header absolute inset-x-0 top-0 z-20">
      {/* The wordmark floats over the bar at its own size, so it can be big
          without stretching the row height or crowding the links. */}
      <div className="wrap relative flex h-16 items-center justify-end md:h-20">
        <Link to="/" aria-label="ZATLA home" className="nav-link site-logo absolute left-0 inline-flex items-center">
          <LogoReveal />
        </Link>
        <nav aria-label="Site" className="top-nav flex items-center">
          <AccountNav variant="home" />
          <TopLink to="/design">Design</TopLink>
          <TopLink to="/shop">Shop</TopLink>
          <TopLink to="/cart">Cart{count > 0 ? ` (${count})` : ""}</TopLink>
        </nav>
      </div>
    </header>
  );
}
