import React from "react";
import { computeStats } from "@/lib/growroom/autolayout";
import { computeClearances, lightCoveragePct } from "@/lib/growroom/clearances";
import { formatLength } from "@/lib/growroom/units";
import { AlertTriangle, CheckCircle2, Boxes, Sprout, Ruler } from "lucide-react";
import PotCapacityPanel from "./PotCapacityPanel";

export default function StatsPanel({ doc }) {
  const stats = computeStats(doc.room, doc.benches || []);
  const clearances = computeClearances(doc.room, doc.benches || [], doc.settings);
  const coverage = lightCoveragePct(doc.benches || [], doc.lights || []);
  const roomSize = `${Math.round(doc.room.widthIn / 12)}×${Math.round(doc.room.lengthIn / 12)} ft`;

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-4 space-y-5">
      {/* Hero metrics */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Overview</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <KeyStat icon={Boxes} label="Benches" value={stats.totalBenches} tone="slate" />
          <KeyStat icon={Sprout} label="Planting Area" value={stats.plantingAreaSqft} unit="sqft" tone="green" />
          <KeyStat icon={Ruler} label="Room Size" value={roomSize} tone="slate" />
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label="Bench Width" value={stats.benchWidthFt === "mix" ? "Mix" : `${stats.benchWidthFt} ft`} />
        <MiniStat label="Run Length" value={`${stats.benchLengthFt} ft`} />
        <MiniStat label="Lights" value={stats.totalLights} />
        <MiniStat label="Light Coverage" value={`${coverage}%`} />
        <MiniStat label="Total Area" value={`${stats.totalAreaSqft} sqft`} />
      </div>

      {/* Clearances */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Clearances</h3>
        <div className="space-y-1.5">
          {clearances.length === 0 && <p className="text-xs text-muted-foreground">Place benches to compute clearances.</p>}
          {clearances.map((c) => (
            <ClearanceRow key={c.label} c={c} units={doc.units} />
          ))}
        </div>
      </div>

      <PotCapacityPanel doc={doc} />
    </div>
  );
}

function KeyStat({ icon: Icon, label, value, unit, tone }) {
  const accent = tone === "green" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`flex items-center justify-center w-6 h-6 rounded-lg ${accent}`}><Icon className="w-3.5 h-3.5" /></span>
        <span className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</span>
      </div>
      <div className="font-mono text-xl font-bold text-foreground">
        {value}{unit && <span className="text-[11px] font-normal text-muted-foreground ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      <div className="font-mono text-sm font-semibold text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function ClearanceRow({ c, units }) {
  const tone = c.status === "fail" ? "text-destructive" : c.status === "warn" ? "text-amber-500" : "text-emerald-600";
  const Icon = c.status === "pass" ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-1.5">
      <span className="text-xs text-foreground">{c.label}</span>
      <span className={`flex items-center gap-1.5 font-mono text-xs font-semibold ${tone}`}>
        {formatLength(c.value, units)}
        <Icon className="w-3.5 h-3.5" />
      </span>
    </div>
  );
}