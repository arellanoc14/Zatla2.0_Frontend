import React from "react";
import {
  ChevronDown, ChevronRight, ChevronUp, X, FlaskConical, PanelLeftClose, SlidersHorizontal,
} from "lucide-react";
import HomeButton from "./HomeButton";
import PpfdMapChart from "./PpfdMapChart";
import Design3DPanel, { DESIGN_SECTIONS } from "./Design3DPanel";
import Results3DPanel from "./Results3DPanel";
import View3DDock from "./View3DDock";
import { view3dLayout, roomResults, fmtFeet } from "@/lib/growroom/design3d";

// The 3D view's chrome, ported from the GrowStudios 3D view and themed to
// ZATLA's products. It replaced the single "Options" drop-down: every option
// now sits in view, in one of three layouts picked from the window size
// (lib/growroom/design3d.view3dLayout):
//
//   desktop  [Design panel] [3D + dock] [Results panel]
//   side     [tabbed Design / Results panel] [3D + dock]   (phone held sideways)
//   sheet    [3D + dock] over a tabbed bottom sheet         (phone held upright)
//
// The 3D canvas arrives as `children` (Walkthrough3D's mount div, bench-fade
// snapshot, loading / error screens, equipment controls). That subtree must
// keep ONE position in the React tree through every layout change and the PPFD
// view: the renderer appends its <canvas> to the mount div once, so a
// remounted div would leave a dead, empty 3D view. Hence the fixed three slots
// below — only class names and the side / end slots' contents change.

const BAR_BTN = "h-9 min-w-9 px-2.5 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors shrink-0";
const BAR_SOLID = "border border-white/10 bg-card/95 backdrop-blur shadow text-foreground hover:bg-accent";
const stop = {
  onMouseDown: (e) => e.stopPropagation(),
  onTouchStart: (e) => e.stopPropagation(),
};

