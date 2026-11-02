import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BENCH_TYPES } from "@/lib/growroom/catalog";
import { autoLayoutByRoom, autoLayoutLights, computeStats } from "@/lib/growroom/autolayout";
import { computeClearances, lightCoveragePct } from "@/lib/growroom/clearances";
import { formatLength, parseLength } from "@/lib/growroom/units";
import {
  Boxes, Sprout, Ruler, Gauge, Trash2, Lightbulb, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Camera, Grid3X3, TrendingUp, Zap, FileText, User,
} from "lucide-react";
import { getLightById, LIGHTS_4FT, LIGHTS_5FT } from "./RoomSetup";
import ProductionWizard from "./ProductionWizard";
import TierStepper from "./TierStepper";
import PowerUsagePanel from "./PowerUsagePanel";
import LightPowerCalculator from "./LightPowerCalculator";
import FacilityTotalsPanel from "./FacilityTotalsPanel";
import RoomManagerPanel from "./RoomManagerPanel";
import { Checkbox } from "@/components/ui/checkbox";
import PowerIncludeToggles from "./PowerIncludeToggles";
import CanopyRoomPowerStatus from "./CanopyRoomPowerStatus";

import MeasureInput from "./MeasureInput";
import { useAuth } from "@/lib/AuthContext";
import { estimateRateFromZip, DEFAULT_RATE } from "@/lib/growroom/electricityRates";
import { computeUnderCanopy } from "@/lib/growroom/underCanopy";
import { countCanopyLightsByLength, countCanopyPowerHardware } from "@/lib/growroom/canopyLightCounts";
import { roomEquipmentWatts, roomHasEnrichedCO2, roomExhaustCfm, roomAirChangesPerHour, roomCO2PpmTarget, co2DaysRemaining } from "@/lib/growroom/equipmentLoad";
import { Leaf } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function LandscapeSidePanel({
  doc, updatePresent,
  benchWidth, setBenchWidth,
  benchType, setBenchType,
  tiers, setTiers,
  canopyLightsOn, onSetCanopyLights,
  lightsOn, setLightsOn,
  lightWidth, setLightWidth,
  projectId,
  onSelectRoom, onRenameRoom, onDeleteRoom, onPlaceObject,
}) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  // Resolved rate for Power Usage: saved/zip-estimated rate → $0.10 default.
  const userRate = typeof user?.electricity_rate === "number" ? user.electricity_rate : DEFAULT_RATE;
  const rateEstimated = !!user?.zip_code && estimateRateFromZip(user.zip_code).estimated;

  const [expandedSection, setExpandedSection] = useState(null);
  // ONE customer for the whole facility — selected above the rooms list and
  // shared by every room's estimate. Lifted up to StudioEditor so the bulk
  // "Create Estimates" button can read it too (it needs the QuickBooks
  // customer, not just the plain project-name text field).
  const [yieldResult, setYieldResult] = useState(null);
  // One persisted, room-scoped canopy setting drives Room Stats, power math,
  // hardware counts and the 3D canopy layer.
  const calculateCanopy = canopyLightsOn;
  const setCalculateCanopy = onSetCanopyLights;
  // Include toggles — which power sources feed the room + facility power math.
  const [includeTopLights, setIncludeTopLights] = useState(true);
  const [includeEquipment, setIncludeEquipment] = useState(true);
  // Under-canopy yield uplift, adjustable 20–30% (default 25%).
  const [canopyUplift, setCanopyUplift] = useState(25);
  const [wholesalePrice, setWholesalePrice] = useState("800");
  const [cycleDays, setCycleDays] = useState("60");
  const [lightId, setLightId] = useState(null);
  const [photoperiod, setPhotoperiod] = useState(12);
  const [gPerMol, setGPerMol] = useState("1.0");
  const [buffer, setBuffer] = useState(10);

  // Yield-model tiers: defaults to the actual bench tier count from layout
  const benchTierCount = React.useMemo(() => {
    if (!doc.benches || doc.benches.length === 0) return 1;
    return Math.max(1, doc.benches[0].tiers || 1);
  }, [doc.benches]);
  const [yieldTiers, setYieldTiers] = useState(benchTierCount);
  const tiersUserOverride = React.useRef(false);

  // Sync to actual bench tier count when it changes, unless user has overridden
  React.useEffect(() => {
    if (!tiersUserOverride.current && benchTierCount !== yieldTiers) {
      setYieldTiers(benchTierCount);
    }
  }, [benchTierCount]);

  // Two-way mirror: Growing Tiers (yield model) ↔ Build Benches tier count.
  // Changing either keeps both in sync. Build Benches still requires Auto Layout
  // to physically rebuild benches — we only mirror the selected number here.
  const handleSetYieldTiers = (v) => {
    tiersUserOverride.current = true;
    setYieldTiers(v);
    if (v !== tiers) setTiers(v);
  };

  const handleSetBuildTiers = (v) => {
    setTiers(v);
    tiersUserOverride.current = true;
    setYieldTiers(v);
  };

  // Active room's CO₂ tank presence — drives the wizard's CO₂ factor to Enriched.
  const activeRoomHasCO2 = roomHasEnrichedCO2(doc.objects || []);

  // Ventilation rollup — total extraction CFM and air changes/hr from placed
  // ducting runs against the room volume. Read-only; shown in Room Stats.
  const exhaustCfm = roomExhaustCfm(doc.objects || []);
  const roomCuFt = Math.round((doc.room.widthIn * doc.room.lengthIn * doc.room.ceilingIn) / 1728);
  const ach = roomAirChangesPerHour(doc.objects || [], roomCuFt);

  // CO₂ room conditions — target PPM and the soonest cylinder refill estimate.
  // Display/target only; the yield hook still runs off roomHasEnrichedCO2 above.
  const co2Ppm = roomCO2PpmTarget(doc.objects || []);
  const co2Tanks = (doc.objects || []).filter((o) => o?.type === "co2tank");
  const co2Days = co2Tanks.length
    ? Math.min(...co2Tanks.map((o) => co2DaysRemaining(o.spec || {}, roomCuFt)).filter((d) => d > 0), Infinity)
    : 0;

  const activeRoomName = (doc.rooms || []).find((r) => r.id === doc.activeRoomId)?.name || "Room";
  const stats = computeStats(doc.room, doc.benches || []);
  const trackCount = 2 * (Math.ceil(stats.benchColumns / 2) + stats.benchRows);
  const activeBenchWidthFt = doc.benches?.[0]?.widthIn
    ? Math.round(doc.benches[0].widthIn / 12)
    : benchWidth;
  const canopyLightCounts = React.useMemo(
    () => countCanopyLightsByLength(doc.benches || []),
    [doc.benches]
  );
  const canopyPowerHardware = React.useMemo(
    () => countCanopyPowerHardware(doc.benches || []),
    [doc.benches]
  );
  const clearances = computeClearances(doc.room, doc.benches || [], doc.settings);
  const coverage = lightCoveragePct(doc.benches || [], doc.lights || []);
  // Supplemental under-canopy fixtures derived from real placed benches.
  const underCanopy = React.useMemo(() => computeUnderCanopy(doc.benches || []), [doc.benches]);
  const roomPowerWatts = (includeTopLights ? stats.totalLights * 1000 : 0)
    + (calculateCanopy ? underCanopy.watts : 0)
    + (includeEquipment ? roomEquipmentWatts(doc.objects || []) : 0);
  const selectedLight = getLightById(lightId);

  // Derive PPFD for yield calc: explicit selection → fallback from actual bench widths
  const yieldPPFD = React.useMemo(() => {
    if (selectedLight?.ppfd) return selectedLight.ppfd;
    if (!doc.benches || doc.benches.length === 0) return undefined;
    const w = Math.round(doc.benches[0].widthIn / 12);
    return (w === 5 ? LIGHTS_5FT : LIGHTS_4FT)[0].ppfd;
  }, [selectedLight, doc.benches]);

  const setRoom = (key, raw) => {
    // Room dimensions are entered in feet — bare number = feet.
    const ft = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    if (isNaN(ft) || ft <= 0) return;
    const inches = ft * 12;
    updatePresent((d) => {
      const newRoom = { ...d.room, [key]: inches };
      const { benches } = autoLayoutByRoom(newRoom, d.settings, benchWidth, benchType, tiers);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      return { ...d, room: newRoom, benches, lights };
    });
  };

  const setAisle = (key, raw) => {
    // Aisle/clearance values are entered in inches — bare number = inches.
    const inches = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    if (isNaN(inches) || inches < 0) return;
    // Single source of truth: write the new aisle value into settings, then
    // immediately re-run the layout so benches reposition, on-canvas aisle
    // labels (measured from bench positions) and stats all reflect it live.
    updatePresent((d) => {
      const newSettings = { ...d.settings, [key]: inches };
      const { benches } = autoLayoutByRoom(d.room, newSettings, benchWidth, benchType, tiers);
      const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
      return { ...d, settings: newSettings, benches, lights };
    });
  };

  const applyAutoLayout = () => {
    const { benches } = autoLayoutByRoom(doc.room, doc.settings, benchWidth, benchType, tiers);
    const lights = lightsOn ? autoLayoutLights(benches, lightWidth) : [];
    updatePresent((d) => ({ ...d, benches, lights }));
  };

  const toggleLights = (on) => {
    setLightsOn(on);
    updatePresent((d) => ({ ...d, lights: on ? autoLayoutLights(d.benches || [], lightWidth) : [] }));
  };

  const ftVal = (inches) => Math.round((inches / 12) * 10) / 10;

  // Live shared assumptions for the facility rollup — same values driving the
  // per-room Production & Power panels, so totals stay consistent. co2/vpd use
  // the per-room defaults (enriched / optimal = 1.0).
  // Mirror the CO₂ and VPD defaults from YieldEstimator so facility totals
  // match per-room calculations (enriched = 1.0, optimal VPD = 1.0 as defaults).
  // If users change these in the per-room panel, the facility rollup stays
  // consistent with the most common real-world operating assumption.
  const facilityAssumptions = React.useMemo(() => ({
    wattsPerLight: 1000,
    rate: userRate,
    photoperiod,
    voltage: 120,
    calculateCanopy,
    includeTopLights,
    includeEquipment,
    gPerMol,
    cycleDays,
    buffer,
    pricePerLb: wholesalePrice,
    lightPPFD: yieldPPFD,
    co2Factor: 1.0,
    vpdFactor: 1.0,
  }), [userRate, photoperiod, calculateCanopy, includeTopLights, includeEquipment, gPerMol, cycleDays, buffer, wholesalePrice, yieldPPFD]);

  return (
    <div className="h-full w-full max-w-full min-w-0 flex flex-col bg-card overflow-hidden">
      {/* Header — the mobile drawer supplies its own header */}
      {!isMobile && (
        <div className="shrink-0 px-4 py-3 border-b">
          <div className="text-base font-bold text-foreground flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" /> Rooms
          </div>
        </div>
      )}

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {/* Room manager — select / rename / delete rooms in the facility */}
        <RoomManagerPanel
          doc={doc}
          onSelect={onSelectRoom}
          onRename={onRenameRoom}
          onDelete={onDeleteRoom}
        />

        {/* Facility-wide rollup — sums every room using the shared assumptions */}
        <FacilityTotalsPanel
          doc={doc}
          assumptions={facilityAssumptions}
          expanded={expandedSection === "facility"}
          onToggle={() => setExpandedSection(expandedSection === "facility" ? null : "facility")}
        />

      </div>
    </div>
  );
}

