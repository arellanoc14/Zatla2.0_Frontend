import React from "react";
import { Building2, Boxes, Sprout, Lightbulb, Zap, DollarSign, TrendingUp, Wind, ChevronDown, ChevronUp } from "lucide-react";
import { computeFacilityRollup } from "@/lib/growroom/facilityRollup";

// Facility Totals — a READ-ONLY rollup that sums every room's metrics. Distinct
// from the selected room's stats; never changes per-room calculations or layout.
// Assumptions are the live shared values from the side panel so totals stay
// consistent with the per-room Production / Power panels.
export default function FacilityTotalsPanel({ doc, assumptions, expanded, onToggle }) {
  const r = React.useMemo(() => computeFacilityRollup(doc, assumptions), [doc, assumptions]);

  const usd = (n) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="border-b bg-primary/5 border-l-2 border-l-primary">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 transition-colors hover:bg-primary/10"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Building2 className="w-3 h-3" /> Facility Totals
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{r.roomCount} room{r.roomCount === 1 ? "" : "s"}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <Tile icon={Boxes} label="Total Benches" value={r.benchCount} />
            <Tile icon={Sprout} label="Total Canopy" value={`${r.canopySqft.toLocaleString()} sqft`} />
            <Tile icon={Sprout} label="Total Plants" value={r.plants.toLocaleString()} />
            <Tile icon={Lightbulb} label="Total Lights" value={r.lightCount} />
            <Tile icon={Zap} label="Total Power" value={`${r.totalKw.toLocaleString()} kW`} sub={`${r.totalAmps.toLocaleString()} A · ${includesLabel(assumptions, r)}`} />
            <Tile icon={Wind} label="Equipment Load" value={`${r.equipmentKw.toLocaleString()} kW`} sub="HVAC, dehu, fans, ducting" />
            <Tile icon={DollarSign} label="Annual Revenue" value={usd(r.annualRevenue)} sub={`${r.annualLbs.toLocaleString()} lbs/yr`} />
          </div>

          <div className="mt-2 rounded-lg border border-primary/30 bg-card/60 px-2.5 py-2 space-y-1.5">
            <Row icon={TrendingUp} label="Blended ROI" value={`${r.roiPct}%`} accent />
            <Row label="Per harvest" value={`${r.lbsPerHarvest.toLocaleString()} lbs`} />
            <Row label="Harvests / yr" value={r.harvestsPerYear} />
            <Row label="Annual power cost" value={usd(r.annualPowerCost)} />
          </div>

          <p className="mt-2 text-[9px] leading-snug text-muted-foreground/70">
            Summed across all rooms. Per-room stats reflect only the selected room.
          </p>
        </div>
      )}
    </div>
  );
}

// Short human label for which power sources are included in Total Power,
// mirroring the "Include in calculation" toggles in the Power Usage section.
function includesLabel(a = {}, rollup = {}) {
  const parts = [];
  if (a.includeTopLights !== false) parts.push("lights");
  if (rollup.canopyRoomCount > 0) parts.push("canopy");
  if (a.includeEquipment !== false) parts.push("equip");
  return parts.length ? parts.join(" + ") : "nothing included";
}

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg border bg-card px-2.5 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3 text-primary" />
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</span>
      </div>
      <div className="font-mono text-sm font-bold text-foreground leading-tight">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground font-mono">{sub}</div>}
    </div>
  );
}

function Row({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="w-3 h-3 text-primary" />}{label}
      </span>
      <span className={`font-mono font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}