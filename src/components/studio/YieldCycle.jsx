import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Layers } from "lucide-react";
import TierStepper from "./TierStepper";

const PHOTOPERIODS = [12, 14, 16, 18, 20];

export default function YieldCycle({
  photoperiod, onPhotoperiodChange,
  gPerMol, onGPerMolChange,
  cycleDays, onCycleDaysChange,
  buffer, onBufferChange,
  tiers, onTiersChange,
}) {
  return (
    <div className="space-y-4">
      {/* Photoperiod */}
      <div>
        <Label className="text-[11px] font-medium text-foreground mb-2 block">Hours of light per day</Label>
        <div className="flex gap-2">
          {PHOTOPERIODS.map((h) => {
            const active = photoperiod === h;
            return (
              <button
                key={h}
                onClick={() => onPhotoperiodChange(h)}
                className={`flex-1 min-h-[44px] rounded-lg border text-sm font-mono font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-transparent text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {h}h
              </button>
            );
          })}
        </div>
      </div>

      {/* Yield Efficiency */}
      <div>
        <Label className="text-[11px] font-medium text-foreground mb-1 block">Yield efficiency (g/mol)</Label>
        <p className="text-[9px] text-muted-foreground mb-2">Leave at 1.0 unless you've measured your own.</p>
        <Input
          type="number"
          step="0.1"
          min="0"
          value={gPerMol}
          onChange={(e) => onGPerMolChange(e.target.value)}
          className="h-10 text-sm font-mono"
        />
      </div>

      {/* Harvest cycle days */}
      <div>
        <Label className="text-[11px] font-medium text-foreground mb-2 block">Days per harvest cycle</Label>
        <Input
          type="number"
          step="1"
          min="1"
          value={cycleDays}
          onChange={(e) => onCycleDaysChange(e.target.value)}
          className="h-10 text-sm font-mono"
        />
      </div>

      {/* Cycle turnaround buffer */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-[11px] font-medium text-foreground">Cleanup days between cycles</Label>
          <span className="text-xs font-mono font-bold text-foreground">{Math.round(buffer)} days</span>
        </div>
        <Slider
          value={[buffer]}
          min={0}
          max={21}
          step={1}
          onValueChange={(v) => onBufferChange(v[0])}
          className="my-2"
        />
        <p className="text-[9px] text-muted-foreground">Downtime for cleaning, transplanting, and room prep.</p>
      </div>

      {/* Tiers */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <Label className="text-[11px] font-medium text-foreground">Growing tiers</Label>
        </div>
        <TierStepper value={tiers} onChange={onTiersChange} min={1} max={3} />
        <p className="text-[9px] text-muted-foreground mt-1">Mirrors your bench tier count.</p>
      </div>
    </div>
  );
}