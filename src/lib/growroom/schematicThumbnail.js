// Auto-generated 2D schematic thumbnail — a pixel-faithful miniature of the
// 2D editor view (PlanCanvas), rendered to an offscreen canvas and exported as a
// base64 PNG. Saved to the project's `thumbnail_svg` field on every layout save so
// the dashboard card shows the user's EXACT layout (room, benches, aisle, door,
// ghost rooms).
//
// Visual style: premium dark SaaS product-card look — near-black background with
// a bold green radial spotlight, crisp glowing green room outlines, glossy dark
// benches with a bright green edge glow. One strong accent color, no clutter.
//
// This is display-only. It never mutates project data; it reads the same stored
// fields the editor reads and draws a scaled, fitted snapshot.

import { benchRect } from "./clearances";
import { facilityBox } from "./facility";
import { getActiveRoom } from "./rooms";

// Card render size. Kept modest so the exported image stays small — the result
// is stored in an entity field, and a multi-hundred-KB string breaks the record
// write. We export JPEG (see toDataURL below) to keep it well under the limit.
const OUT_W = 480;
const OUT_H = 300;

// Palette — premium dark SaaS look, single green accent (visual only).
const C = {
  bg: "#0A0C0B",
  gridLine: "#151B17",
  accent: "#34D399",
  accentGlow: "rgba(52, 211, 153, 0.32)",
  roomFill: "rgba(52, 211, 153, 0.07)",
  benchFill: "#121815",
  benchSheenTop: "#1E2622",
  benchEdge: "#4ADE80",
  aisle: "rgba(52, 211, 153, 0.28)",
};

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Glossy dark bench with a soft top-to-bottom sheen and a crisp glowing green
// edge (glow confined to the edge, not filling the bench).
function drawBench(ctx, x, y, w, h, ppi) {
  const r = Math.min(3, w / 3, h / 3);

  // Base fill + vertical sheen gradient.
  const sheen = ctx.createLinearGradient(x, y, x, y + h);
  sheen.addColorStop(0, C.benchSheenTop);
  sheen.addColorStop(1, C.benchFill);
  ctx.fillStyle = sheen;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Crisp thin bright edge — no heavy glow, so adjacent benches stay distinct.
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = C.benchEdge;
  ctx.lineWidth = 0.75;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

// Build a doc-shaped view from the saved project record. The editor edits the
// ACTIVE room via flat fields; for a saved project we read rooms[] (with the
// active room's geometry already mirrored in on save).
function roomsFromProject(project) {
  const rooms = Array.isArray(project?.rooms) && project.rooms.length > 0
    ? project.rooms
    : null;
  if (rooms) return { rooms, activeRoomId: project.activeRoomId || rooms[0]?.id };
  // Legacy single-room project — synthesize one room from top-level fields.
  const active = getActiveRoom(project || {});
  const synth = {
    id: "__legacy",
    name: project?.name || "Room",
    offset: { x: 0, y: 0 },
    room: active?.room,
    settings: active?.settings || {},
    benches: active?.benches || [],
    objects: active?.objects || project?.objects || [],
    rotationDeg: 0,
  };
  return { rooms: [synth], activeRoomId: "__legacy" };
}

// Render the schematic and return a base64 PNG data URL, or null if there's no
// room geometry to draw.
export function renderSchematicThumbnail(project) {
  if (typeof document === "undefined") return null;
  const { rooms, activeRoomId } = roomsFromProject(project);
  const active = rooms.find((r) => r.id === activeRoomId) || rooms[0];
  if (!active?.room?.widthIn || !active?.room?.lengthIn) return null;

  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Base near-black background.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  // ── Fit the whole facility (all rooms) into the card with padding ──
  const box = facilityBox({ rooms });
  const PAD = 44;
  const availW = OUT_W - PAD * 2;
  const availH = OUT_H - PAD * 2;
  const ppi = Math.min(availW / box.widthIn, availH / box.lengthIn);
  const drawnW = box.widthIn * ppi;
  const drawnH = box.lengthIn * ppi;
  const panX = (OUT_W - drawnW) / 2 - box.x * ppi;
  const panY = (OUT_H - drawnH) / 2 - box.y * ppi;
  const f2s = (x, y) => ({ x: x * ppi + panX, y: y * ppi + panY });
  const centerScreenX = panX + box.x * ppi + drawnW / 2;
  const centerScreenY = panY + box.y * ppi + drawnH / 2;

  // ── Faint fine grid beneath everything ──
  drawGrid(ctx, ppi, panX, panY);

  // ── Bold green radial spotlight behind the facility ──
  drawSpotlight(ctx, centerScreenX, centerScreenY);

  // ── Soft drop shadow under the whole facility footprint ──
  drawFacilityShadow(ctx, rooms, f2s, ppi);

  // ── Every room drawn identically — no active/ghost distinction ──
  rooms.forEach((rm) => drawRoom(ctx, rm, f2s, ppi));

  // ── Faint diagonal light sweep across the top for a polished product-shot feel ──
  drawLightSweep(ctx);

  try {
    // JPEG (not PNG) keeps the data URL small (~15–30KB) so it fits safely in the
    // entity field; a large PNG string can exceed the field limit and break the
    // save. The flat schematic compresses cleanly at this quality.
    return canvas.toDataURL("image/jpeg", 0.5);
  } catch {
    return null;
  }
}

function drawGrid(ctx, ppi, panX, panY) {
  const minorPx = 24 * ppi;
  if (minorPx < 6) return;
  const startX = panX % minorPx, startY = panY % minorPx;
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = C.gridLine;
  ctx.beginPath();
  for (let x = startX; x < OUT_W; x += minorPx) { ctx.moveTo(x, 0); ctx.lineTo(x, OUT_H); }
  for (let y = startY; y < OUT_H; y += minorPx) { ctx.moveTo(0, y); ctx.lineTo(OUT_W, y); }
  ctx.stroke();
}

function drawSpotlight(ctx, cx, cy) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(OUT_W, OUT_H) * 0.62);
  g.addColorStop(0, "rgba(52, 211, 153, 0.22)");
  g.addColorStop(0.55, "rgba(52, 211, 153, 0.06)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OUT_W, OUT_H);
}

