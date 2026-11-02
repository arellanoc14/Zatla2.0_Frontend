import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { capacityTable, totalPotsForBenches, DEFAULT_POT_IN } from "@/lib/growroom/potCapacity";
import { Sprout } from "lucide-react";

// Pot sizes available now — 6" is the default; others kept for future use.
const POT_SIZES = [
  { v: 6, label: '6"' },
  { v: 4, label: '4"' },
  { v: 8, label: '8"' },
  { v: 10, label: '10"' },
];

export default function PotCapacityPanel({ doc }) {
  const [potIn, setPotIn] = useState(DEFAULT_POT_IN);
  const rows = capacityTable(potIn);
  const grandTotal = totalPotsForBenches(doc.benches || [], potIn);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5" /> Pot Capacity
        </h3>
        <Select value={String(potIn)} onValueChange={(v) => setPotIn(Number(v))}>
          <SelectTrigger className="h-7 w-20 bg-slate-800 border-slate-700 text-slate-100 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POT_SIZES.map((p) => <SelectItem key={p.v} value={String(p.v)}>{p.label} pot</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-700">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-slate-800 text-slate-400">
              <th className="text-left font-medium px-2 py-1.5">Bench</th>
              <th className="text-right font-medium px-1.5 py-1.5">W"</th>
              <th className="text-right font-medium px-1.5 py-1.5">L"</th>
              <th className="text-right font-medium px-1.5 py-1.5">Across</th>
              <th className="text-right font-medium px-1.5 py-1.5">Long</th>
              <th className="text-right font-medium px-2 py-1.5">Total</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-800">
                <td className="px-2 py-1.5 font-sans">{r.label}</td>
                <td className="text-right px-1.5 py-1.5">{r.widthIn}</td>
                <td className="text-right px-1.5 py-1.5">{r.lengthIn}</td>
                <td className="text-right px-1.5 py-1.5">{r.across}</td>
                <td className="text-right px-1.5 py-1.5">{r.along}</td>
                <td className="text-right px-2 py-1.5 font-bold text-primary">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/15 border border-primary/30 px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-primary/80">Grand Total · This Layout</div>
          <div className="text-[10px] text-slate-400">{(doc.benches || []).length} benches · {potIn}" pots</div>
        </div>
        <div className="font-mono text-2xl font-bold text-primary">{grandTotal}</div>
      </div>
    </div>
  );
}