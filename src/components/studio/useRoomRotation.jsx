import { useRef, useState, useCallback, useEffect } from "react";
import { commitActiveRoom, roomRotationCollides, computeFacility, resolveRoomOverlap } from "@/lib/growroom/facility";

// Eased 90°-step rotation for the ACTIVE room.
//
// Visual/animation layer only — it animates the live `doc.rotationDeg` from the
// current angle to the next 90° step with an easeInOutCubic curve (~280ms), and
// COMMITS the snapped angle into rooms[].rotationDeg on animation END (never
// every frame). 2D and 3D both read the same rotationDeg, so they stay in sync;
// the 3D scene re-renders at the committed angle when the spin finishes.
//
// Rapid taps retarget smoothly: the running tween's target jumps to the next
// step and the animation continues from where it is — no stacked phantoms.
// A tap whose landing angle would overlap a neighboring room is BLOCKED (no
// animation, no commit) and reported via onBlocked so the UI can red-flag it.
const DURATION = 280; // ms
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function useRoomRotation({ doc, updatePresent, onBlocked }) {
  const [animating, setAnimating] = useState(false);
  const raf = useRef(null);
  const anim = useRef(null); // { from, to, start }
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    anim.current = null;
    setAnimating(false);
  }, []);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const tick = useCallback(() => {
    const a = anim.current;
    if (!a) return;
    const now = performance.now();
    const t = Math.min(1, (now - a.start) / DURATION);
    const eased = easeInOutCubic(t);
    const cur = a.from + (a.to - a.from) * eased;
    // Live transient angle — no history entry, drives both 2D canvas + 3D rebuild.
    updatePresent((d) => ({ ...d, rotationDeg: cur }), { transient: true });
    if (t >= 1) {
      // Commit the snapped final angle into rooms[].rotationDeg + history, then
      // auto-nudge the rotated room flush against any neighbor it now overlaps.
      const snapped = ((Math.round(a.to / 90) * 90) % 360 + 360) % 360;
      updatePresent((d) => {
        const withFinal = { ...d, rotationDeg: snapped };
        let rooms = commitActiveRoom(withFinal).map((r) =>
          r.id === d.activeRoomId ? { ...r, rotationDeg: snapped } : r
        );
        const facility = computeFacility({ ...withFinal, rooms });
        const resolved = resolveRoomOverlap(rooms, d.activeRoomId, facility);
        if (resolved) {
          rooms = rooms.map((r) => (r.id === d.activeRoomId ? { ...r, offset: resolved } : r));
        }
        return { ...withFinal, rooms };
      });
      stop();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [updatePresent, stop]);

  // Rotate the active room +90°. Blocks (and flags) if the landing angle overlaps.
  const rotate = useCallback(() => {
    const d = docRef.current;
    const rooms = Array.isArray(d.rooms) ? d.rooms : [];
    const activeId = d.activeRoomId;
    // Guard: never rotate without a selected/active room. The action ALWAYS uses
    // this stored activeId — it never re-evaluates which room is under the pointer.
    if (!activeId || !rooms.some((r) => r.id === activeId)) return;
    // Base = where a running tween is heading, else the room's current angle, so
    // rapid taps queue cleanly onto the next step.
    const base = anim.current ? anim.current.to : (d.rotationDeg || 0);
    const target = Math.round(base / 90) * 90 + 90;
    const landed = ((target % 360) + 360) % 360;

    // If the landing angle overlaps a neighbor, allow it ONLY when the overlap is
    // small enough to auto-nudge flush; block (flag) a gross collision.
    if (roomRotationCollides(rooms, activeId, landed)) {
      // Probe: the room at the landed rotation — can a small flush nudge resolve it?
      const probe = rooms.map((r) =>
        r.id === activeId ? { ...r, rotationDeg: landed } : r
      );
      const facility = computeFacility({ ...d, rooms: probe });
      if (!resolveRoomOverlap(probe, activeId, facility)) {
        onBlocked?.();
        return;
      }
    }

    // Commit the LANDED angle into rooms[].rotationDeg IMMEDIATELY (history entry),
    // independent of the animation. This guarantees the saved direction is the
    // final target even if the user navigates away mid-spin — the animation below
    // only tweens the visual flat angle, it is no longer the source of the saved
    // value. (Also keeps the flat rotationDeg unwrapped for a smooth visual tween.)
    updatePresent((dd) => {
      const rooms = (Array.isArray(dd.rooms) ? dd.rooms : []).map((r) =>
        r.id === dd.activeRoomId ? { ...r, rotationDeg: landed } : r
      );
      return { ...dd, rooms };
    });

    if (anim.current) {
      // Retarget the in-flight tween: keep current eased position as the new
      // "from" so the spin continues smoothly toward the new target.
      const a = anim.current;
      const t = Math.min(1, (performance.now() - a.start) / DURATION);
      const eased = easeInOutCubic(t);
      a.from = a.from + (a.to - a.from) * eased;
      a.to = target;
      a.start = performance.now();
      return;
    }

    anim.current = { from: d.rotationDeg || 0, to: target, start: performance.now() };
    setAnimating(true);
    raf.current = requestAnimationFrame(tick);
  }, [tick, onBlocked]);

  return { rotate, animating };
}