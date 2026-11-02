import React, { useRef, useEffect, useState } from "react";

// Inline-editable project name + customer shown in the editor toolbar.
// Always editable; auto-focuses & selects the name on first load when the project
// is still unnamed ("Untitled Room") so users are nudged to name it before working.
export default function EditableProjectTitle({ name, customer, onChangeName, onChangeCustomer }) {
  const nameRef = useRef(null);
  const [highlight, setHighlight] = useState(false);

  // On first mount, focus + select the name if it's still the default placeholder.
  useEffect(() => {
    const isUnnamed = !name || name.trim() === "" || name.trim() === "Untitled Room";
    if (isUnnamed && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
      setHighlight(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col min-w-0 leading-tight">
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setHighlight(false)}
        placeholder="Name your project"
        aria-label="Project name"
        className={`w-[120px] sm:w-[200px] bg-transparent text-sm font-semibold text-foreground outline-none rounded px-1 -mx-1 truncate transition-shadow placeholder:text-muted-foreground placeholder:font-normal focus:bg-background ${
          highlight ? "ring-2 ring-primary bg-background" : "hover:bg-muted/60"
        }`}
      />
    </div>
  );
}