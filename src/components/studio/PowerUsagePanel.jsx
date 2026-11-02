import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import MeasureInput from "./MeasureInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeUnderCanopy } from "@/lib/growroom/underCanopy";
import { roomEquipmentWatts } from "@/lib/growroom/equipmentLoad";

// Read-only / derived power & cost estimate. Pulls the live placed-light count
// from the layout and the photoperiod from the Production wizard. Edits here are
// local to this panel only — it never mutates bench/light data or the document.
// When `calculateCanopy` is ON, under-canopy fixtures (derived from benches) add
// to watts AND amps; when OFF, everything reflects top lights only.
export default function PowerUsagePanel({ lightCount, photoperiod, defaultRate = 0.10, rateEstimated = false, calculateCanopy = false, includeTop = true, includeEquipment = true, benches = [], objects = [] }) {
  const [wattsPerLight, setWattsPerLight] = useState(1000);
  const [rate, setRate] = useState(defaultRate);
  const [rateEdited, setRateEdited] = useState(false);
  const [hoursPerDay, setHoursPerDay] = useState(photoperiod || 12);
  const [voltage, setVoltage] = useState(120);
  const hoursUserOverride = React.useRef(false);

  // Follow the photoperiod set in Production & ROI unless the user overrides here.
  useEffect(() => {
    if (!hoursUserOverride.current && photoperiod && photoperiod !== hoursPerDay) {
      setHoursPerDay(photoperiod);
    }
  }, [photoperiod]);

  // Follow the user's resolved rate (zip estimate / saved) until they edit it here.
  useEffect(() => {
    if (!rateEdited) setRate(defaultRate);
  }, [defaultRate]);

  // Top lights — counted only when the "Grow lights" include toggle is ON.
  const topWatts = includeTop ? lightCount * wattsPerLight : 0;
  // Under-canopy — additive, only when its include toggle is ON.
  const uc = React.useMemo(() => computeUnderCanopy(benches, voltage), [benches, voltage]);
  const canopyWatts = calculateCanopy ? uc.watts : 0;
  // Equipment load — additive draw from this room's placed objects (mini-splits,
  // dehumidifiers, fans), gated by its own include toggle.
  const equipmentWatts = React.useMemo(
    () => (includeEquipment ? roomEquipmentWatts(objects) : 0),
    [objects, includeEquipment]
  );

  // Estimated HVAC load: lighting generates heat that must be cooled.
  // Rule of thumb: ~1 ton cooling per 3.5 kW of lighting (sensible heat).
  const estimatedHvacKw = Math.round((topWatts / 3500) * 10) / 10;

  const totalWatts = topWatts + canopyWatts + equipmentWatts;
  const totalKw = totalWatts / 1000;
  const dailyKwh = totalKw * hoursPerDay;
  const monthlyKwh = (dailyKwh * 365) / 12;
  const annualKwh = dailyKwh * 365;
  const dailyCost = dailyKwh * rate;
  const monthlyCost = monthlyKwh * rate;
  const annualCost = annualKwh * rate;

  // Electrical load (amps) — top lights + (under-canopy when ON), at selected voltage.
  const topAmps = topWatts / voltage;
  const canopyAmps = calculateCanopy ? uc.amps : 0;
  const equipmentAmps = voltage > 0 ? equipmentWatts / voltage : 0;
  const totalAmps = topAmps + canopyAmps + equipmentAmps;
  // 80% continuous-load rule → required breaker size headroom.
  const requiredBreaker = totalAmps / 0.8;

  const usd = (n) => `$${Math.round(n).toLocaleString()}`;
  const num = (n) => Math.round(n).toLocaleString();
  const amp = (n) => `${n.toFixed(1)} A`;

  return (
    <div className="space-y-3">
      {/* Inputs */}
      <div className="space-y-2">
        <CompactField label="Watts">
          <MeasureInput value={wattsPerLight} unit="W" placeholder="1000" onCommit={(v) => setWattsPerLight(Math.max(0, Number(v) || 0))} className="h-8 text-xs font-mono" />
        </CompactField>
        <p className="text-[10px] text-muted-foreground -mt-1">Power draw per fixture.</p>
        <CompactField label="Rate">
          <MeasureInput value={rate} unit="$/kWh" placeholder="0.10" onCommit={(v) => { setRateEdited(true); setRate(Math.max(0, Number(v) || 0)); }} className="h-8 text-xs font-mono" />
        </CompactField>
        {!rateEdited && rateEstimated && (
          <p className="text-[10px] text-muted-foreground -mt-1">Estimated from your area — edit if you know your exact rate.</p>
        )}
        <CompactField label="Hours">
          <MeasureInput value={hoursPerDay} unit="h/day" placeholder="12" onCommit={(v) => { hoursUserOverride.current = true; setHoursPerDay(Math.max(0, Math.min(24, Number(v) || 0))); }} className="h-8 text-xs font-mono" />
        </CompactField>
        <CompactField label="Voltage">
          <Select value={String(voltage)} onValueChange={(v) => setVoltage(Number(v))}>
            <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="120">120 V</SelectItem>
              <SelectItem value="208">208 V</SelectItem>
              <SelectItem value="240">240 V</SelectItem>
              <SelectItem value="277">277 V</SelectItem>
            </SelectContent>
          </Select>
        </CompactField>
        <p className="text-[10px] text-muted-foreground -mt-1">Higher voltage = lower amperage for the same power.</p>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-2">
        <Headline label="Total Draw" value={`${num(totalKw)} kW`} sub={`${num(totalWatts)} W`} />
        <Headline
          label="Monthly Cost"
          value={usd(monthlyCost)}
          sub={
            !includeTop && !calculateCanopy
              ? "equipment only"
              : calculateCanopy && canopyWatts > 0
                ? (includeTop ? "top + under-canopy" : "under-canopy only")
                : `${lightCount} fixtures`
          }
        />
      </div>

      {/* Canopy contribution callout */}
      {calculateCanopy && canopyWatts > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 space-y-1">
          <Row label="Top lights" value={`${num(topWatts)} W`} />
          <Row label="Under-canopy" value={`+${num(canopyWatts)} W`} />
          <div className="flex items-center justify-between text-[11px] pt-1 border-t">
            <span className="text-muted-foreground font-medium">Combined</span>
            <span className="font-mono font-bold text-primary">{num(totalWatts)} W</span>
          </div>
        </div>
      )}

      {/* Equipment load — separate from lighting power */}
      {equipmentWatts > 0 && (
        <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5">
          <Row label="Lighting power" value={`${num(topWatts + canopyWatts)} W`} />
          <Row label="Equipment Load" value={`${num(equipmentWatts)} W`} />
          <div className="flex items-center justify-between text-[11px] pt-1 border-t">
            <span className="text-muted-foreground font-medium">Total draw</span>
            <span className="font-mono font-bold text-primary">{(equipmentWatts / 1000).toFixed(1)} kW equip</span>
          </div>
        </div>
      )}

      {/* HVAC load estimate */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 space-y-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Estimated HVAC Load</span>
        </div>
        <Row label="Cooling needed" value={`~${estimatedHvacKw} kW`} />
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
          Rule of thumb: 1 ton cooling per 3.5 kW of lighting. Not included in total above — add your actual HVAC draw separately.
        </p>
      </div>

      {/* Energy breakdown */}
      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5">
        <Row label="Daily Energy" value={`${num(dailyKwh)} kWh`} />
        <Row label="Monthly Energy" value={`${num(monthlyKwh)} kWh`} />
        <Row label="Annual Energy" value={`${num(annualKwh)} kWh`} />
      </div>

      {/* Cost breakdown */}
      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5">
        <Row label="Daily Cost" value={usd(dailyCost)} />
        <Row label="Monthly Cost" value={usd(monthlyCost)} />
        <Row label="Annual Cost" value={usd(annualCost)} />
      </div>

      {/* Electrical load (amps) estimator */}
      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Zap className="w-3 h-3 text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Electrical load @ {voltage}V</span>
        </div>
        {includeTop && <Row label="Top lights" value={amp(topAmps)} />}
        {calculateCanopy && canopyAmps > 0 && <Row label="Under-canopy" value={`+${amp(canopyAmps)}`} />}
        {equipmentAmps > 0 && <Row label="Equipment" value={`+${amp(equipmentAmps)}`} />}
        <div className="flex items-center justify-between text-[11px] pt-1 border-t">
          <span className="text-muted-foreground font-medium">Total current</span>
          <span className="font-mono font-bold text-primary">{amp(totalAmps)}</span>
        </div>
        <Row label="Min. breaker (80% rule)" value={`${Math.ceil(requiredBreaker)} A`} />
        <p className="text-[9px] leading-relaxed text-muted-foreground/70 pt-0.5">
          Size circuits for 80% continuous load. Distribute across multiple breakers as needed — a higher service voltage lowers amperage for the same wattage.
        </p>
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

function Headline({ label, value, sub }) {
  return (
    <div className="rounded-lg border bg-primary/5 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="font-mono text-sm font-bold text-foreground leading-tight">{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
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