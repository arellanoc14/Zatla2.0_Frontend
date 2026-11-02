import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Gauge, Copy, Check, Loader2 } from "lucide-react";

// Runs the 3D rendering speed test (see lib/growroom/speedTest.js) and shows the
// result: each goal pass/fail, the cost of every feature, and a plain diagnosis.
// "Copy results" puts the whole report on the clipboard so it can be pasted into a message.
export default function SpeedTestMenu({ onRun }) {
  const [state, setState] = useState("idle"); // idle | running | done | error
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setState("running"); setReport(null); setCopied(false); setError("");
    try {
      const r = await onRun((p) => setProgress(p));
      setReport(r); setState("done");
    } catch (e) {
      setError(e?.message || String(e)); setState("error");
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(report.text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 rounded-full text-[11px] font-medium shrink-0 bg-black text-white hover:bg-black/80 hover:text-white shadow">
          <Gauge className="w-3.5 h-3.5" /> <span>Speed test</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,30rem)] border-white/10 bg-slate-950 p-3 text-white">
        <p className="text-xs text-white/70">
          Draws this scene on your GPU with each feature switched off in turn, then checks the results against fixed goals. Takes about 10 seconds; the view may pause briefly.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
          {state === "running" ? `Testing… ${progress ? progress.label : ""}` : state === "done" ? "Run again" : "Run speed test"}
        </button>

        {state === "error" && <p className="mt-2 text-xs text-red-300">The test could not run: {error}</p>}

        {report && (
          <div className="mt-3 space-y-3 text-xs">
            <div>
              <div className="mb-1 font-semibold text-white/80">Goals</div>
              <ul className="space-y-1">
                {report.checks.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${c.pass ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/25 text-red-300"}`}>{c.pass ? "PASS" : "FAIL"}</span>
                    <span className="flex-1 text-white/80">{c.label}</span>
                    <span className="shrink-0 font-mono text-white/60">{c.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-1 font-semibold text-white/80">Where the frame time goes</div>
              <ul className="space-y-1">
                {report.shares.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-white/70">{s.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(s.share * 100)}%` }} /></span>
                    <span className="w-20 shrink-0 text-right font-mono text-white/60">{s.absent ? "not in scene" : `${Math.round(s.share * 100)}% · ${s.savedMs} ms`}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-white/70">Everything else</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-white/50" style={{ width: `${Math.round(report.otherShare * 100)}%` }} /></span>
                  <span className="w-20 shrink-0 text-right font-mono text-white/60">{Math.round(report.otherShare * 100)}%</span>
                </li>
              </ul>
            </div>

            <p className="rounded-lg bg-white/5 p-2 text-white/90"><span className="font-semibold">Diagnosis: </span>{report.diagnosis}</p>
            <p className="text-[10px] text-white/40">GPU: {report.conditions.gpu} · {report.conditions.device} · pixel ratio {report.conditions.pixelRatio} · canvas {report.conditions.canvas}</p>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 font-semibold hover:bg-white/10">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy results"}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
