import React, { useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Minus, Plus } from "lucide-react";
import { stepValue } from "@/lib/growroom/design3d";

// Field primitives for the 3D view's design panels (Design3DPanel and the dock).
// Every control is READ-ONLY AWARE: with `readOnly` it renders as a plain
// label / value row, which is how the public share viewer and the walkthrough
// camera show the same panel without letting anything change.

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

// A titled group of fields ("ROOM", "AISLES", …), PIPP-style small caps header.
export function PanelSection({ title, hint = null, children }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-300/90">{title}</h3>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// The rounded card each field sits on.
export function FieldCard({ children, className = "" }) {
  return <div className={`rounded-xl border border-white/10 bg-background/40 px-3 py-2.5 ${className}`}>{children}</div>;
}

// Read-only label / value row (also the Results panel's row).
export function SpecRow({ label, value, sub = null, tone = null }) {
  const toneClass = tone === "fail" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/5 last:border-b-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold tabular-nums text-right ${toneClass}`}>
        {value}
        {sub && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

export const FIELD_LABEL = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const roundBtn = "h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full border border-white/15 bg-card text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none";

// PIPP's number control: the value top-right (tap it to type), and a
// − slider + row under it. A gesture COMMITS ONCE — on slider release, on
// Enter / blur of the typed value, or 400ms after the last −/+ tap — because
// every commit re-lays out the room and rebuilds the 3D scene; committing per
// slider tick would rebuild the scene dozens of times a second. While a change
// is pending the field shows it; a pending −/+ change is still committed if the
// field unmounts (switching tabs mid-burst must not drop it).
export function StepperField({
  label, value, unit = "", sub = null, min = 0, max = 999, step = 1,
  sliderMin = min, sliderMax = max, onCommit, readOnly = false, disabled = false, hint = null,
}) {
  const [draft, setDraft] = useState(null);
  const [typed, setTyped] = useState(null);
  const draftRef = useRef(null);
  const timerRef = useRef(0);
  const slidingRef = useRef(false);
  const cancelTypeRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const clamp = (v) => Math.min(max, Math.max(min, v));
  const setD = (v) => { draftRef.current = v; setDraft(v); };
  const flush = () => {
    clearTimeout(timerRef.current);
    timerRef.current = 0;
    const v = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (v != null && Number.isFinite(v) && v !== valueRef.current) commitRef.current?.(v);
  };
  const schedule = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 400);
  };

  // A slider drag ends on the WINDOW's pointerup (the pointer can leave the
  // track), not via Radix's onValueCommit — that one is skipped when the drag
  // ends where it started, which would strand the draft.
  useEffect(() => {
    const end = () => { if (slidingRef.current) { slidingRef.current = false; flush(); } };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (draftRef.current != null) flush();
    };
  }, []);

  const shown = draft ?? (Number(value) || 0);

  if (readOnly) {
    return <SpecRow label={label} value={`${round1(shown)}${unit ? ` ${unit}` : ""}`} sub={sub} />;
  }

  const bump = (dir) => {
    setD(stepValue(draftRef.current ?? (Number(valueRef.current) || 0), dir * step, min, max));
    schedule();
  };
  const commitTyped = () => {
    const raw = typed;
    setTyped(null);
    if (cancelTypeRef.current) { cancelTypeRef.current = false; return; }
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    setD(clamp(n));
    flush();
  };

  return (
    <FieldCard className={disabled ? "opacity-50" : ""}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pt-1">
          <div className={FIELD_LABEL}>{label}</div>
          {(hint || sub) && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint || sub}</div>}
        </div>
        <label className="flex items-baseline gap-1 shrink-0">
          <input
            type="number"
            inputMode="decimal"
            aria-label={label}
            disabled={disabled}
            value={typed ?? String(round1(shown))}
            onFocus={(e) => { setTyped(String(round1(shown))); e.target.select(); }}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { cancelTypeRef.current = true; e.currentTarget.blur(); }
            }}
            className="w-[4.5ch] bg-transparent text-right text-lg font-bold tabular-nums text-foreground outline-none rounded focus:ring-1 focus:ring-emerald-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
        </label>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" className={roundBtn} disabled={disabled || shown <= min} onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <Slider.Root
          value={[Math.min(sliderMax, Math.max(sliderMin, shown))]}
          min={sliderMin}
          max={sliderMax}
          step={step}
          disabled={disabled}
          onPointerDown={() => { slidingRef.current = true; clearTimeout(timerRef.current); }}
          onValueChange={([n]) => { setD(n); if (!slidingRef.current) schedule(); }}
          aria-label={label}
          className="relative flex h-6 flex-1 touch-none select-none items-center"
        >
          <Slider.Track className="relative h-1.5 grow rounded-full bg-white/15">
            <Slider.Range className="absolute h-full rounded-full bg-emerald-600/70" />
          </Slider.Track>
          <Slider.Thumb className="block h-4 w-4 rounded-full bg-emerald-500 shadow ring-2 ring-background focus-visible:outline-none focus-visible:ring-emerald-300" />
        </Slider.Root>
        <button type="button" className={roundBtn} disabled={disabled || shown >= max} onClick={() => bump(1)} aria-label={`Increase ${label}`}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </FieldCard>
  );
}

// A row of mutually exclusive choices (bench width, rows run, light model…).
// `cols` fixes a grid; without it the options share one row. Read-only renders
// the chosen option's label as a plain row.
export function Segmented({ label = "", options, value, onChange, readOnly = false, disabled = false, cols = 0, bare = false }) {
  const current = options.find((o) => o.key === value);
  if (readOnly) return <SpecRow label={label} value={current?.label ?? "—"} />;
  const body = (
    <>
      {label && <div className={`${FIELD_LABEL} mb-1.5`}>{label}</div>}
      <div
        className={cols ? "grid gap-1.5" : "flex gap-1.5"}
        style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => {
          const active = o.key === value;
          const Icon = o.icon;
          return (
            <button
              key={String(o.key)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => { if (!active) onChange?.(o.key); }}
              title={o.title || o.label}
              className={`min-w-0 flex-1 h-9 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                active
                  ? "bg-emerald-600 text-white shadow"
                  : "border border-white/15 bg-card text-foreground hover:bg-accent"
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
  return bare ? <div>{body}</div> : <FieldCard>{body}</FieldCard>;
}