function CollapsibleSection({ id, title, icon: Icon, expanded, onToggle, children, highlight, danger, badge, headerAction }) {
  const hoverClass = danger ? "hover:bg-destructive/10" : highlight ? "hover:bg-primary/10" : "hover:bg-muted/50";
  return (
    <div id={id} className={`border-b scroll-mt-2 ${danger ? "bg-destructive/5 border-l-2 border-l-destructive" : highlight ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
      <div className={`w-full flex items-center gap-2 px-4 py-3 transition-colors ${hoverClass}`}>
        <button onClick={onToggle} className="flex items-center gap-2 min-w-0">
          <span className={`flex items-center gap-2 text-sm font-bold ${danger ? "text-destructive" : highlight ? "text-primary" : "text-foreground"}`}>
            <Icon className="w-4 h-4" /> {title}
          </span>
        </button>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {badge}
          </span>
        )}
        {headerAction}
        <button onClick={onToggle} className="ml-auto p-1.5" aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>
      {expanded && <div className="px-4 pb-4">{children}</div>}
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

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="font-mono text-base font-bold text-foreground">{value}</div>
    </div>
  );
}

function ClearanceBadge({ c, units }) {
  const tone = c.status === "fail" ? "text-destructive border-destructive/20 bg-destructive/5" : c.status === "warn" ? "text-amber-500 border-amber-500/20 bg-amber-500/5" : "text-emerald-600 border-emerald-600/20 bg-emerald-600/5";
  const Icon = c.status === "pass" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-center justify-between rounded-md border px-2 py-1 text-[10px] ${tone}`}>
      <span className="truncate mr-1">{c.label}</span>
      <span className="flex items-center gap-1 font-mono font-semibold shrink-0">
        {formatLength(c.value, units)}
        <Icon className="w-3 h-3" />
      </span>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}