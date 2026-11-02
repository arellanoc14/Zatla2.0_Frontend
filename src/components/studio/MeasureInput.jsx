import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

// Numeric measurement input with a non-editable unit suffix adornment.
// The user types a plain number (e.g. 27); the unit (' / " / ft / in) is shown
// inside the field as an adornment, NOT part of what they type or what's parsed.
// Any unit characters the user does type are stripped gracefully.
//
//   value    — current numeric value to display (number)
//   unit     — adornment text shown on the right ("'", '"', "ft", "in")
//   onCommit — called with the cleaned numeric STRING on blur/Enter
//   placeholder — faint hint (e.g. "27")
export default function MeasureInput({ value, unit = "'", onCommit, placeholder, className = "" }) {
  const [text, setText] = useState(value == null ? "" : String(value));

  // Re-sync when the external value changes (e.g. auto-layout, undo/redo).
  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  // Keep only digits and a decimal point while typing, and strip leading zeros so
  // typing "36" never shows "036". A lone "0", "0.x" decimals, and an empty field
  // (while editing) are all preserved.
  const clean = (raw) => {
    let s = raw.replace(/[^0-9.]/g, "");
    // Drop leading zeros on the integer part unless it's "0" or a "0." decimal.
    s = s.replace(/^0+(?=\d)/, "");
    return s;
  };

  const commit = () => {
    const cleaned = clean(text);
    setText(cleaned);
    onCommit(cleaned);
  };

  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(clean(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={`pr-7 ${className}`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground select-none">
        {unit}
      </span>
    </div>
  );
}