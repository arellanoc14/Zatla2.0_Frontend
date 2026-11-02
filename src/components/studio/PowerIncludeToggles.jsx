import React from "react";
import { Switch } from "@/components/ui/switch";
import { Lightbulb, Wind } from "lucide-react";

// "Include in calculation" — top-light and equipment controls. Under-canopy
// power follows each room's Room Stats setting and is intentionally not overridden here.
export default function PowerIncludeToggles({
  includeTop, setIncludeTop,
  includeEquipment, setIncludeEquipment,
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2.5 py-2 mb-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        Include in calculation
      </div>
      <div className="space-y-1.5">
        <ToggleRow icon={Lightbulb} label="Grow lights" checked={includeTop} onChange={setIncludeTop} />
        <ToggleRow icon={Wind} label="Equipment (HVAC, fans…)" checked={includeEquipment} onChange={setIncludeEquipment} />
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[11px] text-foreground">
        <Icon className="w-3 h-3 text-primary" /> {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-90" />
    </div>
  );
}