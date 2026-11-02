import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { roomResults, fmtFeet } from "@/lib/growroom/design3d";
import { fmtFtIn } from "@/lib/growroom/conflicts";
import { formatPrice } from "@/lib/product";
import { SpecRow } from "./DesignFields";

// The 3D view's Results panel — DISPLAY ONLY, recomputed from the live doc on
// every render, so it tracks a change the moment it commits. It writes
// nothing. Every number comes from design3d.roomResults (which reuses the
// app's own stats, clearance and aisle functions), and the grow-light count is
// the same one the cart is kept in step with.

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const UCL_LABEL = { canopy: "UCL", canopyStand: "UCL on stands" };

function Card({ title, children }) {
  return (
    <section className="rounded-xl border border-white/10 bg-background/40 px-3 py-2.5">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-300/90 truncate">{title}</h3>
      {children}
    </section>
  );
}

export default function Results3DPanel({ doc }) {
  const r = roomResults(doc);
  if (!r) return <p className="text-xs text-muted-foreground">Tap a room to see its numbers.</p>;
  const rooms = doc.rooms || [];
  const roomName = rooms.find((x) => x.id === doc.activeRoomId)?.name || doc.name || "Room";
  const c = r.clearances;
  const clr = (x) => (x ? fmtFtIn(x.value) : "—");
  const g = r.growLight;

  return (
    <div className="space-y-3">
      <Card title={`Room · ${roomName}`}>
        <SpecRow label="Room size" value={`${fmtFeet(r.widthFt)} × ${fmtFeet(r.lengthFt)} · ${round1(r.ceilingFt)} ft`} />
        <SpecRow label="Floor area" value={`${r.floorSqft.toLocaleString()} ft²`} />
        <SpecRow label="Canopy" value={`${r.canopySqft.toLocaleString()} ft²`} sub={r.tiers > 1 ? `${r.tiers} tiers` : null} />
        <SpecRow label="Room utilization" value={`${r.utilizationPct}%`} />
        <SpecRow label="Rows" value={r.rows} />
        <SpecRow label="Row length" value={r.rows ? `${r.rowLengthFt} ft` : "—"} />
        <SpecRow label="Bench sections" value={r.sections} sub={r.sections ? `${r.benchWidthFt} ft wide` : null} />
      </Card>

      <Card title="Aisles (actual)">
        <SpecRow label="Center aisle" value={clr(c.center)} tone={c.center?.status} />
        <SpecRow label="Front" value={clr(c.front)} tone={c.front?.status} />
        <SpecRow label="Back" value={clr(c.back)} tone={c.back?.status} />
        <SpecRow label="Left wall" value={clr(c.left)} tone={c.left?.status} />
        <SpecRow label="Right wall" value={clr(c.right)} tone={c.right?.status} />
      </Card>

      <Card title="ZATLA Grow Light">
        {g.on ? (
          <>
            <SpecRow label="Fixtures" value={g.count} sub="1 per 4 ft of bench, every tier" />
            <SpecRow label="Light power" value={`${(g.watts / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kW`} sub="1,000 W each" />
            <SpecRow
              label="AC load"
              value={`${Math.round(g.btu).toLocaleString()} BTU/hr`}
              sub={`${g.tons.toFixed(1)} ton${g.tons >= 1.05 ? "s" : ""}`}
            />
            <SpecRow label="Lights subtotal" value={formatPrice(g.total)} sub={`${g.count} × ${formatPrice(g.unitPrice)}`} />
          </>
        ) : (
          <SpecRow label="Fixtures" value="None" />
        )}
      </Card>

      <Card title="Under canopy (UCL)">
        <SpecRow label="UCL" value={r.ucl.on ? UCL_LABEL[r.ucl.mode] || "UCL" : "None"} />
        {r.ucl.on && <SpecRow label="Units" value={r.ucl.count} sub="4 ft, 2 rows per deck" />}
      </Card>

      <Card title="Controller">
        <SpecRow label="ZATLA Controller" value={r.controllers} />
      </Card>

      {g.on && g.count > 0 && (
        <Link
          to="/cart"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          <ShoppingCart className="w-4 h-4" />
          View cart
        </Link>
      )}
    </div>
  );
}
