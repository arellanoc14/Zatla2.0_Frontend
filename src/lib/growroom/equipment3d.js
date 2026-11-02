// Procedural Three.js meshes for placed smart-equipment objects.
//
// Pure geometry: given a placed object (room-local pos in inches, rotationDeg,
// mount, spec) and the room ceiling height, returns a positioned THREE.Group in
// the SAME coordinate system as benches/walls (x → x, y → z, inches). The caller
// shifts by the room's facility origin, exactly like benches. No GLBs, no model
// library — lightweight industrial MeshStandardMaterial only.

import * as THREE from "three";
import { smartObjectSize, clampObjectToRoom, doorWallLine } from "./smartObjects";
import { WALL_HEIGHT_MULT } from "./walls";
import { buildDehumidifierMesh } from "./dehumidifier3d";
import { buildDuctingHvacMesh } from "./ductingHvac3d";
import { buildCO2TankMesh } from "./co2Tank3d";

// Shared matte/industrial materials — distinct neutral tones per type family so
// equipment is readable but stays subdued. Marked _procedural so the scene's
// disposal pass leaves these shared module-level constants alive.
const mat = (color, opts = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.3, ...opts });
  m.userData._procedural = true;
  return m;
};
const MAT = {
  acWhite: mat(0xdcdedb, { roughness: 0.5, metalness: 0.15 }),  // mini-split / dehumidifier shell (off-white, not paper)
  metal: mat(0x9aa0a6),                                          // fan body, ducting
  fanDisc: mat(0x6b7177, { roughness: 0.4, metalness: 0.5 }),    // fan face
  co2: mat(0xb23b3b, { roughness: 0.45, metalness: 0.55 }),      // gas cylinder red
  frame: mat(0x6e5a44, { roughness: 0.8, metalness: 0.05 }),     // door frame
  // Mini-split detail materials — muted shell + louver, with ONE acid-chartreuse
  // accent (#c8ff00) that references grow-room LED spectra (emissive so it reads
  // as an active indicator). Visual only.
  acShell: mat(0xe0e2e0, { roughness: 0.45, metalness: 0.1 }),   // sleek off-white front fascia
  acShellGray: mat(0xd9dcdf, { roughness: 0.5, metalness: 0.12 }), // light-gray side/under body
  acVent: mat(0x2c3035, { roughness: 0.85, metalness: 0.1 }),    // recessed outlet cavity
  acLouver: mat(0xe2e5e7, { roughness: 0.6, metalness: 0.15 }),  // angled outlet louver blades
  acGrille: mat(0xdfe2e4, { roughness: 0.55, metalness: 0.12 }), // fine horizontal grille lines
  acTrim: mat(0xc6cacd, { roughness: 0.3, metalness: 0.85 }),    // metallic silver top trim
  acLogo: mat(0x23282d, { roughness: 0.6, metalness: 0.3 }),     // dark branded logo plate
  acDisplay: mat(0x161a1e, { roughness: 0.4, metalness: 0.2 }),  // digital display bezel
  acDisplayGlow: mat(0xff9d4d, { roughness: 0.3, metalness: 0.1, emissive: 0xff7a1a, emissiveIntensity: 0.8 }), // warm temp readout
  acLedGreen: mat(0x6effa3, { roughness: 0.35, metalness: 0.2, emissive: 0x36e07a, emissiveIntensity: 0.7 }),
  acLedBlue: mat(0x6ec7ff, { roughness: 0.35, metalness: 0.2, emissive: 0x2f9bff, emissiveIntensity: 0.7 }),
  acFoot: mat(0x4a4f54, { roughness: 0.7, metalness: 0.4 }),     // discreet mounting feet
};

const FT = 12; // inches per foot

// Mount height (inches, group-local Y of the object's vertical center) used to
// place the fan GLB at wall mid-height (~5.5 ft). Exported so the caller's GLB
// loader sits the model at the same height as the procedural fallback.
export const FAN_MOUNT_Y = 5.5 * 12;

