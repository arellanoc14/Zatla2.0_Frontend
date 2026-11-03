import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, User } from "lucide-react";
import TopLink from "@/components/home/TopLink";
import { getToken, useAuth } from "@/lib/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// The account part of the site's top bar, shared by every page that has one.
//   variant "home": the homepage's glowing top links (their styles are scoped to
//                   .home in home.css, including the .account-* collapse rules)
//   variant "page": plain pills for the Shop / Cart / Checkout pages
// Signed in: the account's email with a menu (order history, log out). Signed
// out: Log in / Register. Below 480px the email and "Log in" shrink to a person
// icon and "Register" is left to the log-in page. While a stored token is still
// being checked nothing is shown, so the links don't flash "Log in" at someone
// who is already signed in.
const pill = "inline-flex items-center gap-1.5 rounded-full border border-industrial-line px-3 py-1.5 text-sm outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[#ffd84a]";

export default function AccountNav({ variant = "page" }) {
  const { user, isAuthenticated, authChecked, logout } = useAuth();
  const navigate = useNavigate();
  if (!authChecked && getToken()) return null;

  const home = variant === "home";
  const textCls = home ? "account-text" : "hidden min-[480px]:inline";
  const iconCls = home ? "account-icon h-4 w-4" : "h-4 w-4 min-[480px]:hidden";

  if (!isAuthenticated) {
    const labelled = (
      <>
        <span className={textCls}>Log in</span>
        <User className={iconCls} aria-hidden="true" />
      </>
    );
    return home ? (
      <>
        <TopLink to="/login" aria-label="Log in">{labelled}</TopLink>
        <TopLink to="/register" className="account-text-link">Register</TopLink>
      </>
    ) : (
      <div className="flex items-center gap-2">
        <Link to="/login" aria-label="Log in" className={pill}>{labelled}</Link>
        <Link to="/register" className={`${pill} hidden min-[480px]:inline-flex`}>Register</Link>
      </div>
    );
  }

  const name = user?.email || "My Account";
  const signOut = async () => {
    await logout();
    navigate("/");
  };
  const label = (
    <span className={home ? "top-link-label inline-flex max-w-[14rem] items-center gap-1" : "inline-flex max-w-[14rem] items-center gap-1"}>
      <span className={`${textCls} truncate`}>{name}</span>
      <User className={iconCls} aria-hidden="true" />
      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </span>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={home ? "top-link" : pill} aria-label={`Account menu for ${name}`}>{label}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem] border-industrial-line bg-industrial-surface text-industrial-copy">
        <DropdownMenuLabel className="truncate text-xs font-normal text-industrial-muted">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-industrial-line" />
        <DropdownMenuItem asChild className="cursor-pointer"><Link to="/orders">Order History</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut} className="cursor-pointer">Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
