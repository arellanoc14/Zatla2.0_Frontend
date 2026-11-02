import React from "react";
import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

// "Home" in the studio's top bar: back to the home page. The design is saved
// in this browser as you work (LocalDesignSaver flushes on the way out), so
// leaving never loses or resets the room. Icon only on phones, where the top
// row is tight; the label stays in the accessible name.
export default function HomeButton({ compact = false }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      aria-label="Home"
      title="Home"
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-slate-950/85 text-xs font-semibold text-white shadow-lg backdrop-blur transition-transform active:scale-95 ${compact ? "w-10 px-0" : "px-3.5"}`}
    >
      <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact && <span className="leading-none">Home</span>}
    </button>
  );
}
