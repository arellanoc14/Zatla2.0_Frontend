import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, Wind, Droplets } from "lucide-react";
import RoomSetup from "./RoomSetup";
import YieldCycle from "./YieldCycle";
import YieldEstimator from "./YieldEstimator";

const CO2_OPTIONS = [
  { id: "ambient", label: "Ambient", sub: "~400 ppm", factor: 0.6 },
  { id: "mid", label: "Mid", sub: "~700 ppm", factor: 0.8 },
  { id: "enriched", label: "Enriched", sub: "1000–1200 ppm", factor: 1.0 },
];

const VPD_OPTIONS = [
  { id: "optimal", label: "In range", sub: "1.0–1.5 kPa", factor: 1.0 },
  { id: "slight", label: "Slightly off", sub: "", factor: 0.92 },
  { id: "out", label: "Out of range", sub: "", factor: 0.85 },
];

const STEPS = [
  { id: "room", label: "Your Room" },
  { id: "cycle", label: "Grow Cycle" },
  { id: "conditions", label: "Conditions" },
  { id: "results", label: "Your Results" },
];

export default function ProductionWizard({
  lightId, setLightId,
  photoperiod, setPhotoperiod,
  gPerMol, setGPerMol,
  cycleDays, setCycleDays,
  buffer, setBuffer,
  tiers, setTiers,
  benches, efficiency, lightPPFD,
  totalLights,
  onResultChange,
  hasCO2Tank = false,
}) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [co2Level, setCo2Level] = useState("enriched");
  const [vpdLevel, setVpdLevel] = useState("optimal");
  const topRef = useRef(null);

  const co2Factor = CO2_OPTIONS.find(o => o.id === co2Level)?.factor ?? 1;
  const vpdFactor = VPD_OPTIONS.find(o => o.id === vpdLevel)?.factor ?? 1;

  // A placed CO₂ tank in this room forces Enriched (1.0). Physical object drives
  // the math — keep the selection in sync whenever a tank is added/removed.
  useEffect(() => {
    if (hasCO2Tank) setCo2Level("enriched");
  }, [hasCO2Tank]);

  // Scroll the panel back to the top on each step change
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [step]);

  const goNext = () => { setDirection(1); setStep((s) => Math.min(s + 1, 3)); };
  const goBack = () => { setDirection(-1); setStep((s) => Math.max(s - 1, 0)); };
  const restart = () => { setDirection(-1); setStep(0); };

  const variants = {
    enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div className="flex flex-col w-full max-w-full min-w-0" ref={topRef}>
      {/* Progress bar */}
      <div className="flex items-center gap-1 px-1 pb-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors duration-300 ${
                i < step ? "bg-primary border-primary text-primary-foreground" :
                i === step ? "border-primary text-primary" :
                "border-muted-foreground/30 text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${
                i === step ? "text-primary" : i < step ? "text-foreground" : "text-muted-foreground"
              }`}>{s.label}</span>
            </div>
            {i < 3 && (
              <div className="w-6 h-0.5 -mt-3 bg-muted-foreground/20 overflow-hidden rounded-full">
                <motion.div
                  className="h-full bg-primary"
                  initial={false}
                  animate={{ width: i < step ? "100%" : "0%" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="relative overflow-hidden min-h-[260px] w-full max-w-full min-w-0">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-4 w-full max-w-full min-w-0"
          >
            {step === 0 && (
              <>
                <StepHeader title="Your Room" subtitle="Based on the benches you placed on your layout." />
                <RoomSetup
                  benches={benches || []}
                  lightId={lightId}
                  onLightIdChange={setLightId}
                />
                {benches && benches.length > 0 && (() => {
                  const canopySqft = Math.round(benches.reduce((sum, b) => {
                    const tiers = Math.max(1, b.tiers || 1);
                    return sum + (b.lengthIn * b.widthIn * tiers) / 144;
                  }, 0));
                  return (
                    <FeedbackLine>
                      Total canopy: <strong className="font-mono font-bold text-foreground">{canopySqft.toLocaleString()} ft²</strong> across <strong className="font-mono font-bold text-foreground">{benches.length}</strong> bench{benches.length !== 1 ? "es" : ""}
                    </FeedbackLine>
                  );
                })()}
              </>
            )}

            {step === 1 && (
              <>
                <StepHeader title="Grow Cycle" subtitle="Tell us about your growing schedule." />
                <YieldCycle
                  photoperiod={photoperiod}
                  onPhotoperiodChange={setPhotoperiod}
                  gPerMol={gPerMol}
                  onGPerMolChange={setGPerMol}
                  cycleDays={cycleDays}
                  onCycleDaysChange={setCycleDays}
                  buffer={buffer}
                  onBufferChange={setBuffer}
                  tiers={tiers}
                  onTiersChange={setTiers}
                />
                {(() => {
                  const d = parseFloat(cycleDays) || 0;
                  const b = parseFloat(buffer) || 0;
                  const harvests = d > 0 ? Math.round(365 / (d + b)) : 0;
                  return (
                    <FeedbackLine>
                      About <strong className="font-mono font-bold text-foreground">{harvests}</strong> harvest{harvests !== 1 ? "s" : ""} per year
                    </FeedbackLine>
                  );
                })()}
              </>
            )}

            {step === 2 && (
              <>
                <StepHeader title="Conditions" subtitle="Your environment affects how much you actually harvest." />

                {/* CO₂ */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wind className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label className="text-[11px] font-medium text-foreground">CO₂ enrichment</Label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CO2_OPTIONS.map((o) => (
                      <OptionCard key={o.id} option={o} active={co2Level === o.id} onClick={() => setCo2Level(o.id)} />
                    ))}
                  </div>
                  {hasCO2Tank && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1 bg-primary/10 border-primary/30 text-primary">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span className="text-[9px] leading-tight">CO₂ tank placed in this room — set to Enriched (×1.0)</span>
                    </div>
                  )}
                </div>

                {/* VPD */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label className="text-[11px] font-medium text-foreground">Humidity balance (VPD)</Label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {VPD_OPTIONS.map((o) => (
                      <OptionCard key={o.id} option={o} active={vpdLevel === o.id} onClick={() => setVpdLevel(o.id)} />
                    ))}
                  </div>
                </div>

                <FeedbackLine dotClass="bg-primary">
                  CO₂ ×{co2Factor} · VPD ×{vpdFactor}
                </FeedbackLine>
              </>
            )}

            {step === 3 && (
              <>
                <StepHeader title="Your Results" subtitle="Here's what your setup can produce." />
                <YieldEstimator
                  benches={benches || []}
                  efficiency={efficiency}
                  cycleDays={cycleDays}
                  buffer={buffer}
                  lightPPFD={lightPPFD}
                  gPerMol={gPerMol}
                  photoperiod={photoperiod}
                  tiers={tiers}
                  co2Level={co2Level}
                  vpdLevel={vpdLevel}
                  totalLights={totalLights}
                  onResultChange={onResultChange}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation — sticky at the bottom for thumb reach */}
      <div className="sticky bottom-0 z-10 mt-4 -mx-3 px-3 py-3 border-t bg-card/95 backdrop-blur-sm flex items-center justify-between gap-2">
        {step > 0 ? (
          <Button variant="outline" onClick={goBack} className="gap-1 min-h-[44px] flex-1 max-w-[120px]">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        ) : <div className="flex-1 max-w-[120px]" />}

        {step < 3 ? (
          <Button onClick={goNext} className="gap-1 min-h-[44px] flex-1 max-w-[160px]">
            Next <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="outline" onClick={restart} className="gap-1 min-h-[44px] flex-1 max-w-[160px]">
            <RotateCcw className="w-4 h-4" /> Start Over
          </Button>
        )}
      </div>
    </div>
  );
}

function StepHeader({ title, subtitle }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

function FeedbackLine({ children, dotClass = "bg-primary" }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5 flex items-center gap-2 min-w-0">
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
      <span className="text-[11px] text-muted-foreground min-w-0 break-words">{children}</span>
    </div>
  );
}

function OptionCard({ option, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[44px] rounded-lg border px-2 py-3 text-center transition-colors ${
        active ? "border-primary bg-primary/10" : "border-input bg-transparent hover:bg-muted/40"
      }`}
    >
      <div className={`text-[11px] font-semibold ${active ? "text-primary" : "text-foreground"}`}>{option.label}</div>
      {option.sub && <div className="text-[9px] text-muted-foreground mt-0.5">{option.sub}</div>}
      <div className={`text-xs font-mono font-bold mt-1 ${active ? "text-primary" : "text-muted-foreground"}`}>×{option.factor}</div>
    </button>
  );
}