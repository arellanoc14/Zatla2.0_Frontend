import { useRef, useState, useCallback, useEffect } from "react";
// ZATLA keeps designs in the visitor's browser (LocalDesignSaver), so there is no
// remote project record to write. projectId is always null, which makes every
// save path below return early; this stub only keeps the call site valid.
const updateProject = async () => {};
import { mirrorActiveRoomPayload, mirrorLegacyTopLevelPayload } from "@/lib/growroom/saveRoom";
import { computeFacility } from "@/lib/growroom/facility";
import { CANOPY_MODE_KEYS } from "@/lib/growroom/canopyLightFit";
import { renderSchematicThumbnail } from "@/lib/growroom/schematicThumbnail";

// Reliable persistence for the studio. Persists the COMPLETE project state to the
// Project entity via an AWAITED write — debounced after every change, and forced
// immediately on leave/unload/route-change so nothing is ever lost in page state.
//
// status: "idle" | "saving" | "saved" | "error" — drives the toolbar indicator.
// Layout logic, calcs, and the 2D↔3D sync are untouched; this only writes data.

const DEBOUNCE_MS = 400;

// Build the full project payload (full rooms[] + facility + models) from the doc.
function buildPayload(d, buildModels) {
  // Mirror the active room's flat working fields (incl. its live rotationDeg) into
  // rooms[], then GUARANTEE every room serializes an explicit rotationDeg so the
  // saved direction round-trips for every room — not just the active one.
  const rooms = mirrorActiveRoomPayload(d).map((r) => ({
    ...r,
    rotationDeg: ((Math.round((r.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360,
    canopyMode: CANOPY_MODE_KEYS.includes(r.canopyMode) ? r.canopyMode : "canopy",
  }));
  // Verify the resized dims are what's being written into rooms[] + legacy top-level.
  const payload = {
    name: d.name,
    customer: d.customer,
    units: d.units,
    // Legacy top-level fields mirrored from the active room's flat working fields,
    // so consumers of the flat fields stay in sync with rooms[] (no stale default).
    ...mirrorLegacyTopLevelPayload(d),
    equipment: d.equipment,
    models: buildModels(d),
    rooms,
    // Persist WHICH room is active so reload reopens the room the user was editing
    // (and hydrates ITS rotation), instead of always defaulting back to rooms[0].
    // Never write null — fall back to the first room so the saved record always
    // carries a valid active room and the active room's benches round-trip.
    // NOTE: these keys must be the server's SNAKE_CASE column names. The payload
    // is sent to /api/projects-db verbatim and the route allowlists column names,
    // so a camelCase key is silently DROPPED — no error, no save. ("activeRoomId"
    // was camelCase here and had never actually persisted.)
    active_room_id: d.activeRoomId || rooms[0]?.id || null,
    // Whether rooms quote to their OWN shipping addresses or share the facility
    // customer's. Must persist: without it a reload silently reverts to the
    // shared address while each room's saved shipTo stays on disk, so estimates
    // would quote — and be TAXED — against the wrong destination.
    per_room_shipping: !!d.perRoomShipping,
    facility: computeFacility(d),
  };
  // Auto-generate the 2D schematic card preview from the just-committed layout so
  // the dashboard card matches the editor exactly. Regenerated on every save, so
  // it always reflects the latest layout. Never blocks the save on failure.
  try {
    const svg = renderSchematicThumbnail({ ...payload, activeRoomId: d.activeRoomId });
    // Safety cap: an oversized image string can break the entity write. If it's
    // unexpectedly large (>60KB), skip it rather than crash the save — the card
    // falls back to its previous/derived preview.
    if (svg && svg.length <= 60_000) payload.thumbnail_svg = svg;
    else if (svg) console.warn("[Schematic] thumbnail too large, skipping:", svg.length);
  } catch (e) {
    console.error("[Schematic] thumbnail generation failed:", e);
  }
  return payload;
}

export function useAutoSave({ projectId, docRef, buildModelsPayload, onAfterSave, commitActiveRoomNow, shouldAutoSave }) {
  const [status, setStatus] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const timer = useRef(null);
  // Guards so rapid edits never race: only one write in flight; if a change lands
  // mid-write, we re-run after it so the FINAL state always wins.
  const inFlight = useRef(false);
  // The promise of the write currently in flight. Lets a second saveNow() caller
  // (e.g. Back navigation while a debounced auto-save is mid-write) AWAIT the same
  // write instead of returning immediately — so navigation never races ahead of
  // the DB confirmation.
  const inFlightPromise = useRef(null);

  // Awaited write of the current docRef state. Resolves ONLY after the DB confirms
  // the write; REJECTS if the write fails so the caller can decide (e.g. don't
  // navigate on error).
  const saveNow = useCallback(async () => {
    if (!projectId) return;
    // A write is already running — await THAT one, then fall through and run a
    // FRESH write of the very latest doc. The in-flight write may have snapshotted
    // its payload BEFORE the newest edit (e.g. a room the user added a moment ago),
    // so a guaranteed follow-up write of the current state is what makes leaving
    // via Home persist that last change. (Previously this returned early and only
    // re-ran if pending.current happened to be set — which dropped the last edit.)
    if (inFlight.current) {
      if (inFlightPromise.current) { try { await inFlightPromise.current; } catch { /* surfaced by the original caller */ } }
    }
    // Guard against overlapping writes when two saveNow() calls fall through the
    // await above at the same time: if another write started while we were waiting,
    // await it instead of racing a second concurrent update.
    if (inFlight.current) {
      if (inFlightPromise.current) { try { await inFlightPromise.current; } catch { /* surfaced elsewhere */ } }
      return;
    }
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // Force-commit the active room's flat working fields into rooms[] and build
    // the payload from the RETURNED committed doc — never from docRef.current,
    // which trails `doc` by one render and could be missing the latest edit on an
    // unmount/route-change save fired immediately after an edit.
    const committed = commitActiveRoomNow ? commitActiveRoomNow() : docRef.current;
    inFlight.current = true;
    setStatus("saving");
    const writePromise = (async () => {
      const payload = buildPayload(committed, buildModelsPayload);
      await updateProject(projectId, payload);
    })();
    inFlightPromise.current = writePromise;
    try {
      await writePromise;
      setStatus("saved");
      setSavedAt(Date.now());
      setErrorMessage(null);
      onAfterSave?.(committed);
    } catch (e) {
      // Surface the REAL server message (not just "save failed") so the failure
      // is diagnosable instead of silent. SDK errors carry it on response.data.
      const detail =
        e?.response?.data?.message ||
        (typeof e?.response?.data === "string" ? e.response.data : null) ||
        e?.message ||
        "Unknown error";
      console.error("[AutoSave] save failed:", detail, e);
      setErrorMessage(detail);
      setStatus("error");
      // Rethrow so awaited callers (Back navigation) can avoid navigating on error.
      throw e;
    } finally {
      inFlight.current = false;
      inFlightPromise.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, buildModelsPayload, onAfterSave, commitActiveRoomNow]);

  // Schedule a debounced save (~1.2s after the last change).
  const scheduleSave = useCallback(() => {
    if (!projectId || (shouldAutoSave && !shouldAutoSave())) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => { saveNow().catch(() => { /* debounced save; error logged + shown via status */ }); }, DEBOUNCE_MS);
  }, [projectId, saveNow, shouldAutoSave]);

  // Force a synchronous-best-effort save on page hide / unload / refresh. The
  // beforeunload path can't await, so we fire the write (keepalive via SDK) and
  // also persist on pagehide which fires reliably on mobile/bfcache.
  useEffect(() => {
    if (!projectId) return;
    const flush = () => {
      if (shouldAutoSave && !shouldAutoSave()) return;
      saveNow().catch(() => { /* unload save; best-effort */ });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectId, saveNow, shouldAutoSave]);

  // Cleanup the debounce timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { status, savedAt, errorMessage, scheduleSave, saveNow };
}