import React, { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X, DoorOpen, ChevronDown } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Lists every room in the facility. Selecting a room scopes the controls to it
// (sets activeRoomId via onSelect). Each room can be renamed inline and deleted
// (with confirm); the last remaining room can never be deleted.
export default function RoomManagerPanel({ doc, onSelect, onRename, onDelete }) {
  const rooms = Array.isArray(doc.rooms) && doc.rooms.length > 0 ? doc.rooms : [];
  const activeId = doc.activeRoomId;
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Collapses the whole Rooms block so the section folds down to one header row.
  const [collapsed, setCollapsed] = useState(false);

  // Debounced auto-save timer ref. Cleared on Escape / new keystroke / unmount.
  const debounceRef = useRef(null);

  const saveName = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed || !editingId) return;
    onRename(editingId, trimmed);
  }, [editingId, onRename]);

  const commitRename = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const name = draftName.trim();
    if (editingId && name) onRename(editingId, name);
    setEditingId(null);
  }, [draftName, editingId, onRename]);

  const cancelRename = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setEditingId(null);
  }, []);

  const startRename = (room) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setEditingId(room.id);
    setDraftName(room.name || "");
  };

  const onNameChange = (value) => {
    setDraftName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return; // empty draft — don't schedule a save
    debounceRef.current = setTimeout(() => saveName(value), 500);
  };

  if (rooms.length === 0) return null;

  const roomToDelete = rooms.find((r) => r.id === confirmDeleteId);

  // The active room's benches live in the flat doc.benches; other rooms store
  // theirs on room.benches. Count from the right source per row.
  const roomBenches = (room) => (room.id === activeId ? doc.benches : room.benches);
  const benchCount = (room) => roomBenches(room)?.length || 0;
  const roomTierCount = (room) =>
    Math.max(1, Math.round(Number(roomBenches(room)?.[0]?.tiers) || 1));

  return (
    <div className="px-4 py-4 border-b">
      {/* Header doubles as the collapse control — with several rooms the list
          grows tall enough to bury everything below it in the panel. */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between gap-2 mb-3 min-h-11 text-left"
      >
        <div className="text-sm font-bold text-foreground flex items-center gap-2">
          <DoorOpen className="w-4 h-4 text-primary" /> Rooms
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{rooms.length}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      </button>

      {!collapsed && (
        <div className="space-y-2.5">
          {rooms.map((room) => {
            const isActive = room.id === activeId;
            const isEditing = room.id === editingId;
            return (
              <div
                key={room.id}
                className={`rounded-2xl border-2 bg-card px-3.5 py-3 transition-colors ${
                  isActive ? "border-primary/50 bg-accent/40" : "border-border hover:bg-muted/40"
                }`}
              >
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={draftName}
                      onChange={(e) => onNameChange(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-11 rounded-xl text-base"
                    />
                    <button onClick={commitRename} className="w-11 h-11 flex items-center justify-center rounded-xl text-primary hover:bg-primary/10 shrink-0" aria-label="Save name">
                      <Check className="w-4.5 h-4.5" />
                    </button>
                    <button onClick={cancelRename} className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted shrink-0" aria-label="Cancel rename">
                      <X className="w-4.5 h-4.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onSelect(room.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`text-sm font-bold truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                          {room.name || "Room"}
                        </div>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          Tier {roomTierCount(room)}
                        </span>
                      </div>
                      <div className="text-[12px] text-muted-foreground font-mono mt-0.5">
                        {Math.round((room.room?.widthIn || 0) / 12)}×{Math.round((room.room?.lengthIn || 0) / 12)} ft · {benchCount(room)} {benchCount(room) === 1 ? "bench" : "benches"}
                      </div>
                    </button>
                    <button onClick={() => startRename(room)} className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted shrink-0" aria-label="Rename room">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(room.id)}
                      disabled={rooms.length <= 1}
                      className="w-10 h-10 flex items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Delete room"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {roomToDelete?.name || "this room"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the room and its bench layout from the facility. This can't be undone after saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
