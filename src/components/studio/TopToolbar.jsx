import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Box, Boxes, Map, Home, Loader2, Lock, FilePlus2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import EditableProjectTitle from "./EditableProjectTitle";
import SaveStatus from "./SaveStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { clearLocalDesign } from "@/lib/growroom/localDesign";

// Compact, SaaS-style header. Primary actions stay as icons with tooltips;
// secondary edit/view actions collapse into grouped overflow menus.
export default function TopToolbar({
  canUndo, canRedo, undo, redo, zoomBy, fitToScreen,
  showDimensions, setShowDimensions, onDuplicate, onDelete, onRotate, hasSelection,
  mode3d, setMode3d, onSave, onExport, onExportCsv, onExportPdf, saving, onBack, projectName,
  saveStatus, savedAt, saveError, onRetrySave,
  projectCustomer, onChangeName, onChangeCustomer,
  fullscreen, setFullscreen, onAddRoom,
  warnings, isSubscribed = false, adUnlocked3d = false,
  lockedMode = null,
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();

  return (
    <TooltipProvider delayDuration={300}>
      <div className={`sticky top-0 z-30 flex items-center gap-1.5 px-2 border-b border-white/10 bg-slate-950/90 text-white shadow-lg backdrop-blur supports-[backdrop-filter]:bg-slate-950/80 relative ${isMobile ? "h-14" : "h-12 sm:px-3"}`}>
        {/* Disabled while a save is in flight so navigation never races ahead of
            the DB write; shows a spinner + "Saving…" until the write resolves.
            No tooltip — the visible label is enough, so no duplicate "Home" on hover. */}
        {/* Hidden when there is no page to go back to (ZATLA opens straight into the studio). */}
        {typeof onBack === "function" && (
          <Button variant="outline" size="sm" onClick={onBack} disabled={saving} className={`${isMobile ? "h-10 px-3" : "h-8 px-2"} gap-1.5 shrink-0`} aria-label="Home">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Home className="w-4 h-4" />}
            <span className="text-xs">{saving ? "Saving…" : "Back"}</span>
          </Button>
        )}
        {typeof onBack !== "function" && (
          <span className="text-sm font-extrabold tracking-[0.25em] shrink-0 pl-1">ZATLA</span>
        )}
        <div className="flex-1" />

        {/* 2D / 3D switch — centered — with the New design button right beside it.
            Hidden when this editor is locked to a single view (split layout). */}
        {!lockedMode && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className="flex rounded-full border-2 border-white/20 p-1 bg-slate-800/90 shadow-lg">
            <button onClick={() => setMode3d(false)} className={`flex items-center gap-1.5 ${isMobile ? "px-3 py-2" : "px-4 py-2"} rounded-full text-sm font-bold transition-all ${!mode3d ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(34,197,94,0.65)]" : "text-slate-400"}`}>
              <Map className="w-4 h-4" /> <span>2D</span>
            </button>
            <button onClick={() => setMode3d(true)} className={`flex items-center gap-1.5 ${isMobile ? "px-3 py-2" : "px-4 py-2"} rounded-full text-sm font-bold transition-all ${mode3d ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(34,197,94,0.65)]" : "text-slate-400 opacity-60"}`}>
              {(isSubscribed || adUnlocked3d) ? <Box className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />} <span>3D</span>
            </button>
          </div>
          <Tip label="New design">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!window.confirm("Start a new design? Your current design will be erased.")) return;
                clearLocalDesign();
                window.location.reload();
              }}
              className={`${isMobile ? "h-10 px-2.5" : "h-9 px-3"} gap-1.5 shrink-0`}
              aria-label="New design"
            >
              <FilePlus2 className="w-4 h-4" />
              {!isMobile && <span className="text-xs">New</span>}
            </Button>
          </Tip>
        </div>
        )}

        {/* 3D model library */}
        {isAdmin && (
        <Tip label="3D Models">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/models")}
            className={`${isMobile ? "h-10 px-2.5" : "h-8 px-2"} gap-1.5 shrink-0`}
            aria-label="3D Models"
          >
            <Boxes className="w-4 h-4" />
            {!isMobile && <span className="text-xs">Models</span>}
          </Button>
        </Tip>
        )}

      </div>
    </TooltipProvider>
  );
}

function Tip({ label, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}