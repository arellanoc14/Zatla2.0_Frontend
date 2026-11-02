// Draws the facility floor + every room rectangle for the 2D multi-room view.
// Pure canvas helpers; no state. The active room's full bench layout is drawn
// by PlanCanvas itself (translated by the active room's offset); this module
// draws the facility boundary and the OTHER rooms as labeled rectangles, plus
// the active room's highlight outline.

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w, y + h - r, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const FC = {
  floorFill: "rgba(255,255,255,0.015)",
  floorBorder: "#3D434D",
  roomFill: "rgba(75,85,99,0.10)",
  roomBorder: "#4B5563",
  roomLabel: "#9CA3AF",
  activeBorder: "#16a34a",
  activeGlow: "rgba(22,163,74,0.10)",
  labelBg: "rgba(30,33,40,0.88)",
  headerBg: "#16a34a",
  headerText: "#ffffff",
};

// Size (screen px) of the active room's compact move-handle button (square).
export const ROOM_HEADER_H = 20;
export const ROOM_HEADER_W = 20;

function fmtSqFt(widthIn, lengthIn) {
  return `${Math.round((widthIn * lengthIn) / 144).toLocaleString()} ft²`;
}

// Trace a room's outline path: its polygon (merged / odd-shaped rooms, points
// in room-local inches) when present, otherwise the plain rectangle. Caller
// fills/strokes the path.
export function traceRoomOutline(ctx, room, px, py, rw, rh, ppi) {
  const poly = room?.polygon;
  if (Array.isArray(poly) && poly.length >= 3) {
    ctx.beginPath();
    poly.forEach((pt, i) => {
      const sx = px + pt.x * ppi;
      const sy = py + pt.y * ppi;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    return;
  }
  roundRect(ctx, px, py, rw, rh, 2);
}

// Shoelace area of a room-local polygon (inches²).
function polyAreaIn(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// Draw the facility floor boundary. `facility` may carry an origin (x,y) — the
// floor's top-left corner in room-offset space — so it can grow up/left as well
// as down/right. Falls back to origin 0,0 for the legacy size-only shape.
export function drawFacilityFloor(ctx, facility, w2s, ppi) {
  const o = w2s(facility.x || 0, facility.y || 0);
  const fw = facility.widthIn * ppi;
  const fh = facility.lengthIn * ppi;
  ctx.fillStyle = FC.floorFill;
  ctx.fillRect(o.x, o.y, fw, fh);
  ctx.strokeStyle = FC.floorBorder;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 4]);
  ctx.strokeRect(o.x, o.y, fw, fh);
  ctx.setLineDash([]);
}

// Normalized room rotation in radians (0 | 90 | 180 | 270 degrees).
function roomAngleRad(room) {
  const deg = ((Math.round((room?.rotationDeg || 0) / 90) * 90) % 360 + 360) % 360;
  return (deg * Math.PI) / 180;
}

// Draw a single room rectangle (used for INACTIVE rooms — the active room's
// interior is rendered by the main bench pipeline). The room rotates around its
// own center by room.rotationDeg, so a rotated inactive room's shadow outline +
// label reflect its true on-floor direction (matching the active room + 3D).
export function drawRoomRect(ctx, room, w2s, ppi, { active = false, outline = true, label = true } = {}) {
  const off = room.offset || { x: 0, y: 0 };
  const p = w2s(off.x || 0, off.y || 0);
  const rw = (room.room?.widthIn || 0) * ppi;
  const rh = (room.room?.lengthIn || 0) * ppi;
  const ang = roomAngleRad(room);

  // Rotate the whole room drawing around its center; the label below counter-
  // rotates so its text stays upright.
  ctx.save();
  if (ang) {
    const cx = p.x + rw / 2, cy = p.y + rh / 2;
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.translate(-cx, -cy);
  }

  if (outline) {
    if (!active) {
      ctx.fillStyle = FC.roomFill;
      traceRoomOutline(ctx, room, p.x, p.y, rw, rh, ppi);
      ctx.fill();
    }

    ctx.strokeStyle = active ? FC.activeBorder : FC.roomBorder;
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.setLineDash(active ? [] : [6, 4]);
    traceRoomOutline(ctx, room, p.x, p.y, rw, rh, ppi);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!label) { ctx.restore(); return; }

  // Label: name + sq ft, pinned to the room's top-left inside the rectangle. It
  // rotates POSITION with the room (it's inside the rotated transform) but counter-
  // rotates its own text so it stays upright and readable at any room angle.
  const name = room.name || "Room";
  // Merged/odd-shaped rooms: sq-ft from the real polygon area (not the bbox),
  // and the label anchored at the polygon's topmost vertex — the bbox's
  // top-left corner can sit OUTSIDE an L-shaped room.
  const roomPoly = Array.isArray(room.polygon) && room.polygon.length >= 3 ? room.polygon : null;
  const sq = roomPoly
    ? `${Math.round(polyAreaIn(roomPoly) / 144).toLocaleString()} ft²`
    : fmtSqFt(room.room?.widthIn || 0, room.room?.lengthIn || 0);
  ctx.font = "600 11px Inter, sans-serif";
  const nameW = ctx.measureText(name).width;
  ctx.font = "500 9px Inter, sans-serif";
  const sqW = ctx.measureText(sq).width;
  const boxW = Math.max(nameW, sqW) + 12;
  const boxH = 30;
  let lx = p.x + 5;
  let ly = p.y + 5;
  if (roomPoly) {
    const v = roomPoly.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
    lx = p.x + v.x * ppi + 5;
    ly = p.y + v.y * ppi + 5;
  }
  // Counter-rotate the label around its own top-left anchor so its text is upright.
  if (ang) {
    ctx.translate(lx, ly);
    ctx.rotate(-ang);
    ctx.translate(-lx, -ly);
  }
  ctx.fillStyle = FC.labelBg;
  roundRect(ctx, lx, ly, boxW, boxH, 4);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = active ? FC.activeBorder : "#E5E7EB";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.fillText(name, lx + 6, ly + 13);
  ctx.fillStyle = FC.roomLabel;
  ctx.font = "500 9px Inter, sans-serif";
  ctx.fillText(sq, lx + 6, ly + 25);
  ctx.restore();
}

// Draw subtle, upright "Front" / "Back" orientation shadow labels for a room.
// View-only orientation hint. The labels are anchored to the room's front (top,
// y=0 side — consistent with front clearance/aisle) and back (bottom) edge
// centers, tucked just inside the edge. They rotate POSITION with the room (the
// caller provides the room center + angle) but the TEXT stays upright by
// counter-rotating -angleRad. Muted low-opacity text with a soft glow so it
// reads as a quiet hint, never competing with the room name/dimensions.
//   center: room center in screen px · halfWpx/halfHpx: half room footprint (px)
//   angleRad: the room's rotation in radians (same value 2D uses)
export function drawFrontBackLabels(ctx, center, halfWpx, halfHpx, angleRad = 0) {
  // Skip when the room is too small on screen to read.
  if (halfWpx < 18 || halfHpx < 18) return;
  const inset = Math.min(14, halfHpx * 0.35); // tuck just inside the edge
  // Edge-center anchors in the room's UNROTATED local frame (relative to center).
  const points = [
    { label: "Front", lx: 0, ly: -halfHpx + inset },
    { label: "Back", lx: 0, ly: halfHpx - inset },
  ];

  ctx.save();
  ctx.font = "600 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  points.forEach(({ label, lx, ly }) => {
    // Rotate the anchor by the room angle so it sits on the correct edge after
    // rotation, then draw the text upright (no rotation) at that screen point.
    const rx = center.x + lx * Math.cos(angleRad) - ly * Math.sin(angleRad);
    const ry = center.y + lx * Math.sin(angleRad) + ly * Math.cos(angleRad);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = "#D1D5DB";
    ctx.fillText(label, rx, ry);
    ctx.restore();
  });
  ctx.restore();
}

