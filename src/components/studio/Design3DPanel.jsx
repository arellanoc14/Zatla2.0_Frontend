import React, { useEffect, useState } from "react";
import { Cpu, Plus, Minus } from "lucide-react";
import { fmtFtIn } from "@/lib/growroom/conflicts";
import { roomCanopyMode, MAX_ROOM_DIM_FT } from "@/lib/growroom/design3d";
import { PanelSection, FieldCard, StepperField, Segmented, SpecRow, FIELD_LABEL } from "./DesignFields";

// The 3D view's Design panel: every setting of the SELECTED room (the doc's
// active room) in one place — ported from the GrowStudios 3D panel and cut
// down to ZATLA's three products: the ZATLA Grow Light, the under-canopy light
// (UCL) and the controller. The room, aisle and bench fields stay because the
// lights are laid out over the benches.
//
// It owns no data. Room / aisle / bench / controller edits go through `design`
// (StudioEditor's handlers, the same layout pipeline as every room control),
// and lights / UCL / ceiling through Walkthrough3D's existing setters. With no
// `design`, or `editable` false (walkthrough camera), every field is read-only.
//
// `section` picks one group for the tabbed phone layouts; unset stacks them all
// (the docked desktop panel).
export const DESIGN_SECTIONS = [
  { key: "room", label: "Room" },
  { key: "aisles", label: "Aisles" },
  { key: "bench", label: "Bench" },
  { key: "lights", label: "Lights" },
  { key: "controller", label: "Controller" },
];

// ZATLA's layout engine (autoLayoutByRoom) takes one wall clearance for both
// sides, a centre aisle between the two bench banks, and front / back.
const AISLE_FIELDS = [
  { key: "centerIn", label: "Center aisle", max: 144 },
  { key: "frontIn", label: "Front", max: 144 },
  { key: "backIn", label: "Back", max: 144 },
  { key: "wallIn", label: "Side walls", max: 96 },
];

const BENCH_WIDTHS = [
  { key: 4, label: "4 ft" },
  { key: 5, label: "5 ft" },
];
const TIER_OPTIONS = [
  { key: 1, label: "Single tier" },
  { key: 2, label: "Double tier" },
  { key: 3, label: "Triple tier" },
];
const GROW_OPTIONS = [
  { key: "phoenix", label: "ZATLA Grow Light" },
];
const UCL_OPTIONS = [
  { key: "canopy", label: "UCL" },
  { key: "canopyStand", label: "On stands" },
];

const ft1 = (inches) => Math.round(((Number(inches) || 0) / 12) * 10) / 10;

function RoomPicker({ rooms, activeId, onSelect }) {
  return (
    <FieldCard>
      <label className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>Room</span>
        <select
          value={activeId || ""}
          onChange={(e) => onSelect?.(e.target.value)}
          aria-label="Room"
          className="h-8 min-w-0 max-w-[65%] rounded-full border border-white/15 bg-card px-3 text-xs font-semibold text-foreground [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
        >
          {rooms.map((r, i) => (
            <option key={r.id} value={r.id}>{r.name || `Room ${i + 1}`}</option>
          ))}
        </select>
      </label>
    </FieldCard>
  );
}

