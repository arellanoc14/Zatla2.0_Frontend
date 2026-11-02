// Browser-local persistence for the Studio design (ZATLA has no login and no
// project records, so without this every refresh started a blank room).
//
// The design is stored in this browser's localStorage only: it survives
// refreshes and closing the tab, but does NOT follow the user to another
// device or browser, and clearing site data erases it.
const KEY = "zatla_studio_design_v1";

// Fields never worth persisting: model URLs are re-read live on load, and
// thumbnails are large and regenerated.
const SKIP = new Set(["globalModels", "thumbnail", "thumbnail_url", "thumbnail_svg", "thumbnail_2d_svg"]);

export function loadLocalDesign() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.rooms) || doc.rooms.length === 0) return null;
    return { ...doc, globalModels: {} };
  } catch {
    return null;
  }
}

// Set by clearLocalDesign so the save-on-unload in LocalDesignSaver cannot
// write the old design back while the page reloads into a blank room.
let suppressed = false;

export function saveLocalDesign(doc) {
  if (suppressed) return false;
  try {
    const out = {};
    for (const [k, v] of Object.entries(doc || {})) if (!SKIP.has(k)) out[k] = v;
    localStorage.setItem(KEY, JSON.stringify(out));
    return true;
  } catch {
    return false; // storage full or blocked; never break the editor
  }
}

export function clearLocalDesign() {
  suppressed = true;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
