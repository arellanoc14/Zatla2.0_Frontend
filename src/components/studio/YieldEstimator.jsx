import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Sprout, ChevronDown, ChevronUp, Layers, RefreshCw, Info, AlertTriangle, CheckCircle2, XCircle, Leaf, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import GrowerMetrics from "./GrowerMetrics";
import { computeUnderCanopy } from "@/lib/growroom/underCanopy";

const SQFT_TO_M2 = 10.7639;
const GRAMS_PER_LB = 453.592;
const DLI_DIVISOR = 1_000_000;

const CO2_OPTIONS = [
  { id: "ambient", label: "Ambient", sub: "~400 ppm", factor: 0.82 },
  { id: "mid", label: "Mid", sub: "~700 ppm", factor: 0.91 },
  { id: "enriched", label: "Enriched", sub: "1000–1200 ppm", factor: 1.0 },
];

const VPD_OPTIONS = [
  { id: "optimal", label: "In range", sub: "1.0–1.5 kPa", factor: 1.0 },
  { id: "slight", label: "Slightly off", sub: "", factor: 0.92 },
  { id: "out", label: "Out of range", sub: "", factor: 0.85 },
];

function fmt1(n) { return n.toFixed(1); }
function fmtLoc(n) { return Math.round(n).toLocaleString("en-US"); }

