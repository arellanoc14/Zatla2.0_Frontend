import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Orbit, Square, Footprints, ChevronDown, Check, Camera } from "lucide-react";

// Camera mode switcher for the 3D view — Orbit / Top-Down / Walkthrough.
// View/camera only; selecting a mode triggers a smooth animated transition.
const MODES = [
  { id: "orbit", label: "Orbit", icon: Orbit, hint: "Free 3D orbit" },
  { id: "topdown", label: "Top Down", icon: Square, hint: "Blueprint, pan + zoom" },
  { id: "walkthrough", label: "Walkthrough", icon: Footprints, hint: "First-person, 5.5ft" },
];

export default function CameraModeSwitcher({ cameraMode = "orbit", onChange }) {
  const active = MODES.find((m) => m.id === cameraMode) || MODES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] shrink-0 bg-yellow-400 text-black hover:bg-yellow-300 hover:text-black">
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{active.label}</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Camera</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = m.id === cameraMode;
          return (
            <DropdownMenuItem key={m.id} onClick={() => onChange?.(m.id)} className={isActive ? "bg-accent" : ""}>
              <Icon className="w-4 h-4" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.hint}</span>
              </div>
              {isActive && <Check className="w-4 h-4 ml-auto" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}