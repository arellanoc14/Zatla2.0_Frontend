import { jsPDF } from "jspdf";
import { formatLength, sqft } from "@/lib/growroom/units";
import { BENCH_TYPES } from "@/lib/growroom/catalog";

// Grow Pros Solutions Sales Order PDF — matched to the reference estimate PDFs:
// company block top-left, big GrowPros logo top-right (green "Grow" + grey
// "Pros" with a leaf, wide-spaced SOLUTIONS), blue "Sales Order" title,
// three-column ADDRESS / SHIP TO / SALES ORDER-DATE grid, SALES REP row,
// #DCE9F1 table header with teal uppercase labels, airy rows with no dividers,
// full-width dashed separator, right-aligned totals ("T" tax-code amounts,
// bold $ total), grey Accepted By / Accepted Date labels, centered page
// numbers. Line items derive from the room's benches with placeholder SKUs and
// rates; fully client-side, never mutates the doc.

const TEAL = [62, 145, 198];         // #3E91C6 — title + table header text
const HEADER_FILL = [220, 233, 241]; // #DCE9F1 — table header fill
const GREY = [150, 155, 162];        // labels / light text
const DARK = [40, 44, 51];           // values / body text
const LOGO_GREEN = [106, 176, 68];
const LOGO_GREY = [109, 110, 113];

const COMPANY = {
  name: "Grow Pros Solutions",
  lines: ["5411 Daniels St", "Chino, CA  91710-9009 US", "(909) 203-2945", "info@wegrowpros.com", "www.wegrowpros.com"],
};

const typeLabel = (t) => BENCH_TYPES.find((x) => x.id === t)?.label || "Rolling";
const num = (n) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function exportRoomPdf(doc) {
  const units = doc.units || "imperial";
  const benches = doc.benches || [];

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const M = 40;
  const tableW = PW - M * 2;
  const contentBottom = PH - 80;

  const label = (txt, x, y, align = "left") => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...GREY);
    pdf.text(txt.toUpperCase(), x, y, { align });
  };
  const value = (txt, x, y, align = "left") => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...DARK);
    pdf.text(txt, x, y, { align });
  };

  // ── Header: company block (left) + logo (right) ──
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(30, 33, 38);
  pdf.text(COMPANY.name, M, 56);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...GREY);
  COMPANY.lines.forEach((ln, i) => pdf.text(ln, M, 71 + i * 12));

  drawLogo(pdf, PW - M, 78);

  // ── Title ──
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(16);
  pdf.setTextColor(...TEAL);
  pdf.text("Sales Order", M, 172);

  // ── Customer / order info grid (3 columns) ──
  const gridY = 196;
  const col2 = M + 215;
  const col3 = M + 430;
  const customer = doc.customer || doc.name || "";
  const orderNo = String(8000 + (Math.abs(hashStr(doc.name || "")) % 1000)); // placeholder
  const orderDate = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  label("Address", M, gridY);
  value(customer, M, gridY + 14);
  label("Ship To", col2, gridY);
  value(customer, col2, gridY + 14);

  // Right column: inline label + value pairs (like the reference)
  label("Sales Order", col3, gridY);
  value(orderNo, col3 + 76, gridY);
  label("Date", col3, gridY + 14);
  value(orderDate, col3 + 76, gridY + 14);

  // Second info row
  const row2Y = gridY + 66;
  label("Sales Rep", M, row2Y);
  value("—", M, row2Y + 12);
  label("Customer Phone Number", col2, row2Y);
  value("—", col2, row2Y + 12);
  label("Customer Email Address", col3, row2Y);
  value("—", col3, row2Y + 12);

  // ── Line item table ──
  const cols = {
    sku: M + 4,
    desc: M + 178,
    qty: M + tableW * 0.70,   // right-aligned
    rate: M + tableW * 0.83,  // right-aligned
    amount: M + tableW,       // right-aligned
  };
  const descW = cols.qty - 60 - cols.desc;

  const drawTableHeader = (y) => {
    pdf.setFillColor(...HEADER_FILL);
    pdf.rect(M, y, tableW, 20, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...TEAL);
    pdf.text("DESCRIPTION", cols.desc, y + 13.5);
    pdf.text("QTY", cols.qty, y + 13.5, { align: "right" });
    pdf.text("RATE", cols.rate, y + 13.5, { align: "right" });
    pdf.text("AMOUNT", cols.amount, y + 13.5, { align: "right" });
    return y + 32;
  };

  const items = buildLineItems(benches, units);
  let y = drawTableHeader(row2Y + 38);

  items.forEach((it) => {
    pdf.setFontSize(9);
    const skuLines = pdf.splitTextToSize(it.sku, cols.desc - cols.sku - 14);
    const descLines = pdf.splitTextToSize(it.desc, descW);
    const lineCount = Math.max(skuLines.length, descLines.length);
    const rowH = lineCount * 11.5 + 12;
    if (y + rowH > contentBottom) {
      pdf.addPage();
      y = drawTableHeader(56);
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...DARK);
    pdf.text(skuLines, cols.sku, y);
    pdf.text(descLines, cols.desc, y);
    pdf.text(String(it.qty), cols.qty, y, { align: "right" });
    pdf.text(num(it.rate), cols.rate, y, { align: "right" });
    pdf.text(`${num(it.amount)}T`, cols.amount, y, { align: "right" });
    y += rowH;
  });

  // ── Totals (right-aligned, dashed separators like the reference) ──
  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const tax = 0; // placeholder — pricing/tax to be wired later
  const total = subtotal + tax;
  if (y + 120 > contentBottom) {
    pdf.addPage();
    y = 64;
  }
  const dashed = (x1, x2, yy) => {
    pdf.setDrawColor(190, 194, 200);
    pdf.setLineWidth(0.6);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(x1, yy, x2, yy);
    pdf.setLineDashPattern([], 0);
  };
  const tLabelX = M + tableW * 0.47;
  dashed(M, M + tableW, y - 4); // full-width dashed line under the table
  y += 22;
  label("Subtotal", tLabelX, y);
  value(num(subtotal), cols.amount, y, "right");
  y += 22;
  label("Tax", tLabelX, y);
  value(num(tax), cols.amount, y, "right");
  y += 12;
  dashed(tLabelX, M + tableW, y);
  y += 22;
  label("Total", tLabelX, y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(20, 22, 26);
  pdf.text(`$${num(total)}`, cols.amount, y, { align: "right" });

  // ── Signature labels (subtle grey, no lines — like the reference) ──
  y += 60;
  if (y + 46 > contentBottom) {
    pdf.addPage();
    y = 64;
  }
  // Mixed-case grey labels, exactly like the reference.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...GREY);
  pdf.text("Accepted By", M, y);
  pdf.text("Accepted Date", M, y + 30);

  // ── Page numbers (centered, tiny grey) ──
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text(`Page ${i} of ${pages}`, PW / 2, PH - 34, { align: "center" });
  }

  savePdf(pdf, `${(doc.name || "grow-room").replace(/\s+/g, "_")}_sales_order.pdf`);
}