export default function YieldEstimator({ benches, efficiency, cycleDays, buffer = 0, onResultChange, lightPPFD, gPerMol, photoperiod, tiers, co2Level = "enriched", vpdLevel = "optimal", totalLights = 0, calculateCanopy = false, canopyUplift = 25, setCanopyUplift }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showWaterfall, setShowWaterfall] = useState(true);
  const [wholesalePrice, setWholesalePrice] = useState("800");
  const [setupCost, setSetupCost] = useState("");

  const co2Factor = CO2_OPTIONS.find(o => o.id === co2Level)?.factor ?? 1;
  const vpdFactor = VPD_OPTIONS.find(o => o.id === vpdLevel)?.factor ?? 1;

  const steps = useMemo(() => {
    const factor = parseFloat(gPerMol) || 0;
    const days = parseFloat(cycleDays) || 0;
    const photoH = parseFloat(photoperiod) || 0;
    const interceptFrac = (efficiency > 0 ? efficiency : 100) / 100;
    const co2Factor = CO2_OPTIONS.find(o => o.id === co2Level)?.factor ?? 1;
    const vpdFactor = VPD_OPTIONS.find(o => o.id === vpdLevel)?.factor ?? 1;

    if (benches.length === 0 || factor === 0 || days === 0 || photoH === 0 || !lightPPFD) return null;

    // ── STEP 1: DLI ──
    let avgPPFD = 0;
    let weightSum = 0;
    const benchDetails = [];

    benches.forEach((b) => {
      const benchTiers = Math.max(1, b.tiers || 1);
      const sqft = (b.lengthIn * b.widthIn * benchTiers) / 144;
      const canopyM2 = sqft / SQFT_TO_M2;

      const ppfd = lightPPFD;
      if (ppfd == null) return;

      avgPPFD += ppfd * canopyM2;
      weightSum += canopyM2;
      benchDetails.push({ canopyM2, ppfd });
    });

    if (weightSum === 0) return null;
    avgPPFD /= weightSum;

    const totalCanopyM2 = weightSum;
    const t = Math.max(1, tiers || 1);
    const floorCanopyM2 = totalCanopyM2 / t;
    const photoperiodS = photoH * 3600;
    const dli = (avgPPFD * photoperiodS) / DLI_DIVISOR;

    // ── STEP 2: Total mols delivered (full DLI × full canopy area × days) ──
    const capturedDLI = dli; // interception applied once below in the waterfall
    const totalMols = dli * totalCanopyM2 * days;

    // ── STEP 3: Base biomass ──
    const baseGrams = totalMols * factor;

    // ── STEP 4: Waterfall — apply interception loss once here ──
    const afterInterceptGrams = baseGrams * interceptFrac;
    const afterCO2Grams = afterInterceptGrams * co2Factor;
    const afterVPDGrams = afterCO2Grams * vpdFactor;

    const interceptLoss = baseGrams - afterInterceptGrams;
    const co2Loss = afterInterceptGrams - afterCO2Grams;
    const vpdLoss = afterCO2Grams - afterVPDGrams;

    // ── Under-canopy uplift (only when "Calculate canopy" is ON) ──
    // Supplemental fixtures light lower-canopy tissue → additive PPFD and a
    // production uplift of +20–30% (default 25%) on the base top-light yield.
    const uc = calculateCanopy ? computeUnderCanopy(benches) : { ppf: 0 };
    const upliftFrac = calculateCanopy ? Math.min(0.30, Math.max(0.20, (canopyUplift || 25) / 100)) : 0;
    // Supplemental PPFD = total under-canopy PPF ÷ floor canopy area (m²).
    const canopyPPFD = (calculateCanopy && floorCanopyM2 > 0) ? uc.ppf / floorCanopyM2 : 0;
    const canopyDLI = canopyPPFD * photoH * 0.0036;

    // ── Final yield (apply uplift after env losses) ──
    const finalGrams = afterVPDGrams * (1 + upliftFrac);
    const lbs = finalGrams / GRAMS_PER_LB;
    const kg = finalGrams / 1000;

    const totalEnvEff = Math.round(interceptFrac * co2Factor * vpdFactor * 100);
    const effectiveCanopySqft = Math.round(floorCanopyM2 * SQFT_TO_M2);

    // Canopy fill = placed bench footprint ÷ room (intercept proxy already in efficiency)
    const canopyFillPct = Math.round(interceptFrac * 100);

    return {
      calculateCanopy,
      upliftFrac,
      canopyPPFD,
      canopyDLI,
      canopyFillPct,
      upliftGrams: Math.round(afterVPDGrams * upliftFrac),
      avgPPFD,
      totalCanopyM2: Math.round(totalCanopyM2 * 100) / 100,
      floorCanopyM2,
      effectiveCanopySqft,
      t,
      photoH,
      dli,
      interceptFrac,
      capturedDLI,
      totalMols,
      baseGrams: Math.round(baseGrams),
      afterInterceptGrams: Math.round(afterInterceptGrams),
      afterCO2Grams: Math.round(afterCO2Grams),
      afterVPDGrams: Math.round(afterVPDGrams),
      interceptLoss: Math.round(interceptLoss),
      co2Loss: Math.round(co2Loss),
      vpdLoss: Math.round(vpdLoss),
      co2Factor,
      vpdFactor,
      totalEnvEff,
      lbs: lbs.toFixed(1),
      kg: kg.toFixed(1),
      grams: Math.round(finalGrams),
      lbsNum: parseFloat(lbs.toFixed(1)),
    };
  }, [benches, lightPPFD, gPerMol, cycleDays, photoperiod, tiers, co2Level, vpdLevel, efficiency, calculateCanopy, canopyUplift]);

  React.useEffect(() => {
    if (onResultChange) {
      if (!steps) { onResultChange(null); return; }
      onResultChange({ lbs: steps.lbs, kg: steps.kg, grams: steps.grams, lbsNum: steps.lbsNum });
    }
  }, [steps]);

  const benchesSummary = useMemo(() => {
    const sizes = new Set();
    benches.forEach((b) => {
      const w = Math.round(b.widthIn / 12);
      const l = Math.round(b.lengthIn / 12);
      sizes.add(`${w}×${l}`);
    });
    return { count: benches.length, sizes: [...sizes].join(", ") };
  }, [benches]);

  const fmtDollar = (n) => Math.round(n).toLocaleString("en-US");

  // Compute combined env efficiency for badges
  const totalEnvEff = useMemo(() => {
    return Math.round(((efficiency > 0 ? efficiency : 100) / 100) * co2Factor * vpdFactor * 100);
  }, [efficiency, co2Factor, vpdFactor]);

  const d = parseFloat(cycleDays) || 0;
  const b = parseFloat(buffer) || 0;
  const price = parseFloat(wholesalePrice) || 0;
  const realistic = d > 0 ? 365 / (d + b) : 0;
  const theoretical = d > 0 ? 365 / d : 0;
  const lbsNum = steps ? parseFloat(steps.lbs) : 0;
  const annualLbs = realistic * lbsNum;
  const annualRevenue = annualLbs * price;
  const theoreticalRevenue = theoretical * lbsNum * price;
  const revenueGap = theoreticalRevenue - annualRevenue;
  const canopyM2 = steps?.totalCanopyM2 || 0;
  const revenuePerM2 = canopyM2 > 0 ? annualRevenue / canopyM2 : 0;
  const paybackMonths = (parseFloat(setupCost) || 0) > 0 && annualRevenue > 0
    ? (parseFloat(setupCost)) / (annualRevenue / 12) : null;

  return (
    <div className="space-y-4">
      {/* ---- 1. HEADLINE: Annual Revenue ---- */}
      {steps ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-4 text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Estimated annual revenue</div>
          <div className="font-mono text-2xl font-bold text-primary">${fmtDollar(annualRevenue)}</div>
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {Math.round(annualLbs).toLocaleString()} lbs/yr across {Math.round(realistic)} harvests
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-4 py-5 text-center">
          <p className="text-[11px] text-muted-foreground">Add benches to see your estimated revenue</p>
        </div>
      )}

      {/* ---- 2. KEY METRICS ROW ---- */}
      {steps && (
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
          <MetricCard label="Per harvest" value={`${steps.lbs} lbs`} />
          <MetricCard label="Revenue / m²" value={`$${revenuePerM2 < 10 ? revenuePerM2.toFixed(2) : fmtDollar(revenuePerM2)}/yr`} />
          <MetricCard label="Payback" value={paybackMonths != null ? `${paybackMonths.toFixed(1)} mo` : "Add setup cost"} muted={paybackMonths == null} />
        </div>
      )}

      {/* ---- 2a. UNDER-CANOPY METRICS (only when "Calculate canopy" is ON) ---- */}
      {steps && calculateCanopy && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <Leaf className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Under-canopy boost</span>
          </div>

          {/* Yield uplift slider (20–30%) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Yield uplift</span>
              <span className="font-mono font-bold text-primary">+{Math.round(steps.upliftFrac * 100)}%</span>
            </div>
            <Slider
              value={[Math.round(steps.upliftFrac * 100)]}
              min={20} max={30} step={1}
              onValueChange={(v) => setCanopyUplift && setCanopyUplift(v[0])}
            />
            <div className="text-[9px] text-muted-foreground">
              +{steps.upliftGrams.toLocaleString()} g/harvest from supplemental lower-canopy light.
            </div>
          </div>

          {/* Canopy metric grid */}
          <div className="grid grid-cols-2 gap-2">
            <CanopyStat icon={Sun} label="Canopy PPFD" value={`${Math.round(steps.canopyPPFD)} µmol`} sub="target 600–900+" />
            <CanopyStat icon={Sun} label="Canopy DLI" value={`${steps.canopyDLI.toFixed(1)} mol`} sub="per day" />
            <CanopyStat icon={Layers} label="Canopy area" value={`${steps.effectiveCanopySqft.toLocaleString()} ft²`} sub={`${steps.floorCanopyM2.toFixed(1)} m²`} />
            <CanopyStat icon={Leaf} label="Fill rate" value={`${steps.canopyFillPct}%`} sub="canopy coverage" />
            <CanopyStat icon={Sprout} label="g / ft²" value={`${(steps.grams / Math.max(1, steps.effectiveCanopySqft)).toFixed(1)} g`} sub="per harvest" />
            <CanopyStat icon={Sprout} label="g / watt" value={`${(steps.grams / Math.max(1, (totalLights * 600) + computeUnderCanopy(benches).watts)).toFixed(2)}`} sub="incl. canopy" />
          </div>
        </div>
      )}

      {/* ---- 2b. GROWER EFFICIENCY METRICS ---- */}
      {steps && (
        <GrowerMetrics
          gramsPerHarvest={steps.grams}
          canopySqft={Math.round(steps.totalCanopyM2 * SQFT_TO_M2)}
          totalWatts={(totalLights * 600) + (calculateCanopy ? computeUnderCanopy(benches).watts : 0)}
          cycleDays={cycleDays}
          buffer={buffer}
        />
      )}

      {/* ---- 2c. ECONOMICS INPUTS ---- */}
      <div className="rounded-lg border px-3 py-2 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] text-muted-foreground font-medium">Tweak your numbers</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground shrink-0">Wholesale price</Label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">$</span>
            <Input type="number" min="0" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} className="h-7 w-20 text-xs font-mono" />
            <span className="text-[9px] text-muted-foreground">/lb</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground shrink-0">Setup cost</Label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">$</span>
            <Input type="number" min="0" placeholder="—" value={setupCost} onChange={(e) => setSetupCost(e.target.value)} className="h-7 w-24 text-xs font-mono" />
          </div>
        </div>
      </div>

      {/* ---- 3. SMART BADGES ---- */}
      {steps && (
        <div className="space-y-1">
          {parseFloat(buffer) === 0 && (
            <Badge icon={AlertTriangle} color="bg-amber-500/10 border-amber-500/30 text-amber-600" text="No downtime set — unrealistic for real operations" />
          )}
          {parseFloat(gPerMol) > 1.5 && lightPPFD > 1500 && (
            <Badge icon={AlertTriangle} color="bg-amber-500/10 border-amber-500/30 text-amber-600" text="Yield efficiency unrealistic at this light intensity" />
          )}
          {totalEnvEff >= 85 && (
            <Badge icon={CheckCircle2} color="bg-emerald-500/10 border-emerald-500/30 text-emerald-600" text="Excellent environmental efficiency" />
          )}
          {totalEnvEff < 60 && (
            <Badge icon={XCircle} color="bg-destructive/10 border-destructive/30 text-destructive" text="Poor environmental efficiency — significant yield loss" />
          )}
        </div>
      )}

      {/* ---- 4. WHERE YOUR YIELD GOES ---- */}
      {steps && (
        <div>
          <button
            onClick={() => setShowWaterfall(!showWaterfall)}
            className="w-full flex items-center justify-between rounded-md px-1 py-1.5 mb-1"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Sprout className="w-3.5 h-3.5 text-primary" /> Where your yield goes
            </span>
            {showWaterfall ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          {showWaterfall && (
            <div className="rounded-lg border px-3 py-2 space-y-2">
              <WaterfallRow label="Raw photosynthetic yield" grams={steps.baseGrams} barPct={100} lossGrams={null} barColor="bg-primary" />
              <WaterfallRow label="After canopy interception" grams={steps.afterInterceptGrams} barPct={(steps.afterInterceptGrams / steps.baseGrams) * 100} lossGrams={steps.interceptLoss} lossPct={steps.baseGrams > 0 ? Math.round((steps.interceptLoss / steps.baseGrams) * 100) : 0} barColor="bg-amber-500" />
              <WaterfallRow label="After CO₂" grams={steps.afterCO2Grams} barPct={(steps.afterCO2Grams / steps.baseGrams) * 100} lossGrams={steps.co2Loss} lossPct={steps.baseGrams > 0 ? Math.round((steps.co2Loss / steps.baseGrams) * 100) : 0} barColor="bg-amber-500" />
              <WaterfallRow label="After VPD" grams={steps.afterVPDGrams} barPct={(steps.afterVPDGrams / steps.baseGrams) * 100} lossGrams={steps.vpdLoss} lossPct={steps.baseGrams > 0 ? Math.round((steps.vpdLoss / steps.baseGrams) * 100) : 0} barColor="bg-amber-500" />
              <div className="pt-1 border-t">
                <WaterfallRow label="Final harvest" grams={steps.afterVPDGrams} barPct={(steps.afterVPDGrams / steps.baseGrams) * 100} lossGrams={null} barColor="bg-primary" final lbs={steps.lbs} kg={steps.kg} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- 5. CYCLES + REVENUE GAP ---- */}
      {steps && (
        <div className="rounded-lg border px-3 py-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">Cycles per year</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border bg-muted/20 px-2 py-1.5">
              <div className="text-[9px] text-muted-foreground mb-0.5">Theoretical</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                365 ÷ {d} = <span className="font-bold">{theoretical.toFixed(2)}</span>
              </div>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
              <div className="text-[9px] text-primary mb-0.5 font-semibold">Realistic</div>
              <div className="font-mono text-[11px] font-bold text-primary">{d > 0 ? realistic.toFixed(2) : "—"}</div>
            </div>
          </div>
          <div className="flex items-start gap-1.5 text-[9px] text-muted-foreground/70">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>Realistic includes {Math.round(b)} days downtime between cycles.</span>
          </div>
          {revenueGap > 0 && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-500/5 border border-amber-500/20 px-2 py-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-[9px] text-amber-600">
                Untapped if you eliminated all downtime: <span className="font-mono font-bold">${fmtDollar(revenueGap)}/yr</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ---- 6. CALCULATION BREAKDOWN ---- */}
      {steps && (
        <div>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full flex items-center justify-between rounded-md border px-2.5 py-1.5 hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
              <Layers className="w-3 h-3" /> Show calculation breakdown
            </span>
            {showBreakdown ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
          </button>
          {showBreakdown && (
            <div className="mt-1.5 rounded-md border bg-muted/20 px-2.5 py-2 space-y-1.5">
              <StepLine label="Effective canopy" formula={`${steps.effectiveCanopySqft.toLocaleString()} ft² ÷ 10.7639 = ${steps.floorCanopyM2.toFixed(1)} m² × ${steps.t} tiers`} value={`${steps.totalCanopyM2.toFixed(1)} m²`} />
              <StepLine label="Tiers" formula={`${steps.t} bench tier${steps.t > 1 ? "s" : ""}`} value="" />
              <StepLine label="DLI" formula={`${Math.round(steps.avgPPFD)} PPFD × ${steps.photoH}h × 3600 ÷ 1,000,000`} value={`${fmt1(steps.dli)} mol/m²/day`} />
              <StepLine label="Photoperiod" formula="" value={`${steps.photoH} h/day`} />
              <StepLine label="g/mol" formula="" value={`${gPerMol} g/mol`} />
              <StepLine label="Total mols" formula={`${fmt1(steps.dli)} × ${steps.totalCanopyM2.toFixed(1)} m² × ${cycleDays} days`} value={`${fmtLoc(steps.totalMols)} mol`} />
              <StepLine label="Raw yield" formula={`${fmtLoc(steps.totalMols)} mol × ${gPerMol} g/mol`} value={`${fmtLoc(steps.baseGrams)} g`} />
              <StepLine label="After interception" formula={`${fmtLoc(steps.baseGrams)} × ${steps.interceptFrac.toFixed(2)} (${efficiency}%)`} value={`${fmtLoc(steps.afterInterceptGrams)} g (−${fmtLoc(steps.interceptLoss)} g)`} />
              <StepLine label="After CO₂" formula={`${fmtLoc(steps.afterInterceptGrams)} × ${steps.co2Factor}`} value={`${fmtLoc(steps.afterCO2Grams)} g (−${fmtLoc(steps.co2Loss)} g)`} />
              <StepLine label="After VPD" formula={`${fmtLoc(steps.afterCO2Grams)} × ${steps.vpdFactor}`} value={`${fmtLoc(steps.afterVPDGrams)} g (−${fmtLoc(steps.vpdLoss)} g)`} />
              <div className="pt-1 border-t">
                <StepLine label="Final harvest" formula={`${fmtLoc(steps.afterVPDGrams)} g ÷ 453.592 → ${steps.lbs} lbs | ÷ 1000 → ${steps.kg} kg`} value={`${steps.lbs} lbs | ${steps.kg} kg`} highlight />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[9px] leading-relaxed text-muted-foreground/70 italic px-0.5">
        Yield efficiency is pure photosynthetic conversion under ideal conditions.
        Environmental losses (CO₂, VPD, canopy interception) are applied separately above.
        At high PPFD, real conversion can fall below 1.0 g/mol due to light saturation —
        adjust to match your actual recorded harvests for best accuracy.
      </p>
    </div>
  );
}

function WaterfallRow({ label, grams, barPct, lossGrams, lossPct, barColor, final, lbs, kg }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground truncate mr-1">{label}</span>
        <span className="font-mono font-bold text-foreground shrink-0">{grams.toLocaleString()} g</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(barPct, 100)}%` }}
        />
      </div>
      {lossGrams != null && (
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-destructive/80">−{lossGrams.toLocaleString()} g</span>
          <span className="text-destructive/70 font-mono">−{lossPct}%</span>
        </div>
      )}
      {final && (
        <div className="flex items-baseline gap-2 pt-0.5">
          <span className="font-mono text-sm font-bold text-foreground">{lbs} lbs</span>
          <span className="font-mono text-[11px] text-muted-foreground">{kg} kg</span>
        </div>
      )}
    </div>
  );
}

function Badge({ icon: Icon, color, text }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2 py-1 ${color}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="text-[9px] leading-tight">{text}</span>
    </div>
  );
}

function CanopyStat({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-md border bg-card/60 px-2 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3 text-primary" />
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="font-mono text-[12px] font-bold text-foreground leading-tight">{value}</div>
      <div className="text-[8px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function MetricCard({ label, value, muted }) {
  return (
    <div className={`rounded-lg border px-2 py-2 text-center ${muted ? "bg-muted/10 opacity-50" : "bg-muted/20"}`}>
      <div className="text-[9px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`font-mono text-[11px] font-bold text-foreground`}>{value}</div>
    </div>
  );
}

function StepLine({ label, formula, value, highlight }) {
  return (
    <div className={highlight ? "text-[10px]" : "text-[10px]"}>
      <div className="flex items-center justify-between">
        <span className={`font-semibold ${highlight ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
        <span className={`font-mono font-bold ${highlight ? "text-foreground text-xs" : "text-foreground"}`}>{value}</span>
      </div>
      <div className="text-[9px] text-muted-foreground/60 pl-0">{formula}</div>
    </div>
  );
}