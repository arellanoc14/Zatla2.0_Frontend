import React from "react";
import { Leaf } from "lucide-react";
import { isUclMode } from "@/lib/growroom/canopyLightFit";

export default function CanopyRoomPowerStatus({ doc }) {
  const rooms = Array.isArray(doc.rooms) && doc.rooms.length
    ? doc.rooms
    : [{ id: "room_1", name: doc.name || "Room 1", canopyMode: doc.canopyMode }];
  const enabledCount = rooms.filter((room) => isUclMode(room.canopyMode)).length;

  return (
    <div className="mb-2 rounded-lg border bg-muted/30 px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Leaf className="h-3 w-3 text-primary" /> Under-canopy by room
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          {enabledCount} on · {rooms.length - enabledCount} off
        </span>
      </div>
      <div className="space-y-1">
        {rooms.map((room) => {
          const enabled = isUclMode(room.canopyMode);
          return (
            <div key={room.id} className="flex items-center justify-between text-[11px]">
              <span className="truncate text-foreground">{room.name || "Untitled room"}</span>
              <span className={`font-mono font-semibold ${enabled ? "text-primary" : "text-muted-foreground"}`}>
                {enabled ? "On" : "Off"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}