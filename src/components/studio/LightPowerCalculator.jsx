import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import MeasureInput from "./MeasureInput";

// Simple total-power calculator for all grow lights placed in the room.
// `lightCount` is the live count of placed fixtures — it re-renders automatically
// whenever a light is added or removed, so the total stays in sync with the layout.
export default function LightPowerCalculator({ lightCount = 0, projectName = "Grow Room" }) {
  const [wattsPerLight, setWattsPerLight] = useState(600);

  const totalWatts = lightCount * wattsPerLight;
  const totalKw = totalWatts / 1000;

  const num = (n) => Math.round(n).toLocaleString();

  return (
    <div className="space-y-3">
      <CompactField label="Watts">
        <MeasureInput
          value={wattsPerLight}
          unit="W"
          placeholder="600"
          onCommit={(v) => setWattsPerLight(Math.max(0, Number(v) || 0))}
          className="h-8 text-xs font-mono"
        />
      </CompactField>
      <p className="text-[10px] text-muted-foreground -mt-1">Power draw per fixture.</p>

      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5">
        <Row label="Lights placed" value={lightCount} />
        <div className="flex items-center justify-between text-[11px] pt-1 border-t">
          <span className="text-muted-foreground font-medium flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-primary" /> Total draw
          </span>
          <span className="font-mono font-bold text-primary">
            {num(totalWatts)} W <span className="text-muted-foreground font-normal">({totalKw.toFixed(2)} kW)</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function CompactField({ label, children }) {
  return (
    <div className="grid grid-cols-[52px_1fr] items-center gap-2">
      <Label className="text-[10px] text-muted-foreground leading-tight">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}