// jsPDF's pdf.save() relies on a synthetic anchor download that mobile browsers
// (notably iOS Safari and in-app webviews) silently ignore. On mobile we instead
// open the PDF as a blob URL so the native viewer takes over (view / share / save
// from there). Desktop keeps the direct file download.
function savePdf(pdf, filename) {
  // Build the PDF blob ourselves and trigger a real anchor-click download. This
  // is the most reliable path across desktop AND mobile (jsPDF's own pdf.save()
  // uses the same technique, but generating the blob URL here lets us fall back
  // to opening it inline when a download is blocked — e.g. iOS Safari / in-app
  // webviews, where the tab simply navigates to the native PDF viewer instead).
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Download blocked (some webviews) — open the PDF inline so it can still be
    // viewed / shared / saved from the native viewer.
    window.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Big GrowPros logo, right edge at xRight: green "Grow" + grey "Pros" with a
// leaf sprouting from the P, wide-spaced grey SOLUTIONS underneath.
function drawLogo(pdf, xRight, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(34);
  const growW = pdf.getTextWidth("Grow");
  const prosW = pdf.getTextWidth("Pros");
  const x0 = xRight - growW - prosW;
  pdf.setTextColor(...LOGO_GREEN);
  pdf.text("Grow", x0, y);
  pdf.setTextColor(...LOGO_GREY);
  pdf.text("Pros", x0 + growW, y);
  // Green leaf sprouting from the top of the P
  drawLeaf(pdf, x0 + growW + 10, y - 24);
  // Wide-spaced SOLUTIONS underneath
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(150, 155, 162);
  pdf.text("S O L U T I O N S", xRight - 4, y + 16, { align: "right" });
}

// Minimal 3-blade leaf in brand green.
function drawLeaf(pdf, cx, cy) {
  pdf.setFillColor(...LOGO_GREEN);
  pdf.triangle(cx, cy - 12, cx - 3, cy + 2, cx + 3, cy + 2, "F");        // center blade
  pdf.triangle(cx - 0.5, cy + 2, cx - 10, cy - 6, cx - 1, cy - 3, "F");  // left blade
  pdf.triangle(cx + 0.5, cy + 2, cx + 10, cy - 6, cx + 1, cy - 3, "F");  // right blade
}

// Group benches by type + footprint + tiers into line items with placeholder
// GPS-style SKUs and guessed rates (to be updated with real pricing later).
function buildLineItems(benches, units) {
  const map = new Map();
  benches.forEach((b) => {
    const type = b.type || "rolling";
    const tiers = Math.max(1, Math.round(b.tiers || 1));
    const key = `${type}|${b.widthIn}|${b.lengthIn}|${tiers}`;
    if (!map.has(key)) {
      const wFt = Math.round((b.widthIn || 0) / 12);
      const lFt = Math.round((b.lengthIn || 0) / 12);
      const tierTag = tiers === 3 ? "TT" : tiers === 2 ? "DT" : "ST";
      const prefix = type === "front" ? "FB" : "GPS";
      const sku = `${prefix}-${tierTag}-${wFt}X${lFt}-1FT`;
      const size = `${formatLength(b.widthIn, units)} x ${formatLength(b.lengthIn, units)}`;
      const tierWord = tiers === 3 ? "Triple Tier" : tiers === 2 ? "Double Tier" : "Single Tier";
      const desc = `GPS ${tierWord} ${typeLabel(type)} Bench; ${size};\nWheel is included.`;
      // Placeholder rate: ~$12.50 per sq ft of bench footprint, per tier.
      const rate = Math.round(sqft((b.widthIn || 0) * (b.lengthIn || 0)) * 12.5 * tiers);
      map.set(key, { sku, desc, qty: 0, rate, amount: 0 });
    }
    const it = map.get(key);
    it.qty += 1;
    it.amount = it.qty * it.rate;
  });
  return [...map.values()];
}

// Tiny stable hash for the placeholder order number.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}