import React, { useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/home/SiteHeader";
import { mountRunner } from "@/lib/play/runner";
import "@/components/home/home.css";

// /play: ZATLA Runner, full screen under the site header. The game itself is
// lib/play/runner.js; this page only draws the menu, the score and the
// game-over card around it.
const BEST_KEY = "zatla_runner_best";
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };

export default function Play() {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const [state, setState] = useState("loading");
  const [run, setRun] = useState({ score: 0, leaves: 0 });
  const [best, setBest] = useState(readBest);

  useEffect(() => {
    const mobile = window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth < 768;
    const game = mountRunner(hostRef.current, {
      mobile,
      onScore: setRun,
      onState: (s, r) => {
        setState(s);
        setRun(r);
        if (s === "over" && r.score > readBest()) {
          try { localStorage.setItem(BEST_KEY, String(r.score)); } catch { /* private mode */ }
          setBest(r.score);
        }
      },
    });
    if (!game) setState("failed");
    gameRef.current = game;
    return () => game?.dispose();
  }, []);

  const start = () => gameRef.current?.start();

  return (
    <div className="home play">
      <SiteHeader />
      <div ref={hostRef} className="play-stage" />

      {state === "playing" && (
        <div className="play-hud" aria-live="off">
          <div className="play-panel"><span>Score</span><b>{run.score}</b></div>
          <div className="play-panel"><span>Leaves</span><b>🌿 {run.leaves}</b></div>
        </div>
      )}

      {state === "menu" && (
        <div className="play-screen">
          <h1 className="display play-title">ZATLA<br /><span>Runner</span></h1>
          <p className="play-help">← → change lanes · ↑ jump · ↓ roll<br />On a phone: swipe.</p>
          <button type="button" className="btn btn-primary play-go" onClick={start}>Tap to play</button>
        </div>
      )}

      {state === "over" && (
        <div className="play-screen">
          <h1 className="display play-title">Clipped!</h1>
          <dl className="play-stats">
            <div><dt>Score</dt><dd>{run.score}</dd></div>
            <div><dt>Leaves</dt><dd>{run.leaves}</dd></div>
            <div className="best"><dt>Best</dt><dd>{best}</dd></div>
          </dl>
          <button type="button" className="btn btn-primary play-go" onClick={start}>Run again</button>
        </div>
      )}

      {state === "failed" && (
        <div className="play-screen"><p className="play-help">This browser can't run 3D. Try another browser or device.</p></div>
      )}
    </div>
  );
}
