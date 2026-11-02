import { computeStats } from "./autolayout";
import { DEFAULT_RATE } from "./electricityRates";

// Builds a client-ready CSV report of the room layout + power stats and triggers
// a download. Opens directly in Google Sheets or Excel. Read-only: derives
// everything from the current doc, never mutates it.
//
// Power math mirrors PowerUsagePanel: light count comes from computeStats
// (the same value the header stat shows), watts default 600, hours default 12.
export function exportRoomReportCsv(doc, { wattsPerLight = 600, hoursPerDay = 12, rate = DEFAULT_RATE } = {}) {
  const stats = computeStats(doc.room, doc.benches || []);
  const lightCount = stats.totalLights;

  const totalWatts = lightCount * wattsPerLight;
  const totalKw = totalWatts / 1000;
  const dailyKwh = totalKw * (hoursPerDay || 12);
  const monthlyKwh = dailyKwh * 30;
  const annualKwh = dailyKwh * 365;
  const r = typeof rate === "number" ? rate : DEFAULT_RATE;

  const roomW = Math.round(doc.room.widthIn / 12);
  const roomL = Math.round(doc.room.lengthIn / 12);
  const roomH = Math.round((doc.room.ceilingIn / 12) * 10) / 10;
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const money = (n) => Math.round(n).toLocaleString("en-US");

  const rows = [
    ["Grow Room Report"],
    ["Project", doc.name || ""],
    ["Customer", doc.customer || ""],
    ["Generated", new Date().toLocaleString("en-US")],
    [],
    ["Room Layout"],
    ["Room Size (ft)", `${roomW} x ${roomL}`],
    ["Ceiling Height (ft)", roomH],
    ["Total Benches", stats.totalBenches],
    ["Bench Width (ft)", stats.benchWidthFt === "mix" ? "Mix" : stats.benchWidthFt],
    ["Run Length (ft)", stats.benchLengthFt],
    ["Total Lights", lightCount],
    ["Planting Area (sqft)", stats.plantingAreaSqft],
    ["Total Area (sqft)", stats.totalAreaSqft],
    ["Utilization (%)", stats.efficiency],
    [],
    ["Power Usage"],
    ["Watts per Fixture (W)", wattsPerLight],
    ["Photoperiod (hours/day)", hoursPerDay || 12],
    ["Electricity Rate ($/kWh)", r],
    ["Total Draw (W)", num(totalWatts)],
    ["Total Draw (kW)", num(totalKw)],
    ["Daily Energy (kWh)", num(dailyKwh)],
    ["Monthly Energy (kWh)", num(monthlyKwh)],
    ["Annual Energy (kWh)", num(annualKwh)],
    ["Daily Cost ($)", money(dailyKwh * r)],
    ["Monthly Cost ($)", money(monthlyKwh * r)],
    ["Annual Cost ($)", money(annualKwh * r)],
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(doc.name || "grow-room").replace(/\s+/g, "_")}_report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}