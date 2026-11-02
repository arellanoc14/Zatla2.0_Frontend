import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import { commitActiveRoom } from "@/lib/growroom/facility";

const StudioContext = createContext(null);

// Write-time mirror: keep doc.rooms[activeRoomId] in lockstep with the flat
// working fields (benches/doors/objects/lights/settings/rotationDeg) on EVERY
// state update, so there's never a window where the flat fields are newer than
// the active room's rooms[] slot. This makes save (debounced/unmount/manual)
// always serialize current data regardless of timing. No layout/calc changes —
// it only copies the same flat values into rooms[active].
function syncActiveRoom(doc) {
  if (!doc || !Array.isArray(doc.rooms) || !doc.activeRoomId) return doc;
  const rooms = commitActiveRoom(doc);
  return rooms === doc.rooms ? doc : { ...doc, rooms };
}

// Doc = the full editable project state (geometry). History wraps it.
function cloneDoc(d) {
  return JSON.parse(JSON.stringify(d));
}

const initialHistory = (doc) => ({ past: [], present: doc, future: [] });

function reducer(state, action) {
  switch (action.type) {
    case "SET": {
      const computed = typeof action.doc === "function" ? action.doc(state.present) : action.doc;
      // Mirror the active room's flat fields into rooms[active] in the SAME update,
      // so rooms[] is always current and no save can serialize a half-synced state.
      const next = syncActiveRoom(computed);
      if (action.transient) return { ...state, present: next };
      return { past: [...state.past, state.present].slice(-50), present: next, future: [] };
    }
    case "COMMIT": {
      // commit a transient change into history
      if (state.past.length && state.past[state.past.length - 1] === state.present) return state;
      return { ...state };
    }
    case "UNDO": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, 50),
      };
    }
    case "REDO": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "RESET":
      return initialHistory(action.doc);
    default:
      return state;
  }
}

export function StudioProvider({ initialDoc, children }) {
  const [state, dispatch] = useReducer(reducer, initialDoc, initialHistory);

  const setDoc = useCallback((doc, opts = {}) => dispatch({ type: "SET", doc, ...opts }), []);
  const updatePresent = useCallback((updater, opts = {}) => dispatch({ type: "SET", doc: updater, ...opts }), []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const reset = useCallback((doc) => dispatch({ type: "RESET", doc: cloneDoc(doc) }), []);

  const value = {
    doc: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    setDoc,
    updatePresent,
    undo,
    redo,
    reset,
  };
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}