// Rows × run length → the room resizes to fit (design3d.roomForBenches).
function SizeByBenches({ columns, benchWidthFt, onApply }) {
  const [q, setQ] = useState(String(columns?.qty || ""));
  const [len, setLen] = useState(String(columns?.lengthFt || ""));
  // Re-seed whenever the room's layout changes, so it shows where the room IS.
  useEffect(() => {
    setQ(String(columns?.qty || ""));
    setLen(String(columns?.lengthFt || ""));
  }, [columns?.qty, columns?.lengthFt]);
  const qtyN = Math.max(0, parseInt(q, 10) || 0);
  const lenN = parseFloat(len) || 0;
  // ZATLA lays benches out in two banks, so 2 rows is the floor; 4 ft the
  // shortest run.
  const valid = qtyN >= 2 && lenN >= 4;
  const changed = qtyN !== (columns?.qty || 0) || lenN !== (columns?.lengthFt || 0);
  const apply = () => { if (valid && changed) onApply?.({ qty: qtyN, lengthFt: lenN }); };
  const input = "w-full h-9 rounded-lg border border-white/15 bg-card px-2 text-sm font-semibold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/60";
  return (
    <FieldCard>
      <div className={FIELD_LABEL}>Size room by benches</div>
      <div className="mt-1.5 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="space-y-1">
          <span className="block text-[10px] text-muted-foreground">Rows</span>
          <input type="number" inputMode="numeric" min="2" value={q} onChange={(e) => setQ(e.target.value)}
            onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} className={input} aria-label="Bench rows" />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] text-muted-foreground">Length (ft)</span>
          <input type="number" inputMode="decimal" min="4" step="2" value={len} onChange={(e) => setLen(e.target.value)}
            onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} className={input} aria-label="Row length in feet" />
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={!valid || !changed}
          className="h-9 px-3 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {valid
          ? `${qtyN} rows of ${benchWidthFt} ft bench, ${lenN} ft each — the room resizes to fit.`
          : "Enter at least 2 rows and a run of at least 4 ft."}
      </p>
    </FieldCard>
  );
}

