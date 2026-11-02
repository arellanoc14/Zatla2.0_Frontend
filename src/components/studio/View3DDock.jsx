import React from "react";
import { Orbit, Square, Footprints, FlaskConical, Palette, Ruler, Move, Lock } from "lucide-react";
import SpectrumMenu from "./SpectrumMenu";

// The dock floating at the bottom centre of the 3D view (ported from the
// GrowStudios 3D view).
//
//   Row 1 (always)   camera: Orbit / Top / Walk · PPFD · Spectrum · Dimensions
//                    (drops out in top-down)
//   Row 2            the Move toggle for the selected room or equipment
//
// The wrapper is pointer-events-none and only the pills opt back in, so empty
// space around the dock never swallows an orbit drag or a tap on the room.

export const CAMERA_MODES = [
  { id: "orbit", label: "Orbit", icon: Orbit },
  { id: "topdown", label: "Top", icon: Square },
  { id: "walkthrough", label: "Walk", icon: Footprints },
];

const BTN = "h-9 min-w-9 px-2.5 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors shrink-0";
const ON = "bg-emerald-600 text-white";
const OFF = "text-foreground hover:bg-accent";
const PILL = "pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-card/95 backdrop-blur shadow-xl p-1 max-w-full";
const stop = {
  onMouseDown: (e) => e.stopPropagation(),
  onTouchStart: (e) => e.stopPropagation(),
};

export default function View3DDock({
  cameraMode, onChangeCameraMode,
  ppfdOpen = false, onTogglePpfd,
  spectrum = null,
  showDimensions = false, onToggleDimensions,
  move = null,
  className = "bottom-3",
}) {
  const isTopDown = cameraMode === "topdown";
  const current = cameraMode || "orbit";
  const [spectrumOpen, setSpectrumOpen] = React.useState(false);
  const onSpectrumOpen = (v) => { setSpectrumOpen(v); spectrum?.onOpenChange?.(v); };
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center gap-2 px-2 ${className}`}>
      {move && (
        <div className={PILL} {...stop}>
          <button
            type="button"
            onClick={move.onToggle}
            aria-pressed={!!move.active}
            aria-label={move.active ? `Moving the ${move.what} — tap to lock` : `Move the ${move.what}`}
            title={move.active ? `Moving the ${move.what} — tap to lock it` : `Move the ${move.what}`}
            className={`${BTN} ${move.active ? ON : OFF}`}
          >
            {move.active ? <Move className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>{move.active ? "Moving" : `Move ${move.what}`}</span>
          </button>
        </div>
      )}

      <div className={`${PILL} overflow-x-auto no-scrollbar`} {...stop}>
        {typeof onChangeCameraMode === "function" && CAMERA_MODES.map((m) => {
          const Icon = m.icon;
          const active = current === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChangeCameraMode(m.id)}
              aria-pressed={active}
              aria-label={m.label}
              title={m.label}
              className={`${BTN} ${active ? ON : OFF}`}
            >
              <Icon className="w-4 h-4" />
              <span className="max-[379px]:hidden">{m.label}</span>
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px bg-white/15 shrink-0" />
        <button
          type="button"
          onClick={onTogglePpfd}
          aria-pressed={!!ppfdOpen}
          aria-label="PPFD map"
          title="PPFD map"
          className={`${BTN} ${ppfdOpen ? ON : OFF}`}
        >
          <FlaskConical className="w-4 h-4" />
          <span className="hidden xl:inline">PPFD</span>
        </button>
        {spectrum && (
          <SpectrumMenu
            spectrum={spectrum.levels}
            onSet={spectrum.onSet}
            hasSelectedRoom={spectrum.hasSelectedRoom}
            onOpenChange={onSpectrumOpen}
            align="center"
            side="top"
            trigger={(
              <button
                type="button"
                aria-pressed={spectrumOpen}
                aria-label="Spectrum"
                title="Spectrum"
                className={`${BTN} ${spectrumOpen ? ON : OFF}`}
              >
                <Palette className="w-4 h-4" />
                <span className="hidden xl:inline">Spectrum</span>
              </button>
            )}
          />
        )}
        {!isTopDown && typeof onToggleDimensions === "function" && (
          <button
            type="button"
            onClick={onToggleDimensions}
            aria-pressed={!!showDimensions}
            aria-label="Dimensions"
            title="Dimensions"
            className={`${BTN} ${showDimensions ? ON : OFF}`}
          >
            <Ruler className="w-4 h-4" />
            <span className="hidden xl:inline">Dimensions</span>
          </button>
        )}
      </div>
    </div>
  );
}