// Build the 3D group for one object. roomLocal coords match benches (origin at
// the room's near corner). Returns null for unknown types.
// For "fan", returns a procedural placeholder — the caller loads GlobalModels.fanUrl
// at render time and replaces it when the GLB is available.
export function buildEquipmentMesh(obj, ceilingIn = 144, roomDims = null) {
  if (!obj) return null;
  const size = smartObjectSize(obj); // { w, h } footprint in inches
  const g = new THREE.Group();
  const rotY = (obj.rotationDeg || 0) * (Math.PI / 180);

  switch (obj.type) {
    case "minisplit": {
      // Wall-mounted split AC head (~8 ft up). VISUAL ONLY — same footprint width,
      // depth and mount height as before. Sleek modern white/light-gray body with a
      // curved front fascia, fine horizontal grille lines, bottom outlet vent with
      // angled louvers, a warm-glow digital display, indicator LEDs, a dark logo
      // plate, a metallic silver top trim, and discreet mounting feet.
      const w = size.w, d = 8, h = 12;
      const fz = d / 2; // front face Z
      const head = new THREE.Group();

      // Main body — light-gray bulk (sides / underside read in gray).
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.acShellGray);
      head.add(body);

      // Curved front fascia: a half-cylinder laid horizontally across the full
      // width gives the slightly bowed, molded white front instead of a flat box.
      const fascia = new THREE.Mesh(
        new THREE.CylinderGeometry(h * 0.52, h * 0.52, w, 24, 1, false, 0, Math.PI),
        MAT.acShell
      );
      fascia.rotation.z = Math.PI / 2;   // length runs along X (width)
      fascia.rotation.y = Math.PI;       // bulge points outward (+Z)
      fascia.position.set(0, h * 0.04, d * 0.18);
      head.add(fascia);

      // Fine horizontal grille lines across the full width of the front face.
      const grilleCount = 7;
      for (let i = 0; i < grilleCount; i++) {
        const gy = h * 0.30 - (i / (grilleCount - 1)) * (h * 0.5);
        const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.18, 0.4), MAT.acGrille);
        line.position.set(0, gy, fz + 0.05);
        head.add(line);
      }

      // Metallic silver trim along the top edge.
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, 0.8, d * 1.04), MAT.acTrim);
      trim.position.set(0, h / 2 - 0.2, 0);
      head.add(trim);

      // Bottom air outlet — recessed dark cavity with subtle angled louver blades.
      const outlet = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.26, 1.2), MAT.acVent);
      outlet.position.set(0, -h * 0.30, fz - 0.2);
      head.add(outlet);
      const bladeCount = 5;
      for (let i = 0; i < bladeCount; i++) {
        const bx = -w * 0.40 + (i / (bladeCount - 1)) * (w * 0.80);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, h * 0.20, 0.5), MAT.acLouver);
        blade.position.set(bx, -h * 0.30, fz + 0.15);
        blade.rotation.x = -0.5; // angled downward louvers
        head.add(blade);
      }

      // Dark branded logo plate on the left side of the front face.
      const logo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.12, 0.3), MAT.acLogo);
      logo.position.set(-w * 0.34, h * 0.18, fz + 0.1);
      head.add(logo);

      // Slim digital display panel on the right with a soft warm temperature glow.
      const display = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h * 0.22, 0.4), MAT.acDisplay);
      display.position.set(w * 0.34, h * 0.10, fz + 0.12);
      head.add(display);
      const readout = new THREE.Mesh(new THREE.BoxGeometry(w * 0.13, h * 0.11, 0.2), MAT.acDisplayGlow);
      readout.position.set(w * 0.34, h * 0.10, fz + 0.30);
      head.add(readout);

      // Small circular indicator lights beside the display.
      const ledG = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), MAT.acLedGreen);
      ledG.rotation.x = Math.PI / 2;
      ledG.position.set(w * 0.20, h * 0.22, fz + 0.18);
      head.add(ledG);
      const ledB = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), MAT.acLedBlue);
      ledB.rotation.x = Math.PI / 2;
      ledB.position.set(w * 0.25, h * 0.22, fz + 0.18);
      head.add(ledB);

      // Discreet mounting feet under the body.
      [-w * 0.4, w * 0.4].forEach((fx) => {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, d * 0.5), MAT.acFoot);
        foot.position.set(fx, -h / 2 - 0.6, 0);
        head.add(foot);
      });

      head.position.y = 8 * FT;
      g.add(head);
      break;
    }
    case "dehumidifier": {
      // Detailed Quest-style horizontal unit (floor-standing), built from
      // primitives. Footprint drives width/depth; the builder fixes height.
      g.add(buildDehumidifierMesh(size.w, size.h));
      break;
    }
    case "fan": {
      // Disc-faced cylinder, wall-mounted mid-height (~5.5 ft). The cylinder axis
      // points along Z (out from the wall) so its circular face reads as a fan.
      const r = Math.max(6, size.w / 2), depth = 8;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 24), MAT.metal);
      cyl.rotation.x = Math.PI / 2; // axis → Z
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 24), MAT.fanDisc);
      disc.position.z = depth / 2 + 0.2;
      cyl.add(disc);
      // Cylinder bottom at group origin (was 5.5*FT). The caller sets the group Y
      // to effectiveHeightY — the same value the HeightControl slider uses — so the
      // rendered height always matches the slider thumb.
      cyl.position.y = r;
      g.add(cyl);
      break;
    }
    case "controller": {
      // Wall-mounted environmental controller panel (~5 ft up): dark enclosure
      // with a glowing screen. Procedural placeholder — the caller swaps in the
      // GlobalModels.controllerUrl GLB when one is uploaded.
      const w = size.w, h = 20, d = size.h;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.acDisplay);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.55, 0.4), MAT.acLedGreen);
      screen.position.set(0, h * 0.08, d / 2 + 0.2);
      panel.add(screen);
      panel.position.y = 5 * FT;
      g.add(panel);
      break;
    }
    case "co2tank": {
      // Detailed compressed-gas cylinder (bottle + valve + hand-wheel + regulator
      // + gauges + solenoid LED + tubing + manifold + optional cap/bracket), built
      // from primitives. Scales by tank size; wall mode adds a mount bracket.
      g.add(buildCO2TankMesh(obj.spec || {}, obj.mount || "floor"));
      break;
    }
    case "ducting": {
      // Detailed multi-component HVAC run along the ceiling (duct + inline fan +
      // optional carbon filter + flex + exhaust cap), built from primitives.
      const dia = obj.spec?.diameterIn || size.h;
      const carbon = obj.spec?.carbonFilter !== false;
      // Display-only fit: if the run is longer than the room span it lies along, it
      // would poke through the walls. Cap the RENDERED length to the room (with a
      // small wall margin) so the duct always stays inside. The stored spec length
      // is never changed — this only affects the 3D mesh.
      let len = obj.spec?.lengthIn || size.w;
      if (roomDims?.widthIn && roomDims?.lengthIn) {
        const WALL_MARGIN = 16; // keep clear of both walls
        // The run extends along local X, then is rotated by rotationDeg about Y. At
        // 0°/180° it spans the room WIDTH; at 90°/270° it spans the room LENGTH.
        const rad = ((obj.rotationDeg || 0) * Math.PI) / 180;
        const alongWidth = Math.abs(Math.cos(rad)) >= Math.abs(Math.sin(rad));
        const span = (alongWidth ? roomDims.widthIn : roomDims.lengthIn) - WALL_MARGIN;
        len = Math.max(24, Math.min(len, span));
      }
      const run = buildDuctingHvacMesh(len, dia, carbon);
      g.add(run);
      // Ducting is FREE-MOVING: it stays at the placed footprint center with its
      // 2D heading — NO wall snapping. Only the height is fixed (mounted high near
      // the ceiling). Both ends are kept inside the room footprint. Display-only.
      if (roomDims?.widthIn && roomDims?.lengthIn) {
        // Mount just under the wall's TRUE top edge so the run hangs at the ceiling.
        const wallTop = ceilingIn * WALL_HEIGHT_MULT;
        const mountY = Math.max(0, wallTop - dia / 2 - 2);
        const D = Math.PI / 180;
        g.rotation.order = "YXZ";
        g.rotation.set((obj.rotationX || 0) * D, (obj.rotationDeg || 0) * D, (obj.rotationZ || 0) * D);
        // Pivot in place about the FOOTPRINT CENTER. The duct mesh is centered on the
        // group origin (built along local X, centered), and `len` is already capped to
        // the room span above — so the run can't poke through walls. NO post-rotation
        // wall-nudge: that nudge was shifting the group sideways on every rotate,
        // knocking the duct off its own axis and visually bumping neighbors.
        g.position.set((obj.pos?.x || 0) + size.w / 2, mountY, (obj.pos?.y || 0) + size.h / 2);
        g.updateMatrixWorld(true);
        return g;
      }
      run.position.y = Math.max(0, ceilingIn - dia / 2 - 6);
      break;
    }
    case "door": {
      // Doorway: just a slim frame (posts + header) around the SEE-THROUGH opening.
      // The wall itself is now cut open with a real door-shaped hole (see walls.js),
      // so no pane is needed — the frame outlines the actual opening. Built centered
      // on the local origin in the X–Y plane (z = 0) so it lies flat ON the wall
      // plane; the door is pinned flush to the nearest wall below.
      const w = obj.spec?.widthIn || size.w, h = 80, t = 4;
      const postGeo = new THREE.BoxGeometry(t, h, t);
      const left = new THREE.Mesh(postGeo, MAT.frame);
      left.position.set(-w / 2, h / 2, 0);
      const right = new THREE.Mesh(postGeo, MAT.frame);
      right.position.set(w / 2, h / 2, 0);
      const header = new THREE.Mesh(new THREE.BoxGeometry(w + t, t, t), MAT.frame);
      header.position.set(0, h, 0);
      g.add(left, right, header);
      // Pin the door FLUSH to the nearest wall, facing into the room. Falls back to
      // the old footprint-center placement when room dims are unavailable.
      pinDoorToWall(g, obj, roomDims);
      return g;
    }
    default:
      return null;
  }

  // Position the group at the object's footprint center (room-local), then rotate.
  positionEquipmentGroup(g, obj);
  return g;
}

