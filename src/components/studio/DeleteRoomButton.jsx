import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Floating canvas button that deletes the active room (with a confirm dialog).
// Disabled when only one room remains — the last room can never be deleted.
export default function DeleteRoomButton({ roomName, onDelete, disabled }) {
  const [confirm, setConfirm] = useState(false);
  // Stop the press from reaching the canvas hit-test underneath (which would
  // re-select whichever room sits under the button), then open the confirm.
  const stop = (e) => { e.stopPropagation(); };
  const openConfirm = (e) => { e.stopPropagation(); e.preventDefault(); setConfirm(true); };

  return (
    <>
      <button
        onMouseDown={stop}
        onTouchStart={stop}
        onClick={openConfirm}
        disabled={disabled}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Delete this room"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {roomName || "this room"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the room and its bench layout from the facility. This can't be undone after saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(); setConfirm(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}