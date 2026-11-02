import React from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";

// Small, unobtrusive auto-save status pill for the toolbar.
// status: "idle" | "saving" | "saved" | "error". On error it offers a retry.
export default function SaveStatus({ status, savedAt, errorMessage, onRetry }) {
  if (status === "idle" && !savedAt) return null;

  if (status === "saving") {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground px-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
      </span>
    );
  }

  if (status === "error") {
    return (
      <button
        onClick={onRetry}
        title={errorMessage || "Save failed"}
        className="inline-flex items-center gap-1 text-xs text-destructive px-1 hover:underline max-w-[40vw] sm:max-w-[260px]"
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{errorMessage ? `Save failed: ${errorMessage}` : "Save failed — retry"}</span>
      </button>
    );
  }

  // saved (or idle with a prior save)
  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground px-1">
      <Check className="w-3.5 h-3.5 text-primary" /> Saved
    </span>
  );
}