// Draw a subtle, upright tier-type shadow label (e.g. "Double Tier") centered in
// the room, matching the muted shadow styling of the Front/Back labels. View-only
// orientation hint; the caller provides the room center + angle so it rotates
// POSITION with the room while the TEXT stays upright (counter-rotated).
//   center: room center in screen px · halfWpx/halfHpx: half room footprint (px)
//   tiers: 1|2|3 · angleRad: the room's rotation in radians
export function drawTierLabel(ctx, center, halfWpx, halfHpx, tiers, angleRad = 0) {
  if (halfWpx < 18 || halfHpx < 18) return;
  const lvl = Math.max(1, Math.min(3, Math.round(tiers || 1)));
  const name = lvl === 1 ? "Single Tier" : lvl === 2 ? "Double Tier" : "Triple Tier";
  ctx.save();
  ctx.font = "600 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "#D1D5DB";
  ctx.fillText(name, center.x, center.y);
  ctx.restore();
}

// Draw the ACTIVE room's move-handle header — a clear green grab bar at the room's
// top-left with grip dots + a "Move" label, so the room (benches and all) is
// obviously draggable. `dragging` shows a brighter/active state. Drawn in screen
// space; `topLeft` is the room offset already converted to screen px.
export function drawActiveRoomHeader(ctx, topLeft, roomWpx, { dragging = false } = {}) {
  const w = ROOM_HEADER_W;
  const h = ROOM_HEADER_H;
  const gap = 4;
  // Just outside the room's top-left corner.
  const x = topLeft.x - w - gap, y = topLeft.y - h - gap;

  ctx.save();
  if (dragging) {
    ctx.shadowColor = "rgba(22,163,74,0.5)";
    ctx.shadowBlur = 8;
  }
  ctx.fillStyle = dragging ? "#15803d" : FC.headerBg;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.restore();

  // 4-way move arrow icon, centered (no text).
  const cx = x + w / 2, cy = y + h / 2;
  const arm = Math.min(w, h) * 0.32;   // length of each arrow shaft
  const head = arm * 0.55;             // arrowhead size
  ctx.strokeStyle = FC.headerText;
  ctx.fillStyle = FC.headerText;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Cross shafts
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
  ctx.stroke();

  // Arrowheads (up, down, left, right)
  const tri = (tipX, tipY, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - dx * head + dy * head * 0.6, tipY - dy * head + dx * head * 0.6);
    ctx.lineTo(tipX - dx * head - dy * head * 0.6, tipY - dy * head - dx * head * 0.6);
    ctx.closePath();
    ctx.fill();
  };
  tri(cx, cy - arm, 0, 1);   // up
  tri(cx, cy + arm, 0, -1);  // down
  tri(cx - arm, cy, 1, 0);   // left
  tri(cx + arm, cy, -1, 0);  // right
}