function drawFacilityShadow(ctx, rooms, f2s, ppi) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = Math.max(10, ppi * 8);
  ctx.shadowOffsetY = Math.max(4, ppi * 3);
  ctx.fillStyle = "rgba(0,0,0,0.001)"; // near-invisible fill, just to cast the shadow
  rooms.forEach((rm) => {
    const off = rm.offset || { x: 0, y: 0 };
    const o = f2s(off.x || 0, off.y || 0);
    const rw = (rm.room?.widthIn || 0) * ppi;
    const rh = (rm.room?.lengthIn || 0) * ppi;
    if (!rw || !rh) return;
    ctx.fillRect(o.x, o.y, rw, rh);
  });
  ctx.restore();
}

function drawLightSweep(ctx) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, OUT_W * 0.7, OUT_H * 0.35);
  g.addColorStop(0, "rgba(255,255,255,0.05)");
  g.addColorStop(0.4, "rgba(255,255,255,0.015)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OUT_W, OUT_H * 0.5);
  ctx.restore();
}

// Every room renders the SAME bold way: crisp glowing green border, light green
// interior tint, glossy benches. No selected/ghost/active distinction.
function drawRoom(ctx, rm, f2s, ppi) {
  const off = rm.offset || { x: 0, y: 0 };
  const ox = off.x || 0, oy = off.y || 0;
  const w2s = (x, y) => f2s(x + ox, y + oy);
  const o = w2s(0, 0);
  const rw = (rm.room?.widthIn || 0) * ppi;
  const rh = (rm.room?.lengthIn || 0) * ppi;
  const center = { x: o.x + rw / 2, y: o.y + rh / 2 };
  const angle = ((rm.rotationDeg || 0) * Math.PI) / 180;

  ctx.save();
  if (angle) {
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.translate(-center.x, -center.y);
  }

  // Light green interior tint.
  ctx.fillStyle = C.roomFill;
  ctx.fillRect(o.x, o.y, rw, rh);

  // Center aisle (soft green line).
  const centerIn = rm.settings?.centerIn || 0;
  if (centerIn > 0) {
    const cx = (rm.room?.widthIn || 0) / 2;
    const aL = w2s(cx - centerIn / 2, 0);
    const aR = w2s(cx + centerIn / 2, 0);
    ctx.strokeStyle = C.aisle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(aL.x, o.y); ctx.lineTo(aL.x, o.y + rh);
    ctx.moveTo(aR.x, o.y); ctx.lineTo(aR.x, o.y + rh);
    ctx.stroke();
  }

  // Benches — glossy dark with glowing green edge, identical style regardless
  // of tier/type.
  const GAP = 0.6;
  (rm.benches || []).forEach((b) => {
    const r = benchRect(b);
    const p = w2s(r.x + GAP, r.y + GAP);
    const bw = Math.max(2, (r.w - GAP * 2) * ppi);
    const bh = Math.max(2, (r.h - GAP * 2) * ppi);
    drawBench(ctx, p.x, p.y, bw, bh, ppi);
  });

  // Crisp bright green border with a subtle glow. Drawn INSET by half its width
  // so it never bleeds outside the room's footprint — flush/nearby rooms keep a
  // visible seam instead of merging into one blob.
  ctx.save();
  ctx.shadowColor = C.accentGlow;
  ctx.shadowBlur = 3;
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(o.x + 1, o.y + 1, rw - 2, rh - 2);
  ctx.restore();

  ctx.restore();
}