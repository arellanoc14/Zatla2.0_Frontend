import { useEffect, useRef } from "react";
import { useStudio } from "@/lib/growroom/StudioStore";
import { saveLocalDesign } from "@/lib/growroom/localDesign";

// Writes the current Studio design to localStorage ~1s after the last change,
// and immediately when the tab is hidden or closed. Renders nothing.
export default function LocalDesignSaver() {
  const { doc } = useStudio();
  const latest = useRef(doc);
  latest.current = doc;

  useEffect(() => {
    const t = setTimeout(() => saveLocalDesign(doc), 1000);
    return () => clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    const flush = () => saveLocalDesign(latest.current);
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      // Flush on unmount too. Switching between the 2D section and the 3D page is
      // a client-side route change, which fires NEITHER pagehide nor
      // visibilitychange — without this, an edit made inside the 1s debounce
      // window would be lost on the way to the other view.
      flush();
    };
  }, []);

  return null;
}