// Pin a door group FLUSH onto the nearest room wall, in the wall plane, facing
// into the room — so there's no gap and the opening lines up with the wall it's
// snapped to. Mirrors the 2D nearest-wall detection (drawDoorSymbol). The door
// frame is authored flat in its local X–Y plane at z = 0, so we rotate it to lie
// in the chosen wall and translate its center onto that wall's plane.
function pinDoorToWall(g, obj, roomDims) {
  const size = smartObjectSize(obj);
  const cx = obj.pos.x + size.w / 2;  // door footprint center, room-local
  const cz = obj.pos.y + size.h / 2;
  if (!roomDims || !roomDims.widthIn || !roomDims.lengthIn) {
    // No room context — keep it standing at the footprint center (legacy behavior).
    g.position.set(cx, 0, cz);
    return g;
  }
  // Nearest wall (polygon-aware for merged / drawn rooms) + its coordinate.
  const { side: nearWall, coord } = doorWallLine(obj, roomDims);
  // Frame lies in local X–Y at z=0. Rotate about Y so the frame's width axis runs
  // ALONG the wall, and slide the center onto the wall plane.
  let px = cx, pz = cz, ry = 0;
  if (nearWall === "top")    { pz = coord; ry = 0; px = cx; }
  else if (nearWall === "bottom") { pz = coord; ry = Math.PI; px = cx; }
  else if (nearWall === "left")   { px = coord; ry = -Math.PI / 2; pz = cz; }
  else if (nearWall === "right")  { px = coord; ry = Math.PI / 2; pz = cz; }
  g.position.set(px, 0, pz);
  g.rotation.order = "YXZ";
  g.rotation.set(0, ry, 0);
  return g;
}

// Place a group at an object's room-local footprint center and apply its rotation.
// Shared by the procedural meshes above and the caller's fan GLB holder so both
// land in the exact same spot/orientation.
export function positionEquipmentGroup(g, obj) {
  const size = smartObjectSize(obj);
  const cx = obj.pos.x + size.w / 2;
  const cz = obj.pos.y + size.h / 2;
  g.position.set(cx, 0, cz);
  const D = Math.PI / 180;
  // Y = the 2D-driven heading (rotationDeg). X/Z are 3D-only tilt/roll. Apply in a
  // fixed YXZ order so presets/type-in map predictably to each ring.
  g.rotation.order = "YXZ";
  g.rotation.set((obj.rotationX || 0) * D, (obj.rotationDeg || 0) * D, (obj.rotationZ || 0) * D);
  return g;
}