function useView3DLayout() {
  const read = () => (typeof window === "undefined" ? "desktop" : view3dLayout(window.innerWidth, window.innerHeight));
  const [layout, setLayout] = React.useState(read);
  React.useEffect(() => {
    const update = () => setLayout(read());
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return layout;
}

function TabBar({ tab, onTab, compact = false }) {
  return (
    <div className={`grid grid-cols-2 rounded-full border border-white/10 bg-background/60 ${compact ? "gap-0.5 p-0.5" : "gap-1 p-1"}`} role="tablist">
      {[["design", "Design"], ["results", "Results"]].map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          onClick={() => onTab(k)}
          className={`${compact ? "h-7 text-[11px]" : "h-9 text-xs"} rounded-full font-bold uppercase tracking-[0.12em] transition-colors ${
            tab === k ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionBar({ section, onSection, compact = false }) {
  return (
    <div className={`flex overflow-x-auto no-scrollbar ${compact ? "gap-1" : "gap-1.5"}`} role="tablist">
      {DESIGN_SECTIONS.map((s) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={section === s.key}
          onClick={() => onSection(s.key)}
          className={`${compact ? "h-7 px-3 text-[11px]" : "h-8 px-3.5 text-xs"} shrink-0 rounded-full font-bold uppercase tracking-wide transition-colors ${
            section === s.key ? "bg-emerald-600 text-white" : "border border-white/15 text-foreground hover:bg-accent"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// The PPFD view's own minimal chrome: the PPFD button (leaves the view), a
// Top / 3D camera toggle (the colour layer stays on while orbiting) and the
// light's spec-sheet card — the numbers live there, the 3D tiles are colour
// only.
function PpfdControls({ onClose, cameraMode, onChangeCameraMode, ppfdSheet }) {
  const [sheetOpen, setSheetOpen] = React.useState(true);
  const camBtn = (m, label) => (
    <button
      type="button"
      onClick={() => onChangeCameraMode?.(m)}
      aria-pressed={cameraMode === m}
      className={`h-9 px-3 text-xs font-semibold transition-colors ${
        cameraMode === m ? "bg-emerald-600/40 text-emerald-100" : "text-white/70 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div
        className="absolute flex flex-col items-start gap-2"
        style={{ top: "max(env(safe-area-inset-top, 0px), 12px)", left: "max(env(safe-area-inset-left, 0px), 12px)" }}
      >
        <div className="pointer-events-auto flex items-center gap-2" {...stop}>
          <button
            type="button"
            onClick={onClose}
            aria-label="PPFD map (tap to close)"
            aria-pressed
            className="h-11 px-4 rounded-full inline-flex items-center gap-2 border border-emerald-500/50 bg-emerald-600/30 backdrop-blur text-sm font-semibold text-emerald-200 shadow-lg"
          >
            <FlaskConical className="w-4 h-4" />
            <span>PPFD</span>
            <X className="w-4 h-4 opacity-80" />
          </button>
          {typeof onChangeCameraMode === "function" && (
            <div className="inline-flex rounded-full overflow-hidden border border-white/15 bg-black/50 backdrop-blur shadow-lg">
              {camBtn("topdown", "Top")}
              {camBtn("orbit", "3D")}
            </div>
          )}
        </div>
        {ppfdSheet?.map ? (
          <div className="pointer-events-auto w-[260px] max-w-[calc(100vw-24px)] rounded-xl border border-white/10 bg-black/75 backdrop-blur shadow-xl" {...stop}>
            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-expanded={sheetOpen}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              <span className="text-xs font-semibold text-white truncate">
                {ppfdSheet.label} · {ppfdSheet.watts.toLocaleString()}W spec sheet
              </span>
              {sheetOpen
                ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-white/70" />
                : <ChevronRight className="w-3.5 h-3.5 ml-auto text-white/70" />}
            </button>
            {sheetOpen && (
              <div className="px-3 pb-3 max-h-[45vh] overflow-y-auto">
                <PpfdMapChart key={`${ppfdSheet.label}|${ppfdSheet.watts}`} map={ppfdSheet.map} />
                <p className="mt-2 text-[10px] leading-snug text-white/50">
                  µmol/m²/s per fixture, as printed. Each light in the room shows this map over its own footprint.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="pointer-events-auto max-w-[260px] rounded-xl border border-white/10 bg-black/75 px-3 py-2 text-[11px] text-white/70 backdrop-blur" {...stop}>
            This room has no grow lights. Turn on the ZATLA Grow Light under Lights to see its PPFD.
          </div>
        )}
      </div>
    </div>
  );
}

export default function View3DOverlay({
  children,
  // First scene build still running: the panels show, the floating controls
  // wait (the canvas slot carries the loading screen).
  loading = false,
  doc,
  cameraMode, onChangeCameraMode,
  showDimensions, setShowDimensions,
  hasSelectedRoom = false,
  onSetLightModel, onSetCanopyMode,
  ceilingIn, onSetCeiling,
  // StudioEditor's room / aisle / bench / controller handlers. Null = read-only.
  design = null,
  onSelectRoom,
  // Light beams / photons switches for the Lights section, or null.
  display = null,
  // Spectrum popover in the dock: { levels, onSet, hasSelectedRoom, onOpenChange }, or null.
  spectrum = null,
  // PPFD toggle → the 3D spec-sheet map layer shows / hides.
  onPpfdOpenChange,
  // The active room's printed spec sheet ({ map, label, watts }); null when the
  // room has no grow lights.
  ppfdSheet = null,
  // The Move toggle for the selected room or equipment: { active, onToggle, what }.
  move = null,
  // The page's own buttons (cart, share), pinned to the 3D's top-right corner.
  actions = null,
}) {
  const layout = useView3DLayout();
  const [ppfdOpen, setPpfdOpen] = React.useState(false);
  const [tab, setTab] = React.useState("design");
  const [section, setSection] = React.useState("room");
  // Phone layouts start out of the way: the sheet peeks (summary + tabs only);
  // the 3D is what you came to see.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sideCollapsed, setSideCollapsed] = React.useState(false);

  React.useEffect(() => {
    onPpfdOpenChange?.(ppfdOpen);
  }, [ppfdOpen, onPpfdOpenChange]);

  // PPFD is a plain toggle: on → jump to top-down so the spec-sheet maps over
  // the lights read flat; off → back to the view the user was in.
  const ppfdPrevModeRef = React.useRef(null);
  const togglePpfd = () => {
    const on = !ppfdOpen;
    if (typeof onChangeCameraMode === "function") {
      if (on && cameraMode !== "topdown") { ppfdPrevModeRef.current = cameraMode; onChangeCameraMode("topdown"); }
      if (!on && ppfdPrevModeRef.current && cameraMode === "topdown") onChangeCameraMode(ppfdPrevModeRef.current);
      if (!on) ppfdPrevModeRef.current = null;
    }
    setPpfdOpen(on);
  };

  // Editing needs a room and a camera that survives a rebuild: the
  // walkthrough's first-person position resets on every scene rebuild.
  const editable = cameraMode !== "walkthrough" && !!hasSelectedRoom;
  const note = cameraMode === "walkthrough"
    ? "Switch to Orbit or Top to edit the room."
    : !hasSelectedRoom ? "Tap a room to edit it." : null;

  const designProps = {
    doc, design, editable, note, onSelectRoom,
    onSetLightModel, onSetCanopyMode,
    ceilingIn, onSetCeiling, display,
  };

  const header = (extra) => (
    <div className="shrink-0 flex items-center gap-2 px-3 h-14 border-b border-white/10">
      <HomeButton compact />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground truncate">Designer</span>
      <div className="ml-auto flex items-center gap-1.5">{extra}</div>
    </div>
  );
  const tabbedBody = (pad) => (
    <>
      <div className={`shrink-0 ${pad} space-y-2`}>
        <TabBar tab={tab} onTab={setTab} />
        {tab === "design" && <SectionBar section={section} onSection={setSection} />}
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar ${pad} pb-4 pt-3`}>
        {tab === "design"
          ? <Design3DPanel {...designProps} section={section} />
          : <Results3DPanel doc={doc} />}
      </div>
    </>
  );

  // ── Slot 1: the panel left of the 3D ──────────────────────────────────────
  let start = null;
  if (!ppfdOpen && layout === "desktop") {
    start = (
      <aside className="w-[300px] shrink-0 h-full min-h-0 flex flex-col bg-card border-r border-white/10" aria-label="Design">
        {header(null)}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-3 py-4">
          <Design3DPanel {...designProps} />
        </div>
      </aside>
    );
  } else if (!ppfdOpen && layout === "side" && !sideCollapsed) {
    start = (
      <aside className="w-[288px] max-w-[48vw] shrink-0 h-full min-h-0 flex flex-col bg-card border-r border-white/10" aria-label="Design and results">
        {header(
          <button
            type="button"
            onClick={() => setSideCollapsed(true)}
            aria-label="Hide the panel"
            title="Hide the panel"
            className={`${BAR_BTN} ${BAR_SOLID}`}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
        {tabbedBody("px-3 pt-3")}
      </aside>
    );
  }

  // ── Slot 3: the Results panel right of the 3D, or the bottom sheet ────────
  let end = null;
  if (!ppfdOpen && layout === "desktop") {
    end = (
      <aside className="w-[300px] shrink-0 h-full min-h-0 flex flex-col bg-card border-l border-white/10" aria-label="Results">
        <div className="shrink-0 flex items-center px-4 h-14 border-b border-white/10">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Results</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-3 py-4">
          <Results3DPanel doc={doc} />
        </div>
      </aside>
    );
  } else if (!ppfdOpen && layout === "sheet") {
    const roomName = (doc?.rooms || []).find((r) => r.id === doc?.activeRoomId)?.name || doc?.name || "";
    end = (
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        summary={roomResults(doc)}
        roomName={roomName}
        tab={tab}
        onTab={(t) => { setTab(t); setSheetOpen(true); }}
        section={section}
        onSection={setSection}
      >
        {tab === "design"
          ? <Design3DPanel {...designProps} section={section} />
          : <Results3DPanel doc={doc} />}
      </BottomSheet>
    );
  }

  return (
    <div className={`flex w-full h-full min-w-0 min-h-0 overflow-hidden ${layout === "sheet" ? "flex-col" : "flex-row"}`}>
      {start}
      {/* Slot 2 — the 3D. Never conditional, never re-parented (see top). */}
      <div className="relative flex-1 min-w-0 min-h-0">
        {children}
        {!loading && ppfdOpen && (
          <PpfdControls
            onClose={togglePpfd}
            cameraMode={cameraMode}
            onChangeCameraMode={onChangeCameraMode}
            ppfdSheet={ppfdSheet}
          />
        )}
        {!loading && !ppfdOpen && (
          <>
            {layout === "sheet" && (
              <div className="pointer-events-none absolute top-3 left-3 z-30">
                <div className="pointer-events-auto" {...stop}><HomeButton compact /></div>
              </div>
            )}
            {layout === "side" && sideCollapsed && (
              <div className="pointer-events-none absolute top-3 left-3 z-30 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSideCollapsed(false)}
                  aria-label="Show the design panel"
                  className={`pointer-events-auto ${BAR_BTN} ${BAR_SOLID}`}
                  {...stop}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Design</span>
                </button>
                <div className="pointer-events-auto" {...stop}><HomeButton compact /></div>
              </div>
            )}
          </>
        )}
        {!loading && actions && (
          <div className="pointer-events-none absolute top-3 right-3 z-30 flex items-center gap-2">
            <div className="pointer-events-auto flex items-center gap-2" {...stop}>{actions}</div>
          </div>
        )}
        {!loading && (
          <View3DDock
            cameraMode={cameraMode}
            onChangeCameraMode={onChangeCameraMode}
            ppfdOpen={ppfdOpen}
            onTogglePpfd={togglePpfd}
            spectrum={ppfdOpen ? null : spectrum}
            showDimensions={showDimensions}
            onToggleDimensions={!ppfdOpen && typeof setShowDimensions === "function" ? () => setShowDimensions((v) => !v) : undefined}
            move={ppfdOpen ? null : move}
          />
        )}
      </div>
      {end}
    </div>
  );
}

// Phone (upright) bottom sheet: a handle, the room's headline numbers and the
// Design / Results tabs always show; the body opens to ~40% of the screen.
// It SNAPS between the two heights — an animated height would resize the
// WebGL canvas every frame — and the 3D above it shrinks rather than hides.
function BottomSheet({ open, onOpenChange, summary, roomName, tab, onTab, section, onSection, children }) {
  const startY = React.useRef(null);
  const moved = React.useRef(0);
  const swipe = {
    onTouchStart: (e) => { startY.current = e.touches[0].clientY; moved.current = 0; },
    onTouchMove: (e) => { if (startY.current != null) moved.current = e.touches[0].clientY - startY.current; },
    onTouchEnd: () => {
      if (moved.current < -32) onOpenChange(true);
      else if (moved.current > 32) onOpenChange(false);
      startY.current = null;
      moved.current = 0;
    },
  };
  return (
    <div
      className="shrink-0 flex flex-col min-h-0 rounded-t-2xl border-t border-white/10 bg-card shadow-2xl"
      style={{ height: open ? "min(40vh, 380px)" : undefined, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Design and results"
      {...stop}
    >
      <div {...swipe}>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-label={open ? "Collapse the panel" : "Expand the panel"}
          className="w-full h-4 flex items-center justify-center"
        >
          <span className="block w-9 h-1 rounded-full bg-muted-foreground/40" />
        </button>
        <div className="px-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold tabular-nums leading-none">{(summary?.canopySqft || 0).toLocaleString()}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">ft² canopy</span>
            </div>
            {summary && (
              <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                {[
                  roomName,
                  `${fmtFeet(summary.widthFt)} × ${fmtFeet(summary.lengthFt)}`,
                  `${summary.growLight.count} ${summary.growLight.count === 1 ? "light" : "lights"}`,
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? "Collapse the panel" : "Expand the panel"}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          >
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="shrink-0 px-3 pt-1.5 pb-2 space-y-1.5">
        <TabBar tab={tab} onTab={onTab} compact />
        {open && tab === "design" && <SectionBar section={section} onSection={onSection} compact />}
      </div>
      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}