// A labelled on/off switch (display options).
function ToggleRow({ label, sub = null, on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 py-1.5 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-foreground">{label}</span>
        {sub && <span className="block text-[10px] text-muted-foreground">{sub}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function ControllerCard({ count, editable, onAdd, onRemove }) {
  return (
    <FieldCard className="space-y-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg bg-emerald-600/20 text-emerald-300">
          <Cpu className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">ZATLA Controller</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Wall-mounted. It seats itself on the nearest wall — tap it in the 3D to move or rotate it.
          </p>
        </div>
      </div>
      {editable ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">In this room</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRemove}
              disabled={count <= 0}
              aria-label="Remove a controller"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-white/15 bg-card hover:bg-accent disabled:opacity-40"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-lg font-bold tabular-nums">{count}</span>
            <button
              type="button"
              onClick={onAdd}
              aria-label="Add a controller"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-white/15 bg-card hover:bg-accent"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <SpecRow label="In this room" value={count} />
      )}
    </FieldCard>
  );
}

export default function Design3DPanel({
  doc, design = null, editable = false, section = null, note = null,
  onSelectRoom,
  onSetLightModel, onSetCanopyMode,
  ceilingIn, onSetCeiling,
  display = null,
}) {
  const show = (k) => !section || section === k;
  const room = doc?.room || {};
  const settings = doc?.settings || {};
  const benches = doc?.benches || [];
  const rooms = doc?.rooms || [];
  const can = !!(editable && design);
  const polygon = !!design?.roomIsPolygon;

  const benchWidthFt = design?.benchWidthFt
    ?? (benches[0]?.widthIn ? Math.round(benches[0].widthIn / 12) : 4);
  const tiers = design?.tiers
    ?? benches.reduce((m, b) => Math.max(m, Math.max(1, Math.round(b.tiers || 1))), 1);
  const growKey = "phoenix";
  const uclKey = roomCanopyMode(doc);
  const controllers = (doc?.objects || []).filter((o) => o?.type === "controller").length;

  return (
    <div className="space-y-5">
      {note && <p className="rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">{note}</p>}

      {show("room") && (
        <PanelSection title="Room">
          {rooms.length > 1 && typeof onSelectRoom === "function" && (
            <RoomPicker rooms={rooms} activeId={doc?.activeRoomId} onSelect={onSelectRoom} />
          )}
          <StepperField
            label="Length" unit="ft" value={ft1(room.lengthIn)}
            min={8} max={MAX_ROOM_DIM_FT} sliderMin={8} sliderMax={MAX_ROOM_DIM_FT}
            readOnly={!can} disabled={polygon} hint={polygon ? "Drawn rooms keep their outline" : null}
            onCommit={(ft) => design.onResizeRoom({ lengthIn: ft * 12 })}
          />
          <StepperField
            label="Width" unit="ft" value={ft1(room.widthIn)}
            min={8} max={MAX_ROOM_DIM_FT} sliderMin={8} sliderMax={MAX_ROOM_DIM_FT}
            readOnly={!can} disabled={polygon} hint={polygon ? "Drawn rooms keep their outline" : null}
            onCommit={(ft) => design.onResizeRoom({ widthIn: ft * 12 })}
          />
          <StepperField
            label="Ceiling height" unit="ft" value={ft1(ceilingIn || room.ceilingIn || 144)}
            min={8} max={MAX_ROOM_DIM_FT}
            readOnly={!(editable && typeof onSetCeiling === "function")}
            onCommit={(ft) => onSetCeiling(ft * 12)}
          />
          {can && !polygon && typeof design.onSizeByBenches === "function" && (
            <SizeByBenches columns={design.benchColumns} benchWidthFt={benchWidthFt} onApply={design.onSizeByBenches} />
          )}
        </PanelSection>
      )}

      {show("aisles") && (
        <PanelSection title="Aisles" hint="Clearances in inches. The benches re-lay out around them.">
          {AISLE_FIELDS.map((f) => (
            <StepperField
              key={f.key}
              label={f.label} unit="in" value={Number(settings[f.key]) || 0} sub={fmtFtIn(Number(settings[f.key]) || 0)}
              min={0} max={f.max}
              readOnly={!can}
              onCommit={(v) => design.onApplyAisles({ [f.key]: v })}
            />
          ))}
        </PanelSection>
      )}

      {show("bench") && (
        <PanelSection title="Bench" hint="Rolling benches. ZATLA lights are laid out one per 4 ft of bench, on every tier.">
          <Segmented
            label="Bench width" options={BENCH_WIDTHS} value={benchWidthFt}
            readOnly={!can} onChange={(w) => design.onSetBenchWidth(w)}
          />
          <Segmented
            label="Tiers" cols={3} options={TIER_OPTIONS} value={tiers}
            readOnly={!can} onChange={(t) => design.onSetTiers(t)}
          />
        </PanelSection>
      )}

      {show("lights") && (
        <PanelSection title="Lights">
          <Segmented
            label="Grow light" cols={1}
            options={GROW_OPTIONS}
            value={growKey}
            readOnly={!(editable && typeof onSetLightModel === "function")}
            onChange={(k) => onSetLightModel(k)}
          />
          <Segmented
            label="Under canopy (UCL)" cols={2}
            options={UCL_OPTIONS}
            value={UCL_OPTIONS.some((o) => o.key === uclKey) ? uclKey : "canopy"}
            readOnly={!(editable && typeof onSetCanopyMode === "function")}
            onChange={(k) => onSetCanopyMode(k)}
          />
          {display && (display.onToggleBeams || display.onTogglePhotons) && (
            <FieldCard>
              <div className={`${FIELD_LABEL} mb-1`}>Display</div>
              {display.onToggleBeams && (
                <ToggleRow label="Light beams" on={display.beamsOn} onToggle={display.onToggleBeams} />
              )}
              {display.onTogglePhotons && display.beamsOn && (
                <ToggleRow label="Animated photons" sub="Uses more graphics power" on={display.photonsOn} onToggle={display.onTogglePhotons} />
              )}
            </FieldCard>
          )}
        </PanelSection>
      )}

      {show("controller") && (
        <PanelSection title="Controller">
          <ControllerCard
            count={controllers}
            editable={can && typeof design.onAddController === "function"}
            onAdd={() => design.onAddController()}
            onRemove={() => design.onRemoveController()}
          />
        </PanelSection>
      )}
    </div>
  );
}
