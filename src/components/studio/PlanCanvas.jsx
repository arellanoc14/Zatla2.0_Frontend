import React, { useRef, useEffect } from "react";
import { benchRect, rectsOverlap } from "@/lib/growroom/clearances";
import { equipmentByKind } from "@/lib/growroom/catalog";
import { smartObjectSize, doorWallLine } from "@/lib/growroom/smartObjects";
import { facilityBox, roomFloorRect, roomsOverlap } from "@/lib/growroom/facility";
import { drawFacilityFloor, drawRoomRect, drawFrontBackLabels, drawTierLabel, traceRoomOutline } from "@/lib/growroom/facilityDraw";
import { LAYER_IDS, isLayerHidden, isObjectHidden } from "@/lib/growroom/layers";

export default function PlanCanvas({
  doc, viewport, selected, multiSelected, showDimensions, containerRef,
  guides, roomGuides, hoveredHandle, clearanceViolations, visibility, warnings, roomDragging, rotateFlash, roomMoveMode2D, lineGhosts,
}) {
  const canvasRef = useRef(null);
  // Latest draw inputs kept in a ref so the ResizeObserver can redraw with current
  // data without being torn down/recreated on every prop change.
  const drawArgs = { doc, viewport, selected, multiSelected, showDimensions, guides, roomGuides, hoveredHandle, clearanceViolations, visibility, warnings, roomDragging, rotateFlash, roomMoveMode2D, lineGhosts };
  const drawArgsRef = useRef(drawArgs);
  drawArgsRef.current = drawArgs;

  // Size the backing store to the CONTAINER (never to room inches), capping the
  // device pixel ratio so a large room on a high-DPR phone can't allocate a
  // multi-thousand-pixel framebuffer and OOM-crash the tab.
  const sizeAndDraw = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return; // not laid out yet — ResizeObserver will fire again
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, h, drawArgsRef.current);
  };

  // Redraw whenever draw inputs change.
  useEffect(() => {
    const raf = requestAnimationFrame(sizeAndDraw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, viewport, selected, multiSelected, showDimensions, guides, roomGuides, hoveredHandle, clearanceViolations, visibility, warnings, roomDragging, rotateFlash, roomMoveMode2D, lineGhosts]);

  // Pulse animation for warning outlines — runs a light rAF loop ONLY while there
  // are warnings, redrawing with a time-based phase. Idle (no warnings) = no loop.
  useEffect(() => {
    if (!warnings || warnings.length === 0) return;
    let raf;
    const tick = () => {
      drawArgsRef.current = { ...drawArgsRef.current, pulse: Math.sin(Date.now() / 300) * 0.5 + 0.5 };
      sizeAndDraw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warnings]);

  // Resize/orientation handling: re-measure the container and redraw whenever it
  // changes size — including the initial 0→real-size transition on mobile, which
  // the old one-shot RAF missed and left the canvas blank/unsized.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(sizeAndDraw));
    ro.observe(container);
    const onResize = () => requestAnimationFrame(sizeAndDraw);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 touch-none" />;
}

// ── Premium CAD color palette ──
const C = {
  bg: "#1E2128",
  gridMinor: "#262932",
  gridMajor: "#32363F",
  room: "#4B5563",
  benchFill: "#2A3038",
  benchFillGrad: ["#2F353E", "#252A32"],
  benchBorder: "#3D434D",
  benchShadow: "rgba(0,0,0,0.35)",
  benchModule: "#353B46",
  benchSelBorder: "#16a34a",
  benchSelGlow: "rgba(22,163,74,0.18)",
  overlap: "#dc2626",
  overlapGlow: "rgba(220,38,38,0.20)",
  multiSelBorder: "#3B82F6",
  lightFill: "rgba(251,191,36,0.28)",
  lightStroke: "rgba(251,191,36,0.70)",
  lightGlow: "rgba(251,191,36,0.12)",
  lightLabel: "#FBBF24",
  aisle: "#4B5563",
  dimPillBg: "rgba(30,33,40,0.88)",
  dimPillBorder: "#3D434D",
  dimLabel: "#D1D5DB",
  dimArrow: "#6B7280",
  equipFill: "rgba(107,114,128,0.14)",
  equipStroke: "#6B7280",
  equipText: "#9CA3AF",
  statCardBg: "rgba(30,33,40,0.90)",
  statCardBorder: "#3D434D",
  statLabel: "#9CA3AF",
  statValue: "#E5E7EB",
  tierBadge: ["#6B7280", "#3B82F6", "#16a34a"],
  tierLabel: "#1E2128",
  // New: CAD interaction colours
  handleFill: "#ffffff",
  handleStroke: "#16a34a",
  handleRotateFill: "#16a34a",
  guideLine: "rgba(22,163,74,0.45)",
  guideDashed: [4, 4],
  rulerBg: "rgba(30,33,40,0.92)",
  rulerTick: "#6B7280",
  rulerLabel: "#9CA3AF",
  clearanceWarn: "rgba(220,38,38,0.30)",
  clearanceBorder: "#ef4444",
  multiSelDash: "#3B82F6",
  // Smart objects — color-coded by mount so wall/floor/ceiling read at a glance.
  objWall: "#38BDF8",     // sky — wall-mounted (door, mini-split, fan)
  objFloor: "#A78BFA",    // violet — floor-standing (dehumidifier, CO₂)
  objCeiling: "#F472B6",  // pink — ceiling (ducting)
  // Bright selection highlight for equipment & doors — a vivid lime-green stroke
  // with a strong glow, so a selected object visibly lights up.
  objSel: "#4ADE80",
  objSelGlow: "rgba(74,222,128,0.85)",
  objSelFill: "rgba(74,222,128,0.22)",
};

// Glyph + label per smart-object type (label drawn beneath the icon box).
const OBJ_GLYPH = {
  door: { glyph: "🚪", label: "Door" },
  minisplit: { glyph: "❄", label: "HVAC" },
  dehumidifier: { glyph: "✺", label: "Dehum" },
  fan: { glyph: "✦", label: "Fan" },
  ducting: { glyph: "≋", label: "Duct" },
  co2tank: { glyph: "CO₂", label: "CO₂" },
  controller: { glyph: "▤", label: "Controller" },
};

function objMountColor(mount) {
  if (mount === "floor") return C.objFloor;
  if (mount === "ceiling") return C.objCeiling;
  return C.objWall;
}

// HVAC ducting run (2D) — a top-down representation of the SAME physical run
// shown in 3D: a solid galvanized duct pipe, an inline fan housing (a wider
// cylindrical body with a hub), an optional carbon filter canister at the intake
// end, and an exhaust cap at the outlet. No text label. Drawn in screen space,
// rotating around the run's center to match the object's heading.
function drawDuctingRun(ctx, obj, p, ow, oh, isSel) {
  const duct = isSel ? "#4ADE80" : "#9CA3AF";      // pipe body outline
  const ductFill = isSel ? "rgba(74,222,128,0.16)" : "rgba(148,163,184,0.20)";
  const dark = isSel ? "#4ADE80" : "#4B5563";      // filter / fan housing accent

  // Selection border — drawn first so the run renders on top.
  if (isSel) {
    ctx.save();
    ctx.translate(p.x + ow / 2, p.y + oh / 2);
    if (obj.rotationDeg) ctx.rotate((obj.rotationDeg * Math.PI) / 180);
    ctx.shadowColor = C.objSelGlow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = C.objSelFill;
    roundRect(ctx, -ow / 2, -oh / 2, ow, oh, 3);
    ctx.fill();
    ctx.strokeStyle = C.objSel;
    ctx.lineWidth = 3;
    roundRect(ctx, -ow / 2, -oh / 2, ow, oh, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.x + ow / 2, p.y + oh / 2);
  if (obj.rotationDeg) ctx.rotate((obj.rotationDeg * Math.PI) / 180);

  const x0 = -ow / 2, x1 = ow / 2;
  const pipeH = Math.max(6, oh * 0.62);      // duct pipe thickness
  const filterW = Math.min(26, ow * 0.16);   // carbon filter canister length
  const fanW = Math.min(22, ow * 0.14);      // inline fan housing length
  const fanH = Math.max(pipeH + 4, oh * 0.9);

  // ── Galvanized duct pipe body (rounded solid tube spanning the run) ──
  ctx.fillStyle = ductFill;
  ctx.strokeStyle = duct;
  ctx.lineWidth = isSel ? 2 : 1.5;
  roundRect(ctx, x0, -pipeH / 2, ow, pipeH, pipeH / 2);
  ctx.fill();
  ctx.stroke();

  // Corrugation seam lines along the pipe (reads as the flex/segmented duct in 3D).
  ctx.strokeStyle = duct;
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = 0.55;
  const segs = Math.max(3, Math.floor(ow / 20));
  ctx.beginPath();
  for (let i = 1; i < segs; i++) {
    const sx = x0 + (i / segs) * ow;
    ctx.moveTo(sx, -pipeH / 2 + 1.5);
    ctx.lineTo(sx, pipeH / 2 - 1.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Carbon filter canister at the intake (left) end ──
  if (obj.spec?.carbonFilter !== false) {
    const fx = x0 + filterW / 2 + 2;
    ctx.fillStyle = dark;
    ctx.strokeStyle = duct;
    ctx.lineWidth = isSel ? 2 : 1.25;
    roundRect(ctx, fx - filterW / 2, -fanH / 2, filterW, fanH, filterW / 3);
    ctx.fill();
    ctx.stroke();
  }

  // ── Inline fan housing (wider cylinder with a hub) past the filter ──
  const fanX = x0 + ow * 0.38;
  ctx.fillStyle = isSel ? "rgba(74,222,128,0.22)" : "rgba(100,116,139,0.30)";
  ctx.strokeStyle = duct;
  ctx.lineWidth = isSel ? 2 : 1.5;
  roundRect(ctx, fanX - fanW / 2, -fanH / 2, fanW, fanH, fanW / 3);
  ctx.fill();
  ctx.stroke();
  // Fan hub dot
  ctx.fillStyle = duct;
  ctx.beginPath();
  ctx.arc(fanX, 0, Math.max(1.5, fanW * 0.18), 0, Math.PI * 2);
  ctx.fill();

  // ── Exhaust cap at the outlet (right) end ──
  ctx.strokeStyle = duct;
  ctx.lineWidth = isSel ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x1 - 3, -pipeH / 2 - 2);
  ctx.lineTo(x1 - 3, pipeH / 2 + 2);
  ctx.stroke();

  ctx.restore();
}

// CO₂ tank schematic (2D): a labeled circle (tank top-down) with a dashed tubing
// line running to a small row of distribution points, labeled "20lb · 800psi".
function drawCO2Tank(ctx, obj, p, ow, oh, isSel) {
  const violet = "#A78BFA";
  const sel = "#4ADE80";
  const stroke = isSel ? sel : violet;

  // Selection border — drawn first so the tank schematic renders on top.
  if (isSel) {
    ctx.save();
    ctx.translate(p.x + ow / 2, p.y + oh / 2);
    if (obj.rotationDeg) ctx.rotate((obj.rotationDeg * Math.PI) / 180);
    ctx.shadowColor = C.objSelGlow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = C.objSelFill;
    roundRect(ctx, -ow / 2, -oh / 2, ow, oh, 3);
    ctx.fill();
    ctx.strokeStyle = C.objSel;
    ctx.lineWidth = 3;
    roundRect(ctx, -ow / 2, -oh / 2, ow, oh, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  const cx = p.x + ow / 2;
  const cy = p.y + oh / 2;
  const r = Math.max(6, Math.min(ow, oh) / 2);

  // Selection glow
  if (isSel) {
    ctx.save();
    ctx.shadowColor = "rgba(74,222,128,0.85)";
    ctx.shadowBlur = 18;
  }
  // Tank body (circle, top-down) with a faint fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = isSel ? "rgba(74,222,128,0.22)" : stroke + "26";
  ctx.fill();
  if (isSel) ctx.restore();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = isSel ? 2 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Inner valve ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.stroke();

  // "CO₂" glyph in the center (only when large enough)
  if (r > 9) {
    ctx.fillStyle = stroke;
    ctx.font = "600 8px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CO₂", cx, cy + 0.5);
  }

  // Dashed tubing line down to a row of distribution points (below the tank).
  const tubeLen = Math.max(22, r * 2.4);
  const baseY = cy + r + tubeLen;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.lineTo(cx, baseY);
  // T-split manifold
  const span = Math.max(14, r * 2);
  ctx.moveTo(cx - span / 2, baseY);
  ctx.lineTo(cx + span / 2, baseY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Distribution points (4 small dots)
  ctx.fillStyle = stroke;
  for (let i = 0; i < 4; i++) {
    const dx = cx - span / 2 + (i + 0.5) * (span / 4);
    ctx.beginPath();
    ctx.arc(dx, baseY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label (screen space): "20lb · 800psi"
  const lb = Number(obj.spec?.tankSizeLb) || 20;
  const psi = Number(obj.spec?.tankPsi) || 800;
  ctx.fillStyle = isSel ? "#E5E7EB" : violet;
  ctx.font = "600 9px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`${lb}lb · ${psi}psi`, cx, cy - r - 11);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// Architectural door symbol (2D plan), matching the uploaded CAD reference:
// a wall opening with a jamb post at each side, a swing leaf panel hinged at the
// left jamb, and a green quarter-circle arc tracing the door's swing path.
// The opening (sill) attaches flush to whichever room wall the door is snapped
// against; the leaf + arc swing INTO the room. The symbol auto-orients to the
// nearest wall (top/bottom/left/right) so it always reads against the border.
function drawDoor(ctx, obj, p, ow, oh, isSel, room, size) {
  const wall = isSel ? "#4ADE80" : "#9CA3AF";   // jamb / wall stub (bright when selected)
  const swing = isSel ? "#4ADE80" : "#22C55E";  // swing arc + leaf (bright when selected)
  const sel = "#4ADE80";

  // Which wall is this door snapped to? Pick the nearest room edge to the door's
  // center so the opening sits on that border and swings inward.
  const sw = size?.w || obj.spec?.widthIn || 36;
  const sh = size?.h || sw;
  // Merged / drawn rooms snap doors to their REAL polygon walls, not the box.
  const { side: nearWall, coord: wallCoord } = doorWallLine(obj, room);
  // Base symbol is drawn with the sill at the box BOTTOM swinging up; rotate the
  // whole symbol so the sill lands on the snapped wall and the swing faces INWARD.
  // Left/right use +90°/−90° (respectively) so the swing projects into the room on
  // the vertical walls — left swings right, right swings left.
  const wallRotation = { bottom: 0, left: Math.PI / 2, top: Math.PI, right: -Math.PI / 2 }[nearWall];

  // Pin the symbol's rotation center so its sill lands EXACTLY on the room wall,
  // regardless of any gap between the door's footprint box and the wall. The sill
  // is at +oh/2 (box bottom) before rotation, so place the center half a box-height
  // inside the wall. wallPx is the wall line in screen px (from room geometry).
  const wallPx = {
    top: p.y + (wallCoord - obj.pos.y) * (oh / sh),
    bottom: p.y + (wallCoord - obj.pos.y) * (oh / sh),
    left: p.x + (wallCoord - obj.pos.x) * (ow / sw),
    right: p.x + (wallCoord - obj.pos.x) * (ow / sw),
  };
  // Swing direction — inward (default) puts the leaf/arc inside the room;
  // outward mirrors the symbol across the wall so it swings outside.
  const swingOut = obj.spec?.swing === "out";
  // Place the symbol's center so its sill lands flush on the snapped wall. The sill
  // is at local (0,+oh/2); after the wall rotation it points toward the wall, so the
  // center sits half a box-depth on the ROOM side of the wall line (or the OUTSIDE
  // when the door swings outward).
  const inOff = swingOut ? -oh / 2 : oh / 2;
  let drawCX = p.x + ow / 2, drawCY = p.y + oh / 2;
  if (nearWall === "top") drawCY = wallPx.top + inOff;
  else if (nearWall === "bottom") drawCY = wallPx.bottom - inOff;
  else if (nearWall === "left") drawCX = wallPx.left + inOff;
  else if (nearWall === "right") drawCX = wallPx.right - inOff;

  // Hinge side (left jamb by default; flip to right jamb when spec says so).
  const hingeRight = obj.spec?.hinge === "right";

  // No selection box on doors — AutoCAD-style: when selected, the door's own
  // linework (jambs, leaf, arc) renders green with a glow instead.

  ctx.save();
  ctx.translate(drawCX, drawCY);
  ctx.rotate(wallRotation);
  // Mirror vertically to swing the leaf/arc OUTSIDE the room when requested.
  if (swingOut) ctx.scale(1, -1);
  // Mirror across X to put the hinge on the right jamb when requested.
  if (hingeRight) ctx.scale(-1, 1);
  // Bright selection glow — makes the whole door symbol light up when selected.
  if (isSel) {
    ctx.shadowColor = "rgba(74,222,128,0.85)";
    ctx.shadowBlur = 16;
  }

  // Classic CAD door symbol drawn in the box's local frame (matching the reference):
  // small square jamb blocks at each side of the wall opening, an OUTLINED (unfilled)
  // thin leaf panel standing perpendicular to the wall off the hinge jamb, and a
  // thin quarter-circle arc tracing the latch edge's sweep back to the strike jamb.
  const half = ow / 2;             // half the opening width
  const sill = oh / 2;             // bottom edge of the box = wall line
  const hingeX = -half;            // hinge point on the wall (left jamb)
  const strikeX = half;            // strike jamb (latch side) on the wall
  const width = ow;                // door width = opening width = leaf length & arc radius
  const leafThick = Math.max(2.5, ow * 0.07);
  // Door linework is ALWAYS green — brighter when selected.
  const lineCol = isSel ? sel : swing;

  ctx.strokeStyle = lineCol;
  ctx.lineWidth = isSel ? 1.5 : 1;
  ctx.lineCap = "butt";

  // Jamb blocks — small outlined squares marking each side of the wall opening.
  const jamb = Math.max(3, ow * 0.06);
  ctx.strokeRect(hingeX - jamb / 2, sill - jamb, jamb, jamb);
  ctx.strokeRect(strikeX - jamb / 2, sill - jamb, jamb, jamb);

  // Quarter-circle swing arc — thin line centered on the hinge, radius = door
  // width, from the open leaf tip (straight up) around to the strike jamb.
  ctx.beginPath();
  ctx.arc(hingeX, sill, width, -Math.PI / 2, 0);
  ctx.stroke();

  // Door leaf — a thin OUTLINED rectangle (double-line CAD panel) hinged at the
  // wall, standing perpendicular to it, its free end reaching the arc.
  ctx.strokeRect(hingeX - leafThick / 2, sill - jamb - width, leafThick, width);

  ctx.restore();
  // No dimension label on the door — clean CAD symbol only.
}

const MODULE_IN = 48;

// Pulsing orange warning outline (read-only highlight). `pulse` ∈ [0,1] drives the
// glow intensity so flagged items breathe to draw attention without moving them.
function drawWarnOutline(ctx, x, y, w, h, pulse = 1) {
  const orange = "#f59e0b";
  ctx.save();
  ctx.shadowColor = `rgba(245,158,11,${0.25 + 0.45 * pulse})`;
  ctx.shadowBlur = 6 + 10 * pulse;
  ctx.strokeStyle = orange;
  ctx.lineWidth = 2;
  roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 4);
  ctx.stroke();
  ctx.restore();
}

// Subtle aisle-conflict indicator — a thin amber dashed centerline down the tight
// gap plus a small ⚠ badge with the measurement (e.g. "⚠ Aisle 2'6" — below 3 ft
// minimum"). Read-only: it informs only, never moves/edits/recolors benches.
function drawAisleWarning(ctx, warn, w2s, ppi, pulse = 1) {
  const amber = "#f59e0b";
  const r = warn.rect; // {x,y,w,h} room-local inches
  const cxIn = r.x + r.w / 2;
  const top = w2s(cxIn, r.y);
  const bot = w2s(cxIn, r.y + r.h);

  // Thin amber dashed line down the center of the gap.
  ctx.save();
  ctx.strokeStyle = amber;
  ctx.globalAlpha = 0.55 + 0.35 * pulse;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bot.x, bot.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Small ⚠ badge with the measurement, centered on the gap.
  const label = `⚠ ${warn.message}`;
  const midY = (top.y + bot.y) / 2;
  ctx.font = "600 10px Inter, sans-serif";
  const tw = ctx.measureText(label).width + 14;
  const bx = top.x - tw / 2, by = midY - 9;
  ctx.save();
  ctx.fillStyle = "rgba(30,33,40,0.92)";
  roundRect(ctx, bx, by, tw, 18, 9);
  ctx.fill();
  ctx.strokeStyle = amber;
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, tw, 18, 9);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = amber;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, top.x, midY + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w, y + h - r, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function mainAisleBounds(benches, roomWidth, fallbackWidth) {
  const columns = [...new Map((benches || []).map((b) => [b.pos.x, {
    left: b.pos.x,
    right: b.pos.x + b.widthIn,
  }])).values()].sort((a, b) => a.left - b.left);
  let widest = null;
  for (let i = 0; i < columns.length - 1; i++) {
    const gap = columns[i + 1].left - columns[i].right;
    if (gap > 0 && (!widest || gap > widest.width)) {
      widest = { left: columns[i].right, right: columns[i + 1].left, width: gap };
    }
  }
  if (widest) {
    const width = fallbackWidth || widest.width;
    const center = (widest.left + widest.right) / 2;
    return { left: center - width / 2, right: center + width / 2, width };
  }
  const width = fallbackWidth || 0;
  return { left: roomWidth / 2 - width / 2, right: roomWidth / 2 + width / 2, width };
}

function draw(ctx, W, H, { doc, viewport, selected, multiSelected, showDimensions, guides, roomGuides, hoveredHandle, clearanceViolations, visibility, warnings, pulse, roomDragging, rotateFlash, roomMoveMode2D, lineGhosts }) {
  const vis = visibility || {};
  const benchesHidden = isLayerHidden(vis, LAYER_IDS.BENCHES);
  const lightsHidden = isLayerHidden(vis, LAYER_IDS.LIGHTS);
  const doorsHidden = isLayerHidden(vis, LAYER_IDS.DOORS);
  // Aisle warnings carry geometry and are drawn on the gap itself. Equipment
  // objects keep their normal selected indicator without an extra warning box.
  const aisleWarnings = (warnings || []).filter((w) => w.kind === "aisle" && w.rect);
  const pulseA = typeof pulse === "number" ? pulse : 1;
  const { pixelsPerInch: ppi, panX, panY } = viewport;
  // Facility-space → screen (origin = facility floor 0,0).
  const f2s = (x, y) => ({ x: x * ppi + panX, y: y * ppi + panY });

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H, viewport);
  drawRuler(ctx, W, H, viewport, doc);

  // ── Facility floor + room rectangles ──
  const rooms = Array.isArray(doc.rooms) ? doc.rooms : [];
  const activeId = doc.activeRoomId;
  const facility = facilityBox(doc);
  drawFacilityFloor(ctx, facility, f2s, ppi);
  // Draw INACTIVE rooms as labeled rectangles WITH their own benches inside, so
  // each room's footprint outline visibly wraps its own contents (no empty box).
  // Benches are drawn from the SAME offset + dims + rotationDeg as the outline.
  // Draw rectangle outline + benches first, THEN the name/sq-ft label on top, so
  // a room's benches never cover up its label.
  rooms.forEach((rm) => {
    if (rm.id === activeId) return;
    drawRoomRect(ctx, rm, f2s, ppi, { active: false, label: false });
    drawInactiveRoomBenches(ctx, rm, f2s, ppi);
    drawRoomRect(ctx, rm, f2s, ppi, { active: false, outline: false });
    // Front/Back/Tier orientation labels are intentionally NOT drawn on inactive
    // rooms — they appear ONLY on the currently selected (active) room (below).
  });

  // ── Room-to-room alignment guides (blue, facility space) ──
  // Drawn while a room is being dragged wherever its edges/centers line up with a
  // neighbor. Guide-only: this is a visual cue, the room never force-snaps.
  if (roomGuides && roomGuides.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1.25;
    roomGuides.forEach((g) => {
      const a = f2s(g.orient === "v" ? g.pos : g.from, g.orient === "v" ? g.from : g.pos);
      const b = f2s(g.orient === "v" ? g.pos : g.to, g.orient === "v" ? g.to : g.pos);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    ctx.restore();
  }

  // The active room's interior is drawn in room-LOCAL coordinates, translated by
  // the active room's offset so it lands at its place on the facility floor.
  const activeRoom = rooms.find((rm) => rm.id === activeId);

  // No active room (user clicked outside all rooms) — every room is already drawn
  // as an unselected rectangle above. Skip the active-room interior, handles,
  // header and orientation labels entirely so nothing renders as selected.
  if (!activeRoom) return;

  // Room dims + outline for the active room — doors snap to the real polygon walls.
  const activeRoomPoly = Array.isArray(activeRoom?.polygon) && activeRoom.polygon.length >= 3
    ? { ...doc.room, polygon: activeRoom.polygon }
    : doc.room;

  const offset = activeRoom?.offset || { x: 0, y: 0 };
  const ox = offset.x || 0, oy = offset.y || 0;
  // Room-local → screen: shift origin by the active room's offset. Everything
  // below (benches, lights, dims) uses this exactly as before — only the origin
  // moved, so each room's internal layout logic is unchanged.
  const w2s = (x, y) => f2s(x + ox, y + oy);

  const roomW = doc.room.widthIn * ppi;
  const roomH = doc.room.lengthIn * ppi;
  const o = w2s(0, 0);

  // Does the active room overlap any OTHER room on the facility floor? When it
  // does, its W×L dimension labels render bright red as a clear collision cue.
  // Read-only — never moves rooms or changes data; uses the same rotated
  // footprint rects the rest of the facility logic relies on.
  const roomOverlap = !!activeRoom && rooms.some((rm) => rm.id !== activeId && roomsOverlap(activeRoom, rm));

  // ── Active room rotation (live, animated) ───────────────────────────────────
  // The whole active room — footprint, benches, lights, equipment, objects,
  // aisle, walkways — rotates together as ONE group about the room's center.
  // The angle is doc.rotationDeg (driven by the eased rotate animation); 2D and
  // 3D read the SAME value so they always agree. Text labels counter-rotate (via
  // drawUprightLabel) so they stay horizontal/readable every frame.
  const roomAngleRad = ((doc.rotationDeg || 0) * Math.PI) / 180;
  const roomCenter = { x: o.x + roomW / 2, y: o.y + roomH / 2 };

  // ctx.save() pairs with the ctx.restore() before the upright move-handle header.
  ctx.save();
  if (roomAngleRad) {
    ctx.translate(roomCenter.x, roomCenter.y);
    ctx.rotate(roomAngleRad);
    ctx.translate(-roomCenter.x, -roomCenter.y);
  }

  // Main aisle follows the actual gap between the two packed bench banks.
  const centerIn = doc.settings?.centerIn || 0;
  const aisle = mainAisleBounds(doc.benches, doc.room.widthIn, centerIn);
  if (aisle.width > 0) {
    const aL = w2s(aisle.left, 0);
    const aR = w2s(aisle.right, 0);
    ctx.strokeStyle = C.aisle;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(aL.x, o.y); ctx.lineTo(aL.x, o.y + roomH);
    ctx.moveTo(aR.x, o.y); ctx.lineTo(aR.x, o.y + roomH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Benches ──
  const GAP = 0.6;
  const vids = new Set(clearanceViolations || []);
  const multiIds = new Set((multiSelected || []).filter((s) => s.kind === "bench").map((s) => s.id));

  (benchesHidden ? [] : (doc.benches || [])).forEach((b) => {
    const r = benchRect(b);
    const p = w2s(r.x + GAP, r.y + GAP);
    const bw = Math.max(2, (r.w - GAP * 2) * ppi), bh = Math.max(2, (r.h - GAP * 2) * ppi);
    const overlap = (doc.benches || []).some((o2) => o2.id !== b.id && rectsOverlap(r, benchRect(o2)));
    // Benches are display-only — never render an orange "selected" state.
    const isSel = false;
    const isMulti = multiIds.has(b.id);
    const isViolating = vids.has(b.id);

    // Shadow
    ctx.save();
    ctx.shadowColor = C.benchShadow;
    ctx.shadowBlur = isSel ? 10 : 5;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    if (overlap || isViolating) {
      ctx.fillStyle = isViolating && !overlap ? "#3D3335" : C.overlap;
    } else if (isSel) {
      ctx.fillStyle = C.benchFillGrad[1];
    } else {
      const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + bh);
      grad.addColorStop(0, C.benchFillGrad[0]);
      grad.addColorStop(1, C.benchFillGrad[1]);
      ctx.fillStyle = grad;
    }
    roundRect(ctx, p.x, p.y, bw, bh, 2);
    ctx.fill();
    ctx.restore();

    // Clearance violation glow
    if (isViolating && !isSel) {
      ctx.save();
      ctx.shadowColor = C.overlapGlow;
      ctx.shadowBlur = 10;
      roundRect(ctx, p.x, p.y, bw, bh, 2);
      ctx.strokeStyle = C.clearanceBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Selection glow
    if (isSel) {
      ctx.save();
      ctx.shadowColor = C.benchSelGlow;
      ctx.shadowBlur = 12;
      roundRect(ctx, p.x, p.y, bw, bh, 2);
      ctx.strokeStyle = C.benchSelBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Multi-select border
    if (isMulti && !isSel) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      roundRect(ctx, p.x - 2, p.y - 2, bw + 4, bh + 4, 3);
      ctx.strokeStyle = C.multiSelBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }

    // Border
    ctx.strokeStyle = (overlap || isViolating) ? C.clearanceBorder : isSel ? C.benchSelBorder : isMulti ? C.multiSelBorder : C.benchBorder;
    ctx.lineWidth = (overlap || isViolating) ? 1.5 : isSel ? 2 : isMulti ? 1.5 : 1;
    roundRect(ctx, p.x, p.y, bw, bh, 2);
    ctx.stroke();

    // Benches are NEVER recolored for warnings — they stay display-only red
    // dashed. Aisle/gap conflicts are flagged on the aisle itself (see below).

    // Module dividers
    ctx.strokeStyle = C.benchModule;
    ctx.lineWidth = 0.5;
    const mods = Math.max(1, b.modules || Math.round(b.lengthIn / MODULE_IN));
    ctx.beginPath();
    for (let m = 1; m < mods; m++) {
      const ly = p.y + ((m * MODULE_IN) - GAP) * ppi;
      ctx.moveTo(p.x, ly); ctx.lineTo(p.x + bw, ly);
    }
    ctx.stroke();

    // Size label (e.g. "4×8") — counter-rotated so it stays upright even while the
    // room spins. Fades out at low zoom so tiny, unreadable numbers don't clutter
    // the zoomed-out view. Room dimensions are unaffected. Full opacity above
    // ppi=0.5, fully hidden below ppi=0.32, linearly fading in between.
    const labelAlpha = Math.max(0, Math.min(1, (ppi - 0.32) / (0.5 - 0.32)));
    if (labelAlpha > 0.01) {
      ctx.save();
      const blcx = p.x + bw / 2, blcy = p.y + bh / 2;
      if (roomAngleRad) {
        ctx.translate(blcx, blcy);
        ctx.rotate(-roomAngleRad);
        ctx.translate(-blcx, -blcy);
      }
      ctx.globalAlpha = labelAlpha;
      ctx.fillStyle = "#9CA3AF";
      ctx.font = "600 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.round(b.widthIn / 12)}×${Math.round(b.lengthIn / 12)}`, blcx, blcy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    }



    // Selection handles
    if (isSel) drawSelectionHandles(ctx, r, w2s, ppi, hoveredHandle);

    // Selected badge
    if (isSel) {
      const selY = p.y - 8;
      const txt = `${Math.round(b.widthIn / 12)}' × ${Math.round(b.lengthIn / 12)}'`;
      ctx.font = "600 10px Inter, sans-serif";
      const tw = ctx.measureText(txt).width + 14;
      ctx.fillStyle = C.benchSelBorder;
      roundRect(ctx, p.x + bw / 2 - tw / 2, selY - 16, tw, 15, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, p.x + bw / 2, selY - 8.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  });

  // ── Alignment guides (rendered on top) ──
  if (guides && guides.length > 0) {
    guides.forEach((g) => {
      const from = w2s(g.orient === "v" ? g.pos : g.from, g.orient === "v" ? g.from : g.pos);
      const to = w2s(g.orient === "v" ? g.pos : g.to, g.orient === "v" ? g.to : g.pos);
      ctx.strokeStyle = C.guideLine;
      ctx.lineWidth = 1;
      ctx.setLineDash(C.guideDashed);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  // ── Grow Lights ──
  (lightsHidden ? [] : (doc.lights || [])).forEach((l) => {
    const p = w2s(l.pos.x, l.pos.y);
    const lw = l.footprintIn.w * ppi, lh = l.footprintIn.h * ppi;
    const isSel = selected?.kind === "light" && selected.id === l.id;

    // Outer glow
    ctx.save();
    ctx.shadowColor = C.lightGlow;
    ctx.shadowBlur = Math.max(6, 10 * ppi);
    roundRect(ctx, p.x, p.y, lw, lh, 3);
    ctx.fillStyle = C.lightFill;
    ctx.fill();
    ctx.restore();

    // Light bar body
    roundRect(ctx, p.x, p.y, lw, lh, 3);
    ctx.fillStyle = C.lightFill;
    ctx.fill();
    ctx.strokeStyle = isSel ? "#fff" : C.lightStroke;
    ctx.lineWidth = isSel ? 2 : 1.25;
    roundRect(ctx, p.x, p.y, lw, lh, 3);
    ctx.stroke();

    // Light icon / label — only when large enough to read
    if (lw > 28 && lh > 14) {
      ctx.fillStyle = C.lightLabel;
      ctx.font = "600 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("☀", p.x + lw / 2, p.y + lh / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  });

  // ── Equipment ──
  (doc.equipment || []).forEach((e) => {
    const p = w2s(e.pos.x, e.pos.y);
    const ew = e.sizeIn.w * ppi, eh = e.sizeIn.h * ppi;
    const isSel = selected?.kind === "equipment" && selected.id === e.id;
    ctx.fillStyle = C.equipFill;
    roundRect(ctx, p.x, p.y, ew, eh, 2);
    ctx.fill();
    ctx.strokeStyle = isSel ? "#E5E7EB" : C.equipStroke;
    ctx.lineWidth = isSel ? 1.5 : 1;
    roundRect(ctx, p.x, p.y, ew, eh, 2);
    ctx.stroke();
    const meta = equipmentByKind(e.kind);
    ctx.fillStyle = isSel ? "#E5E7EB" : C.equipText;
    ctx.font = "500 9px Inter, sans-serif";
    ctx.fillText((meta?.label || e.kind).slice(0, 14), p.x + 3, p.y + eh / 2 + 3);
  });

  // ── Smart Objects (per-room equipment) ──
  (doc.objects || []).forEach((obj) => {
    if (isObjectHidden(vis, obj)) return; // layer hidden — visual only
    const s = smartObjectSize(obj);
    const p = w2s(obj.pos.x, obj.pos.y);
    // Visual-only enlargement of the AC indicator (2D plan only). Grows the drawn
    // box/glyph around its center without changing the stored footprint (so hit-area,
    // clearances and 3D are untouched).
    const drawScale = obj.type === "minisplit" ? 1.6 : obj.type === "controller" ? 1.5 : 1;
    const ow0 = Math.max(8, s.w * ppi), oh0 = Math.max(8, s.h * ppi);
    const ow = ow0 * drawScale, oh = oh0 * drawScale;
    // Re-center the enlarged box on the object's true footprint center.
    if (drawScale !== 1) { p.x -= (ow - ow0) / 2; p.y -= (oh - oh0) / 2; }
    const isSel = selected?.kind === "object" && selected.id === obj.id;

    // Ducting renders as an HVAC schematic: a dashed run with airflow arrows, an
    // inline fan (circle + X), a carbon filter (filled rect), and a CFM/dia label.
    if (obj.type === "ducting") {
      drawDuctingRun(ctx, obj, p, ow, oh, isSel);
      return;
    }
    // CO₂ tank renders as a labeled circle with a dashed tubing line to outlets.
    if (obj.type === "co2tank") {
      drawCO2Tank(ctx, obj, p, ow, oh, isSel);
      return;
    }
    // Door renders as an architectural swing symbol (jambs + leaf + arc).
    if (obj.type === "door") {
      // Doors are hidden in the 2D plan (also never drawn in 3D).
      return;
    }
    // Dehumidifier reads as a light-blue labeled rectangle with a fan symbol.
    const col = obj.type === "dehumidifier" ? "#7DD3FC" : objMountColor(obj.mount);
    const meta = OBJ_GLYPH[obj.type] || { glyph: "▣", label: obj.type };

    // Box (rotates around its center when rotationDeg set)
    ctx.save();
    ctx.translate(p.x + ow / 2, p.y + oh / 2);
    if (obj.rotationDeg) ctx.rotate((obj.rotationDeg * Math.PI) / 180);
    if (isSel) {
      ctx.shadowColor = C.objSelGlow;
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = isSel ? C.objSelFill : col + "26";
    roundRect(ctx, -ow / 2, -oh / 2, ow, oh, 3);
    ctx.fill();
    ctx.strokeStyle = isSel ? C.objSel : col;
    ctx.lineWidth = isSel ? 3 : 1.25;
    roundRect(ctx, -ow / 2, -oh / 2, ow, oh, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Icon glyph centered (only when the box is big enough to read)
    if (ow > 18 && oh > 12) {
      ctx.fillStyle = isSel ? C.objSel : col;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.glyph, 0, 0.5);
    }
    ctx.restore();

    // Label beneath the box (screen-space, never rotated)
    ctx.fillStyle = isSel ? "#E5E7EB" : col;
    ctx.font = "600 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(meta.label, p.x + ow / 2, p.y + oh + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });

  // ── Line-place ghost previews (Placement Mode drag) — room-local, rotate with
  //     the room. Valid = green dashed; invalid (won't fit) = muted red. ──
  if (lineGhosts && lineGhosts.length > 0) {
    lineGhosts.forEach((g) => {
      const p = w2s(g.x, g.y);
      const gw = Math.max(2, g.w * ppi), gh = Math.max(2, g.h * ppi);
      ctx.save();
      ctx.translate(p.x + gw / 2, p.y + gh / 2);
      if (g.rotationDeg) ctx.rotate((g.rotationDeg * Math.PI) / 180);
      ctx.setLineDash([5, 4]);
      ctx.fillStyle = g.valid ? "rgba(74,222,128,0.16)" : "rgba(239,68,68,0.12)";
      roundRect(ctx, -gw / 2, -gh / 2, gw, gh, 3);
      ctx.fill();
      ctx.strokeStyle = g.valid ? "#4ADE80" : "#ef4444";
      ctx.lineWidth = 1.5;
      roundRect(ctx, -gw / 2, -gh / 2, gw, gh, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
    // Live count badge (valid ghosts) beside the last ghost — upright text.
    const validCount = lineGhosts.filter((g) => g.valid).length;
    const last = lineGhosts[lineGhosts.length - 1];
    const lp = w2s(last.x + last.w / 2, last.y + last.h / 2);
    ctx.save();
    if (roomAngleRad) {
      ctx.translate(lp.x, lp.y);
      ctx.rotate(-roomAngleRad);
      ctx.translate(-lp.x, -lp.y);
    }
    const cLabel = `×${validCount}`;
    ctx.font = "700 12px Inter, sans-serif";
    const ctw = ctx.measureText(cLabel).width + 14;
    ctx.fillStyle = "rgba(30,33,40,0.92)";
    roundRect(ctx, lp.x + 16, lp.y - 26, ctw, 20, 10);
    ctx.fill();
    ctx.strokeStyle = "#4ADE80";
    ctx.lineWidth = 1;
    roundRect(ctx, lp.x + 16, lp.y - 26, ctw, 20, 10);
    ctx.stroke();
    ctx.fillStyle = "#4ADE80";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cLabel, lp.x + 16 + ctw / 2, lp.y - 16);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Room border — dashed outline (rotates with the room via the active transform).
  // During a rotate spin it gets a soft green highlight glow, then settles.
  if (rotateFlash) {
    ctx.save();
    ctx.shadowColor = "rgba(22,163,74,0.55)";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 4;
    traceRoomOutline(ctx, activeRoom, o.x, o.y, roomW, roomH, ppi);
    ctx.stroke();
    ctx.restore();
  }
  // Active room = selected. Solid GREEN selection border; turns RED if this room
  // overlaps another room on the facility floor. (rotateFlash still adds its glow above.)
  const selColor = roomOverlap ? "#ef4444" : "#16a34a";
  ctx.save();
  ctx.shadowColor = roomOverlap ? "rgba(239,68,68,0.45)" : "rgba(22,163,74,0.40)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = selColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([]); // solid = selected
  // Merged/odd-shaped rooms draw their polygon outline — one continuous wall
  // with NO line where the removed shared wall used to be.
  traceRoomOutline(ctx, activeRoom, o.x, o.y, roomW, roomH, ppi);
  ctx.stroke();
  ctx.restore();

  if (showDimensions) {
    if (Array.isArray(activeRoom?.polygon) && activeRoom.polygon.length >= 3) {
      // Merged / odd-shaped room: one dimension per outside wall, not the bounding box.
      drawPolygonDimensions(ctx, activeRoom.polygon, o, ppi, roomAngleRad, roomOverlap);
    } else {
      drawDimensions(ctx, doc, w2s, roomW, roomH, o, ppi, roomAngleRad, roomOverlap);
    }
    drawAisleLabels(ctx, doc, w2s, roomW, roomH, o, ppi, roomAngleRad, activeRoom?.polygon);
  }

  // The room name is intentionally NOT drawn on the active (selected) room — it
  // shows only on inactive rooms (via drawRoomRect). Selected rooms are identified
  // by their green selection outline instead.

  // Pairs with the ctx.save() above — the move handle below stays upright.
  ctx.restore();

  // ── Room resize handles ── drawn in SCREEN space at the room's ROTATED
  // footprint corners (matching the rotation-aware hit-test in usePlanInteraction),
  // so the visible handle a user grabs always lines up with what actually resizes.
  // HIDDEN while 2D Move mode is ON — then the whole room drags from anywhere, so
  // corner grab UI would only conflict with the "drag the room" behavior. Instead
  // we show a subtle dashed green outline that communicates "grab anywhere".
  {
    const fr = activeRoom ? roomFloorRect(activeRoom) : { x: ox, y: oy, w: doc.room.widthIn, h: doc.room.lengthIn };
    const tl = f2s(fr.x, fr.y);
    const hasPolygon = Array.isArray(activeRoom?.polygon) && activeRoom.polygon.length >= 3;
    if (roomMoveMode2D) {
      ctx.save();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      traceRoomOutline(ctx, activeRoom, tl.x, tl.y, fr.w * ppi, fr.h * ppi, ppi);
      ctx.stroke();
      ctx.restore();
    } else if (!hasPolygon) {
      // Polygon rooms hide the corner-resize handles — the outline IS the shape.
      drawRoomResizeHandles(ctx, tl, fr.w * ppi, fr.h * ppi, hoveredHandle);
    }
  }

  // Active room Front/Back + Tier orientation hints — drawn in screen space
  // (outside the room transform) using the room center + live angle, so the text
  // stays upright while its position rotates with the room. These show ONLY on the
  // selected (active) room.
  drawFrontBackLabels(ctx, roomCenter, roomW / 2, roomH / 2, roomAngleRad);
  {
    const activeTiers = Math.max(1, Math.round(doc.benches?.[0]?.tiers || 1));
    drawTierLabel(ctx, roomCenter, roomW / 2, roomH / 2, activeTiers, roomAngleRad);
  }

}

// ── Inactive-room benches ── Draw a room's benches inside its own footprint so
// the outline always wraps its contents. Uses the SAME offset + dims the room's
// outline is drawn from (single source of truth). Rooms are axis-aligned (upright)
// only. Read-only, simple filled rectangles — no selection/handles/labels.
function drawInactiveRoomBenches(ctx, room, f2s, ppi) {
  const benches = room.benches || [];
  if (benches.length === 0) return;
  const off = room.offset || { x: 0, y: 0 };
  const ox = off.x || 0, oy = off.y || 0;
  const w2s = (x, y) => f2s(x + ox, y + oy);

  ctx.save();
  // Rotate the benches around the room's center by its rotationDeg, so a rotated
  // inactive room's benches turn with its footprint (matching the active room + 3D).
  const deg = ((Math.round((room.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360;
  if (deg) {
    const o0 = w2s(0, 0);
    const cx = o0.x + (room.room?.widthIn || 0) * ppi / 2;
    const cy = o0.y + (room.room?.lengthIn || 0) * ppi / 2;
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  const GAP = 0.6;
  benches.forEach((b) => {
    const r = benchRect(b);
    const p = w2s(r.x + GAP, r.y + GAP);
    const bw = Math.max(2, (r.w - GAP * 2) * ppi), bh = Math.max(2, (r.h - GAP * 2) * ppi);

    // Simple flat fill + border — read-only footprint preview, no gradient,
    // module dividers, or size labels.
    ctx.fillStyle = C.benchFill;
    roundRect(ctx, p.x, p.y, bw, bh, 2);
    ctx.fill();
    ctx.strokeStyle = C.benchBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, p.x, p.y, bw, bh, 2);
    ctx.stroke();
  });
  ctx.restore();
}

// ── Selection handles (rotation only — benches are not freely resizable) ──
function drawSelectionHandles(ctx, rect, w2s, ppi, hoveredHandle) {
  const hs = 7;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;

  // Rotation handle — circle + line connecting to centre
  const rotY = rect.y - 24 / ppi;
  const rp = w2s(cx, rotY);
  const cp = w2s(cx, cy);

  ctx.strokeStyle = C.handleStroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cp.x, cp.y);
  ctx.lineTo(rp.x, rp.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const isRotHovered = hoveredHandle === "rotate";
  ctx.fillStyle = isRotHovered ? C.handleRotateFill : C.handleFill;
  ctx.strokeStyle = C.handleStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, hs / 2 + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rotation icon (small arc arrows)
  ctx.strokeStyle = isRotHovered ? "#fff" : C.handleRotateFill;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, 4, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();
  // arrowhead
  const ax = rp.x + 4 * Math.cos(Math.PI * 0.4), ay = rp.y + 4 * Math.sin(Math.PI * 0.4);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - 3, ay - 2);
  ctx.lineTo(ax - 2, ay - 3.5);
  ctx.closePath();
  ctx.fillStyle = isRotHovered ? "#fff" : C.handleRotateFill;
  ctx.fill();
}

// ── Room resize handles — all four corners + all four edge midpoints ──
function drawRoomResizeHandles(ctx, o, roomW, roomH, hoveredHandle) {
  const hs = 8;
  const handles = [
    // Corners (slightly larger so they read as the primary grab targets)
    { x: o.x, y: o.y, id: "room-nw", corner: true },
    { x: o.x + roomW, y: o.y, id: "room-ne", corner: true },
    { x: o.x, y: o.y + roomH, id: "room-sw", corner: true },
    { x: o.x + roomW, y: o.y + roomH, id: "room-se", corner: true },
    // Edge midpoints
    { x: o.x + roomW / 2, y: o.y, id: "room-n" },
    { x: o.x + roomW / 2, y: o.y + roomH, id: "room-s" },
    { x: o.x, y: o.y + roomH / 2, id: "room-w" },
    { x: o.x + roomW, y: o.y + roomH / 2, id: "room-e" },
  ];
  handles.forEach(({ x, y, id, corner }) => {
    const active = hoveredHandle === id;
    const sz = corner ? hs + 2 : hs;
    ctx.fillStyle = active ? "#16a34a" : "#ffffff";
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - sz / 2, y - sz / 2, sz, sz, corner ? 2 : 1.5);
    ctx.fill();
    ctx.stroke();
  });
}

// ── Ruler (aligned to room origin, not absolute screen pixels) ──
function drawRuler(ctx, W, H, viewport, doc) {
  const { pixelsPerInch: ppi, panX, panY } = viewport;
  const ft = ppi * 12;
  if (ft < 8) return;

  // Left ruler — foot marks anchored to room Y=0
  ctx.fillStyle = C.rulerBg;
  ctx.fillRect(0, 0, 22, H);
  ctx.fillStyle = C.rulerTick;
  ctx.font = "500 8px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const firstTickY = panY + Math.ceil((22 - panY) / ft) * ft;
  let y = firstTickY;
  let val = Math.round((firstTickY - panY) / ft);
  while (y < H) {
    ctx.fillText(`${val}'`, 18, y);
    ctx.strokeStyle = C.rulerTick;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(16, y); ctx.lineTo(22, y);
    ctx.stroke();
    y += ft;
    val++;
  }

  // Top ruler — foot marks anchored to room X=0
  ctx.fillStyle = C.rulerBg;
  ctx.fillRect(0, 0, W, 22);
  const firstTickX = panX + Math.ceil((22 - panX) / ft) * ft;
  let x = firstTickX;
  val = Math.round((firstTickX - panX) / ft);
  ctx.textAlign = "center";
  while (x < W) {
    if (x > 22) {
      ctx.fillText(`${val}'`, x, 14);
      ctx.strokeStyle = C.rulerTick;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 16); ctx.lineTo(x, 22);
      ctx.stroke();
    }
    x += ft;
    val++;
  }
}

// ── Grid ──
function drawGrid(ctx, W, H, vp) {
  const { pixelsPerInch: ppi, panX, panY } = vp;
  const minorPx = 12 * ppi, majorPx = 48 * ppi;
  if (minorPx < 4) return;

  const startX = panX % minorPx, startY = panY % minorPx;
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = C.gridMinor;
  ctx.beginPath();
  for (let x = startX; x < W; x += minorPx) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = startY; y < H; y += minorPx) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  if (majorPx >= 6) {
    const mStartX = panX % majorPx, mStartY = panY % majorPx;
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.gridMajor;
    ctx.beginPath();
    for (let x = mStartX; x < W; x += majorPx) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = mStartY; y < H; y += majorPx) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
}

// ── Active room name + sq-ft label ── Pinned to the room's top-left corner
//     INSIDE the footprint. ox/oy is room-local (0,0) in screen px; we're already
//     inside the room's rotated transform, so the box is drawn in that LOCAL frame
//     (growing along the room's own edges → always inside the walls at any angle).
//     Only the TEXT counter-rotates (ca) around the box center so it reads upright.
function drawActiveRoomLabel(ctx, doc, ox, oy, ca = 0) {
  const name = doc.rooms?.find((r) => r.id === doc.activeRoomId)?.name || doc.name || "Room";
  const wIn = doc.room?.widthIn || 0, lIn = doc.room?.lengthIn || 0;
  const sq = `${Math.round((wIn * lIn) / 144).toLocaleString()} ft²`;
  ctx.save();
  ctx.font = "600 11px Inter, sans-serif";
  const nameW = ctx.measureText(name).width;
  ctx.font = "500 9px Inter, sans-serif";
  const sqW = ctx.measureText(sq).width;
  const boxW = Math.max(nameW, sqW) + 16;
  const boxH = 30;
  const lx = ox + 5, ly = oy + 5;

  // Box in the room's LOCAL frame — stays glued to the rotated top-left corner.
  ctx.fillStyle = "rgba(30,33,40,0.88)";
  roundRect(ctx, lx, ly, boxW, boxH, 4);
  ctx.fill();

  // Text counter-rotates around the box center so it stays horizontal/readable.
  const bcx = lx + boxW / 2, bcy = ly + boxH / 2;
  if (ca) {
    ctx.translate(bcx, bcy);
    ctx.rotate(-ca);
    ctx.translate(-bcx, -bcy);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#16a34a";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.fillText(name, bcx, bcy - 2);
  ctx.fillStyle = "#9CA3AF";
  ctx.font = "500 9px Inter, sans-serif";
  ctx.fillText(sq, bcx, bcy + 10);
  ctx.textAlign = "left";
  ctx.restore();
}

// ── Room dimensions (W × L) ── `ca` = counter-angle to keep labels upright.
// `overlap` turns the W×L pill labels bright red when the room collides with
// another room on the facility floor.
function drawDimensions(ctx, doc, w2s, roomW, roomH, o, ppi, ca = 0, overlap = false) {
  const topY = o.y - 20;
  const arrowCol = overlap ? "#ef4444" : C.dimArrow;
  arrowLine(ctx, o.x, topY, o.x + roomW, topY, arrowCol);
  drawPillLabel(ctx, o.x + roomW / 2, topY - 10, fmtFt(doc.room.widthIn), ca, overlap);

  const leftX = o.x - 24;
  arrowLine(ctx, leftX, o.y, leftX, o.y + roomH, arrowCol);
  ctx.save();
  ctx.translate(leftX - 10, o.y + roomH / 2);
  ctx.rotate(-Math.PI / 2);
  // The label is already rotated -90° here (its vertical design); counter the
  // room's own rotation so it doesn't additionally tumble with the spin.
  drawPillLabel(ctx, 0, 0, fmtFt(doc.room.lengthIn), ca, overlap);
  ctx.restore();
}

// ── Merged-room dimensions: an arrow + length pill alongside EVERY outside wall
// of the polygon, offset outward, so an L-shaped room shows each wall's length.
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function drawPolygonDimensions(ctx, poly, o, ppi, ca = 0, overlap = false) {
  const arrowCol = overlap ? "#ef4444" : C.dimArrow;
  const OFF = 22; // px outside the wall
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const lenIn = Math.hypot(b.x - a.x, b.y - a.y);
    if (lenIn < 12) continue;
    const dx = (b.x - a.x) / lenIn, dy = (b.y - a.y) / lenIn;
    // Outward normal: whichever side of the edge's midpoint is outside the room.
    let nx = dy, ny = -dx;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (pointInPoly(mx + nx * 2, my + ny * 2, poly)) { nx = -nx; ny = -ny; }
    const x1 = o.x + a.x * ppi + nx * OFF, y1 = o.y + a.y * ppi + ny * OFF;
    const x2 = o.x + b.x * ppi + nx * OFF, y2 = o.y + b.y * ppi + ny * OFF;
    arrowLine(ctx, x1, y1, x2, y2, arrowCol);
    const lx = (x1 + x2) / 2 + nx * 12, ly = (y1 + y2) / 2 + ny * 12;
    if (Math.abs(dx) >= Math.abs(dy)) {
      drawPillLabel(ctx, lx, ly, fmtFt(lenIn), ca, overlap);
    } else {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(-Math.PI / 2);
      drawPillLabel(ctx, 0, 0, fmtFt(lenIn), ca, overlap);
      ctx.restore();
    }
  }
}

// ── Aisle dimension labels — all placed OUTSIDE the room boundary ──
function drawAisleLabels(ctx, doc, w2s, roomW, roomH, o, ppi, ca = 0, polygon = null) {
  const benches = doc.benches || [];
  const s = doc.settings || {};
  const roomL = doc.room.lengthIn;
  const roomW_ = doc.room.widthIn;
  if (benches.length === 0) return;

  const dimColor = "#5B6270";

  // Group benches into rows (same y-bucket, ±7" tolerance)
  const rows = [];
  const sorted = [...benches].sort((a, b) => a.pos.y - b.pos.y);
  for (const b of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(b.pos.y - last.y) < 14) {
      last.benches.push(b);
    } else {
      rows.push({ y: b.pos.y, benches: [b] });
    }
  }

  // Compute row extents
  const rowData = rows.map((r) => {
    let minX = Infinity, maxX = -Infinity, maxH = 0;
    r.benches.forEach((b) => {
      const rect = benchRect(b);
      minX = Math.min(minX, rect.x);
      maxX = Math.max(maxX, rect.x + rect.w);
      maxH = Math.max(maxH, rect.h);
    });
    return { y: r.y, h: maxH, left: minX, right: maxX };
  });

  const leftBankRows = rowData.filter((r) => r.left < roomW_ / 2);
  const rightBankRows = rowData.filter((r) => r.right > roomW_ / 2);

  const refX = o.x + roomW;

  // ── Front aisle (room top → first bench row) — dimension line right of room ──
  if (rows.length > 0) {
    const firstY = rows[0].y;
    if (firstY > 1) {
      if (Array.isArray(polygon) && polygon.length >= 3) {
        // Merged room: the box's right edge may be a cut-out corner, so draw the
        // front aisle INSIDE the room, in the gap between the front wall and the
        // first row, just inside that row's right end.
        const x = o.x + Math.max(rowData[0].left, rowData[0].right - 24) * ppi;
        drawDimV(ctx, x, o.y, w2s(0, firstY).y, fmtFt(firstY), dimColor, x, ca);
      } else {
        const xLine = refX + 36;
        drawDimV(ctx, xLine, o.y, w2s(0, firstY).y, fmtFt(firstY), dimColor, refX, ca);
      }
    }
  }

  // ── Back aisle (last bench bottom → room bottom) ──
  {
    const last = rowData[rowData.length - 1];
    const bottomY = last.y + last.h;
    const gap = roomL - bottomY;
    if (gap > 1) {
      const xLine = refX + 36;
      drawDimV(ctx, xLine, w2s(0, bottomY).y, o.y + roomH, fmtFt(gap), dimColor, refX, ca);
    }
  }

  // ── Center aisle — label placed INSIDE the center-aisle gap ──
  // Centered within the vertical gap running between the two bench columns,
  // at the aisle's mid-point (so it annotates the aisle, not the room edge).
  // Stays upright (ca counter-rotation) and tracks the aisle on move/rotate.
  const centerIn = s.centerIn || 0;
  if (centerIn > 0) {
    const aisle = mainAisleBounds(benches, roomW_, centerIn);
    const cx = (aisle.left + aisle.right) / 2;
    // Place the label in the center-aisle gap near the FRONT (top) of the banks,
    // so it annotates the aisle without colliding with the centered "Single Tier"
    // tier label that sits at the room's exact center. Tracks the aisle, stays
    // upright via `ca`, and moves/rotates with the room.
    let labelY = roomL / 2;
    if (rowData.length > 0) {
      const top = rowData[0].y;
      const bottom = rowData[rowData.length - 1].y + rowData[rowData.length - 1].h;
      // A third of the way down the banks — clearly inside the aisle, clear of center.
      labelY = top + (bottom - top) * 0.28;
    }
    const p = w2s(cx, labelY);
    // Rotate the label 90° clockwise so it reads down the vertical center aisle.
    // Counter the room's own angle (ca) so it stays consistent on room rotation.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 2);
    drawPillLabel(ctx, 0, 0, `${fmtFt(centerIn)} center`, ca);
    ctx.restore();
  }

  // ── Left wall clearance ──
  if (leftBankRows.length > 0) {
    const minLeft = Math.min(...leftBankRows.map((r) => r.left));
    if (minLeft > 1) {
      const yLine = o.y + roomH + 56;
      drawDimH(ctx, o.x, w2s(minLeft, 0).x, yLine, `${fmtFt(minLeft)} left wall`, dimColor, ca);
    }
  }

  // ── Right wall clearance ──
  if (rightBankRows.length > 0) {
    const maxRight = Math.max(...rightBankRows.map((r) => r.right));
    const gap = roomW_ - maxRight;
    if (gap > 1) {
      const yLine = o.y + roomH + 56;
      drawDimH(ctx, w2s(maxRight, 0).x, o.x + roomW, yLine, `${fmtFt(gap)} right wall`, dimColor, ca);
    }
  }

}

// ── Dimension-line helpers ──

// Vertical dimension line (measures Y span at a fixed X, label to the left).
// refX: where the extension lines originate (e.g. room right edge).
function drawDimV(ctx, x, y0, y1, text, color, refX, ca = 0) {
  const tickX = x - 18;
  const extX = refX != null ? refX : x;
  // Extension lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(extX, y0); ctx.lineTo(tickX, y0);
  ctx.moveTo(extX, y1); ctx.lineTo(tickX, y1);
  ctx.stroke();
  ctx.setLineDash([]);

  // Main dimension line
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(tickX, y0); ctx.lineTo(tickX, y1);
  ctx.stroke();

  // End ticks
  drawTick(ctx, tickX, y0, 5, false);
  drawTick(ctx, tickX, y1, 5, false);

  // Rotated pill label along the dimension line
  const midY = (y0 + y1) / 2;
  ctx.save();
  ctx.translate(tickX - 5, midY);
  ctx.rotate(-Math.PI / 2);
  drawPillLabel(ctx, 0, 0, text, ca);
  ctx.restore();
}

// Horizontal dimension line (measures X span at a fixed Y, label above)
function drawDimH(ctx, x0, x1, y, text, color, ca = 0) {
  const tickY = y - 16;
  // Extension lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y); ctx.lineTo(x0, tickY);
  ctx.moveTo(x1, y); ctx.lineTo(x1, tickY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Main dimension line
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(x0, tickY); ctx.lineTo(x1, tickY);
  ctx.stroke();

  // End ticks
  drawTick(ctx, x0, tickY, 5, true);
  drawTick(ctx, x1, tickY, 5, true);

  // Pill label centered above
  drawPillLabel(ctx, (x0 + x1) / 2, tickY - 8, text, ca);
}

function drawTick(ctx, x, y, len, horizontal) {
  ctx.strokeStyle = "#5B6270";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x, y - len / 2); ctx.lineTo(x, y + len / 2);
  } else {
    ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y);
  }
  ctx.stroke();
}

function drawPillLabel(ctx, x, y, text, counterAngle = 0, overlap = false) {
  // Counter-rotate about the anchor so the pill stays upright while the room spins.
  if (counterAngle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-counterAngle);
    ctx.translate(-x, -y);
  }
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width + 16;
  ctx.fillStyle = overlap ? "rgba(239,68,68,0.18)" : C.dimPillBg;
  roundRect(ctx, x - tw / 2, y - 9, tw, 18, 9);
  ctx.fill();
  ctx.strokeStyle = overlap ? "#ef4444" : C.dimPillBorder;
  ctx.lineWidth = overlap ? 1.25 : 0.75;
  roundRect(ctx, x - tw / 2, y - 9, tw, 18, 9);
  ctx.stroke();
  ctx.fillStyle = overlap ? "#ef4444" : C.dimLabel;
  ctx.fillText(text, x, y + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (counterAngle) ctx.restore();
}

function arrowLine(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  arrowHead(ctx, x1, y1, a + Math.PI, color);
  arrowHead(ctx, x2, y2, a, color);
}

function arrowHead(ctx, x, y, a, color) {
  const s = 5; ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - s * Math.cos(a - 0.4), y - s * Math.sin(a - 0.4));
  ctx.lineTo(x - s * Math.cos(a + 0.4), y - s * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
}

// ── Stats panel ──
function utilizationColor(pct) {
  if (pct < 60) return "#ef4444";   // 🔴
  if (pct < 75) return "#f59e0b";   // 🟡
  if (pct < 85) return "#16a34a";   // 🟢
  return "#fbbf24";                  // 🥇
}

function drawStatsBox(ctx, W, doc) {
  const benches = doc.benches || [];
  let plantingSqIn = 0;
  let footprintSqIn = 0;
  let lightsCount = 0;
  benches.forEach((b) => {
    plantingSqIn += b.lengthIn * b.widthIn * Math.max(1, b.tiers || 1);
    footprintSqIn += b.lengthIn * b.widthIn; // floor footprint only, no tier multiplier
    lightsCount += Math.max(1, b.modules || Math.round(b.lengthIn / 48));
  });
  const planting = Math.round(plantingSqIn / 144);

  // Utilization = placed-bench floor footprint ÷ room floor area, rounded to whole %.
  const roomSqIn = doc.room.widthIn * doc.room.lengthIn;
  const utilPct = roomSqIn > 0 ? Math.round((footprintSqIn / roomSqIn) * 100) : 0;
  const utilCol = utilizationColor(utilPct);

  const items = [
    { label: "BENCHES", value: `${benches.length}` },
    { label: "LIGHTS", value: `${lightsCount}` },
    { label: "CANOPY", value: `${planting.toLocaleString()} ft²` },
    { label: "ROOM", value: `${Math.round(doc.room.widthIn / 12)}×${Math.round(doc.room.lengthIn / 12)} ft` },
    { label: "ROOM USE", value: `${utilPct}%`, color: utilCol, dot: utilCol },
  ];

  // Responsive sizing — shrink on narrow canvases so the strip never overflows.
  const narrow = W < 480;
  const cardW = narrow ? 56 : 64, cardH = narrow ? 34 : 40, gap = narrow ? 4 : 6, padX = narrow ? 10 : 14, padY = narrow ? 8 : 10;
  // Anchor from the left edge so the strip never slides under the right controls panel.
  const x = 12, y = 10;

  // Wrap cards onto multiple rows when they won't fit the available canvas width.
  // Available width = canvas width minus the left anchor and a right safety margin.
  // On narrow (mobile) canvases reserve extra room on the right so the strip never
  // runs under the floating "Controls" button.
  const rightReserve = narrow ? 108 : 12;
  const avail = W - x - rightReserve;
  const maxPerRow = Math.max(1, Math.floor((avail - padX * 2 + gap) / (cardW + gap)));
  const perRow = Math.min(items.length, maxPerRow);
  const rows = Math.ceil(items.length / perRow);

  const totalW = perRow * cardW + (perRow - 1) * gap + padX * 2;
  const totalH = rows * cardH + (rows - 1) * gap + padY * 2;

  ctx.fillStyle = C.statCardBg;
  roundRect(ctx, x, y, totalW, totalH, 6);
  ctx.fill();
  ctx.strokeStyle = C.statCardBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, totalW, totalH, 6);
  ctx.stroke();

  const labelFont = narrow ? "500 7px Inter, sans-serif" : "500 8px Inter, sans-serif";
  const valueFont = narrow ? "600 11px Inter, sans-serif" : "600 13px Inter, sans-serif";

  items.forEach((item, i) => {
    const col = i % perRow, row = Math.floor(i / perRow);
    const cx = x + padX + col * (cardW + gap), cy = y + padY + row * (cardH + gap);
    // Color-coded card tint for the utilization hook
    if (item.dot) {
      ctx.fillStyle = item.dot + "1F";
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
    }
    roundRect(ctx, cx, cy, cardW, cardH, 4);
    ctx.fill();
    if (item.dot) {
      ctx.strokeStyle = item.dot;
      ctx.lineWidth = 1;
      roundRect(ctx, cx, cy, cardW, cardH, 4);
      ctx.stroke();
    }
    ctx.fillStyle = C.statLabel;
    ctx.font = labelFont;
    ctx.textAlign = "left";
    ctx.fillText(item.label, cx + (narrow ? 4 : 6), cy + (narrow ? 10 : 13));
    // Colored status dot before the value
    if (item.dot) {
      ctx.fillStyle = item.dot;
      ctx.beginPath();
      ctx.arc(cx + (narrow ? 7 : 9), cy + (narrow ? 23 : 29), narrow ? 2.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = item.color || C.statValue;
    ctx.font = valueFont;
    ctx.fillText(item.value, cx + (item.dot ? (narrow ? 13 : 16) : (narrow ? 4 : 6)), cy + (narrow ? 26 : 33));
  });
  ctx.textAlign = "left";
}

function fmtFt(inches) {
  // Round to whole inches FIRST so 335.9" reads 28', never 27' 12".
  const total = Math.round(inches);
  const ft = Math.floor(total / 12);
  const rem = total - ft * 12;
  return rem ? `${ft}' ${rem}"` : `${ft}'`;
}