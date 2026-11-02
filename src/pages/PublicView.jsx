import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Walkthrough3D from "@/components/studio/Walkthrough3D";
import { getStudioModels } from "@/lib/growroom/globalModels";
import { apiUrl } from "@/lib/api";

// Public read-only 3D viewer behind a share token (/view/:token). The design
// comes from the server exactly as it was shared; the models come from the live
// library. No edit handlers are passed, so nothing here can change or save it.
export default function PublicView() {
  const { token } = useParams();
  const [state, setState] = useState({ doc: null, error: null });
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [cameraMode, setCameraMode] = useState("orbit");
  const { data: globalModels } = useQuery({ queryKey: ["globalModels"], queryFn: getStudioModels });

  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/api/shares/${encodeURIComponent(token)}`))
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (!ok || !d?.success || !d.design) throw new Error(d?.error || "Not found.");
        const design = d.design;
        const rooms = Array.isArray(design.rooms) ? design.rooms : [];
        setSelectedRoomId(design.activeRoomId || rooms[0]?.id || null);
        setState({ doc: design, error: null });
      })
      .catch((e) => alive && setState({ doc: null, error: e.message }));
    return () => { alive = false; };
  }, [token]);

  // Selecting a room mirrors it into the flat active-room fields, the same
  // shape the studio keeps, so room-scoped 3D labels follow the selection.
  const selectRoom = (id) => {
    setSelectedRoomId(id);
    setState((s) => {
      const r = s.doc && (s.doc.rooms || []).find((x) => x.id === id);
      if (!r) return s;
      return {
        ...s,
        doc: {
          ...s.doc,
          activeRoomId: r.id,
          room: r.room || s.doc.room,
          settings: r.settings || {},
          benches: r.benches || [],
          lights: r.lights || [],
          objects: r.objects || [],
          rotationDeg: r.rotationDeg || 0,
          lightModel: r.lightModel || s.doc.lightModel || null,
          canopyMode: r.canopyMode || s.doc.canopyMode || null,
        },
      };
    });
  };

  if (state.error) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#151517] px-6 text-center text-white">
        <p className="text-lg font-semibold">This share link is no longer available.</p>
        <p className="max-w-sm text-sm text-white/60">Shared designs open for 7 days. Ask the person who sent it for a new link, or plan your own room.</p>
        <Link to="/design" className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-500">Start designing</Link>
      </main>
    );
  }
  // Wait for the model library too, so the scene builds once with the real models.
  if (!state.doc || !globalModels) {
    return <main className="fixed inset-0 flex items-center justify-center bg-[#151517] text-sm text-white/60">Loading 3D view…</main>;
  }

  return (
    <main className="fixed inset-0 bg-[#151517]">
      <Walkthrough3D
        doc={{ ...state.doc, models: {}, globalModels }}
        mode="orbit"
        cameraMode={cameraMode}
        onChangeCameraMode={setCameraMode}
        lightMode="grow"
        updatePresent={() => {}}
        visibility={{}}
        selectedRoomId={selectedRoomId}
        onSelectRoom={selectRoom}
      />
      <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-2">
        <span className="rounded-full border border-white/15 bg-slate-950/85 px-3 py-2 text-xs font-semibold text-white/80 shadow-lg backdrop-blur">View only</span>
        <Link to="/design" className="pointer-events-auto rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-emerald-500">Design your own</Link>
      </div>
    </main>
  );
}
